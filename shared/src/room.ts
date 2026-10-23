import { ARENA_DEFS } from "./arenas.ts";
import { botName } from "./bot.ts";
import {
  DEFAULT_BOT_FILL, DEFAULT_MATCH_SECONDS, DT, MAX_PLAYERS, QUICK_LOBBY_SECONDS, RECONNECT_GRACE_SECONDS,
  RESULTS_SECONDS, SNAPSHOT_INTERVAL, TICK_RATE,
} from "./constants.ts";
import { KARTS } from "./karts.ts";
import { botLook, sanitizeLook } from "./cosmetics.ts";
import { EMOTES, safeName } from "./names.ts";
import { Match } from "./match.ts";
import { q2 } from "./math.ts";
import type { ClientMsg, LobbyPlayer, Phase, RoomInfo, RoomSettings, ServerMsg, Snapshot } from "./protocol.ts";

export interface Member {
  id: number;
  name: string;
  kart: string;
  bot: boolean;
  host: boolean;
  connected: boolean;
  rematch: boolean;
  slot: number;
  awayTicks: number;
  look: string;
  lastEmote?: number;
}

export type SendFn = (playerId: number, msg: ServerMsg) => void;

export const defaultSettings = (): RoomSettings => ({ arena: ARENA_DEFS[0].id, botFill: DEFAULT_BOT_FILL, botSkill: 1, seconds: DEFAULT_MATCH_SECONDS });

export function sanitizeSettings(base: RoomSettings, s: Partial<RoomSettings>): RoomSettings {
  const out = { ...base };
  if (typeof s.arena === "string" && ARENA_DEFS.some((a) => a.id === s.arena)) out.arena = s.arena;
  if (typeof s.botFill === "number") out.botFill = Math.max(1, Math.min(MAX_PLAYERS, Math.round(s.botFill)));
  if (s.botSkill === 0 || s.botSkill === 1 || s.botSkill === 2) out.botSkill = s.botSkill;
  if (typeof s.seconds === "number" && [60, 120, 180, 300].includes(s.seconds)) out.seconds = s.seconds;
  return out;
}

const cleanName = (n: unknown) => safeName(n);
const validKart = (k: unknown) => (typeof k === "string" && KARTS.some((x) => x.id === k) ? k : KARTS[0].id);

/**
 * One game room: lobby → countdown → playing → results → (next round | lobby).
 * Transport-agnostic: the Node server and the in-browser solo mode both drive it with tick().
 */
export class Room {
  phase: Phase = "lobby";
  members: Member[] = [];
  match: Match | null = null;
  settings: RoomSettings;
  onEmpty: (() => void) | null = null;
  private autoStart = -1;
  private resultsLeft = 0;
  private needsFull = new Set<number>();
  private botCounter = 0;
  private rounds = 0;
  private seed = 1;

  readonly code: string;
  readonly isPrivate: boolean;
  private send: SendFn;
  private nextId: () => number;

  constructor(code: string, isPrivate: boolean, settings: Partial<RoomSettings>, send: SendFn, nextId: () => number) {
    this.code = code;
    this.isPrivate = isPrivate;
    this.send = send;
    this.nextId = nextId;
    this.settings = sanitizeSettings(defaultSettings(), settings);
    this.seed = Math.floor(Math.random() * 1e9);
  }

  get humans() { return this.members.filter((m) => !m.bot); }
  get connectedHumans() { return this.members.filter((m) => !m.bot && m.connected); }

  /** Whether a quick-match player may drop into this room right now. */
  joinable() {
    if (this.isPrivate || this.humans.length >= MAX_PLAYERS) return false;
    if (this.phase === "lobby" || this.phase === "countdown") return true;
    return this.phase === "playing" && !!this.match && this.match.timeLeft > 40;
  }

  addHuman(id: number, name: string, kart: string, look?: string): Member {
    const m: Member = {
      id, name: cleanName(name), kart: validKart(kart), bot: false, host: !this.humans.some((h) => h.host),
      connected: true, rematch: false, slot: this.freeSlot(), awayTicks: 0, look: sanitizeLook(look),
    };
    this.members.push(m);
    if (this.match && (this.phase === "countdown" || this.phase === "playing")) {
      // drop-in: replace a bot if the room is full
      if (this.match.karts.size >= MAX_PLAYERS) {
        const bot = this.members.find((b) => b.bot);
        if (bot) this.removeMember(bot.id);
      }
      this.match.addKart({ id, name: m.name, kartId: m.kart, slot: m.slot, bot: false });
      this.sendMatch(m);
    }
    if (!this.isPrivate && this.phase === "lobby" && this.autoStart < 0) this.autoStart = QUICK_LOBBY_SECONDS;
    this.broadcastRoom();
    return m;
  }

  removeMember(id: number) {
    const i = this.members.findIndex((m) => m.id === id);
    if (i < 0) return;
    const [m] = this.members.splice(i, 1);
    this.match?.removeKart(id);
    if (m.host && !m.bot) {
      const next = this.humans.find((h) => h.connected) ?? this.humans[0];
      if (next) next.host = true;
    }
    if (!m.bot) {
      if (this.humans.length === 0) { this.onEmpty?.(); return; }
      this.broadcastRoom();
      this.maybeRematch();
    }
  }

  disconnect(id: number) {
    const m = this.members.find((x) => x.id === id);
    if (!m) return;
    m.connected = false;
    m.awayTicks = 0;
    this.match?.setDisconnected(id, true);
    if (m.host) {
      const next = this.humans.find((h) => h.connected);
      if (next) { m.host = false; next.host = true; }
    }
    this.broadcastRoom();
  }

  reconnect(id: number) {
    const m = this.members.find((x) => x.id === id);
    if (!m) return false;
    m.connected = true;
    this.match?.setDisconnected(id, false);
    this.broadcastRoom();
    if (this.match && this.phase !== "lobby") this.sendMatch(m);
    return true;
  }

  handle(id: number, msg: ClientMsg) {
    const m = this.members.find((x) => x.id === id);
    if (!m) return;
    switch (msg.t) {
      case "i":
        if (this.match && Array.isArray(msg.b) && typeof msg.s === "number") this.match.pushInputs(id, msg.s, msg.b.slice(0, 16));
        break;
      case "start":
        if (m.host && this.phase === "lobby") this.startMatch();
        break;
      case "settings":
        if (m.host && this.phase === "lobby") { this.settings = sanitizeSettings(this.settings, msg.settings ?? {}); this.broadcastRoom(); }
        break;
      case "kart":
        m.kart = validKart(msg.kart);
        if (msg.look !== undefined) m.look = sanitizeLook(msg.look);
        this.broadcastRoom();
        break;
      case "rematch":
        if (this.phase === "results") { m.rematch = true; this.broadcastRoom(); this.maybeRematch(); }
        break;
      case "ping":
        this.send(id, { t: "pong", c: msg.c, k: this.match?.tick ?? 0 });
        break;
      case "emote": {
        // emotes ride the snapshot event stream; at most one per second per player
        const i = Math.floor(Number(msg.i));
        const now = this.match?.tick ?? 0;
        if (this.match && i >= 0 && i < EMOTES.length && now - (m.lastEmote ?? -999) >= TICK_RATE) {
          m.lastEmote = now;
          this.match.events.push({ e: "emote", id, i });
        }
        break;
      }
    }
  }

  tick() {
    if (this.phase === "lobby" && this.autoStart >= 0) {
      const before = Math.ceil(this.autoStart);
      this.autoStart -= DT;
      if (this.autoStart <= 0) { this.autoStart = -1; this.startMatch(); }
      else if (Math.ceil(this.autoStart) !== before) this.broadcastRoom();
    }
    if (this.match && (this.phase === "countdown" || this.phase === "playing")) {
      this.match.step();
      if (this.phase === "countdown" && !this.match.frozen) { this.phase = "playing"; this.broadcastRoom(); }
      if (this.match.tick % SNAPSHOT_INTERVAL === 0) this.broadcastSnapshot();
      if (this.match.over) this.endMatch();
    } else if (this.phase === "results") {
      this.resultsLeft -= DT;
      if (this.resultsLeft <= 0) {
        if (this.isPrivate) { this.phase = "lobby"; this.match = null; this.broadcastRoom(); }
        else this.startMatch();
      }
    }
    for (const m of this.humans) {
      if (!m.connected && ++m.awayTicks > RECONNECT_GRACE_SECONDS * TICK_RATE) this.removeMember(m.id);
    }
  }

  // ------------------------------------------------------------------

  private freeSlot() {
    for (let s = 0; s < MAX_PLAYERS; s++) if (!this.members.some((m) => m.slot === s)) return s;
    return this.members.length % MAX_PLAYERS;
  }

  private maybeRematch() {
    const hs = this.connectedHumans;
    if (this.phase === "results" && hs.length > 0 && hs.every((h) => h.rematch)) this.startMatch();
  }

  startMatch() {
    if (this.connectedHumans.length === 0) return;
    for (const b of this.members.filter((x) => x.bot)) this.members.splice(this.members.indexOf(b), 1);
    // quick-play rooms rotate arenas between rounds
    if (!this.isPrivate && this.rounds > 0) {
      const i = ARENA_DEFS.findIndex((a) => a.id === this.settings.arena);
      this.settings.arena = ARENA_DEFS[(i + 1) % ARENA_DEFS.length].id;
    }
    this.rounds++;
    const target = Math.min(MAX_PLAYERS, Math.max(this.settings.botFill, this.humans.length));
    for (let n = this.humans.length; n < target; n++) {
      this.members.push({
        id: this.nextId(), name: botName(this.botCounter++), kart: KARTS[(this.botCounter * 7) % KARTS.length].id, bot: true,
        host: false, connected: true, rematch: false, slot: this.freeSlot(), awayTicks: 0, look: botLook(this.botCounter),
      });
    }
    this.match = new Match(this.settings.arena, this.settings.seconds, this.seed++, this.settings.botSkill);
    for (const m of this.members) {
      m.rematch = false;
      this.match.addKart({ id: m.id, name: m.name, kartId: m.kart, slot: m.slot, bot: m.bot, skill: this.settings.botSkill });
      if (!m.bot && !m.connected) this.match.setDisconnected(m.id, true);
    }
    this.phase = "countdown";
    this.autoStart = -1;
    for (const m of this.connectedHumans) this.sendMatch(m);
    this.broadcastRoom();
  }

  private sendMatch(m: Member) {
    const match = this.match!;
    this.send(m.id, {
      t: "match", arena: match.arena.id, seconds: this.settings.seconds, countdown: match.countdown, tick: match.tick, you: m.id,
      roster: this.members.map((x) => ({ id: x.id, name: x.name, kart: x.kart, slot: x.slot, bot: x.bot, look: x.look })),
    });
    this.needsFull.add(m.id);
    this.send(m.id, { t: "score", rows: match.scoreRows() });
  }

  private endMatch() {
    this.broadcastSnapshot();
    this.phase = "results";
    this.resultsLeft = RESULTS_SECONDS;
    const looks = new Map(this.members.map((m) => [m.id, m.look]));
    const rows = this.match!.results().map((r) => ({ ...r, look: looks.get(r.id) ?? r.look }));
    for (const m of this.connectedHumans) this.send(m.id, { t: "results", rows, next: RESULTS_SECONDS });
    this.broadcastRoom();
  }

  private broadcastSnapshot() {
    const match = this.match!;
    const p = match.kartRows();
    const j = match.projRows();
    const ev = match.events.length ? match.events.splice(0) : undefined;
    const cr = match.cratesDirty ? match.crateBits() : undefined;
    const nt = match.nitrosDirty ? match.nitroBits() : undefined;
    match.cratesDirty = match.nitrosDirty = false;
    const tl = q2(match.timeLeft), cd = q2(match.countdown);
    if (match.scoreDirty) {
      match.scoreDirty = false;
      const rows = match.scoreRows();
      for (const m of this.connectedHumans) this.send(m.id, { t: "score", rows });
    }
    for (const m of this.connectedHumans) {
      const full = this.needsFull.has(m.id);
      const snap: Snapshot = { t: "s", k: match.tick, a: match.ackFor(m.id), tl, cd, p, j, me: match.meRow(m.id) };
      if (ev) snap.ev = ev;
      if (cr || full) snap.cr = cr ?? match.crateBits();
      if (nt || full) snap.nt = nt ?? match.nitroBits();
      this.send(m.id, snap);
    }
    this.needsFull.clear();
  }

  info(): RoomInfo {
    const players: LobbyPlayer[] = this.members.map((m) => ({ id: m.id, name: m.name, kart: m.kart, bot: m.bot, host: m.host, connected: m.connected, rematch: m.rematch, slot: m.slot, look: m.look }));
    return { code: this.code, isPrivate: this.isPrivate, phase: this.phase, settings: this.settings, players, autoStart: this.autoStart >= 0 ? Math.ceil(this.autoStart) : -1 };
  }

  broadcastRoom() {
    const room = this.info();
    for (const m of this.connectedHumans) this.send(m.id, { t: "room", room, you: m.id });
  }
}
