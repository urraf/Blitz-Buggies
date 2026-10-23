import {
  Btn, DT, getArena, itemName, WEAPONS, INPUT_SEND_INTERVAL, INTERP_DELAY_TICKS, Item, KEv, KFlag, kartById, KARTS, lerp, lerpAngle,
  newKartPhys, PHYS_FIELDS, Proj, stepKart, paintColor, unpackPhys, forwardSpeed, isBoosting, lateralSpeed, groundAt, wrapAngle,
  type Arena, type ClientMsg, type GameEvent, type KartPhys, type KartRow, type ProjRow, type ResultRow, type RoomInfo,
  type RoomSettings, type ServerMsg, type Snapshot,
} from "../../../shared/src/index.ts";
import { sfx } from "../audio/sfx.ts";
import { LocalTransport, readToken, WsTransport, type NetStatus, type Transport } from "../net/transport.ts";
import { input } from "./input.ts";
import { portal } from "./portal.ts";
import { settings } from "./settings.ts";
import { progress, type MatchStats, type Reward } from "./progress.ts";

export type Screen = "menu" | "lobby" | "game" | "results";

export interface RosterEntry { id: number; name: string; kart: string; slot: number; bot: boolean; color: string; look: string }
export interface ScoreRow { id: number; name: string; score: number; kills: number; deaths: number; color: string; you: boolean }
export interface FeedItem { id: number; killer: string; victim: string; item: number; killerColor: string; victimColor: string; you: boolean; t: number }
export interface Banner { id: number; text: string; sub?: string; tone: "good" | "bad" | "info" | "epic" | "stamp" }
/** Floating 3D text (damage numbers, +1). */
export interface Popup { id: number; text: string; color: string; x: number; y: number; z: number; t0: number; big: boolean }
/** Who wrecked you, for the death card. */
export interface KillerInfo { name: string; color: string; look: string; kart: string; item: number; bot: boolean }

export interface Hud {
  hp: number; maxHp: number; boost: number; item: number; ammo: number;
  shield: number; overdrive: number; spawnShield: number; alive: boolean; respawnIn: number; killer: string; killerWeapon: string;
  killerInfo: KillerInfo | null; firedThisMatch: boolean;
  timeLeft: number; countdown: number; speed: number; ping: number; fps: number;
  rank: number; players: number; score: number; hurt: number; hitmark: number; loading: boolean; drift: number;
}

export interface UiState {
  screen: Screen;
  status: NetStatus | "idle";
  mode: "online" | "local" | null;
  room: RoomInfo | null;
  you: number;
  arena: string;
  roster: Map<number, RosterEntry>;
  hud: Hud;
  scores: ScoreRow[];
  results: ResultRow[] | null;
  reward: Reward | null;
  resultsAt: number;
  resultsNext: number;
  feed: FeedItem[];
  banner: Banner | null;
  toast: Banner | null;
  error: string | null;
  paused: boolean;
}

/** Interpolated, render-ready kart (own kart uses prediction). */
export interface RenderKart {
  id: number; x: number; y: number; z: number; yaw: number;
  hp: number; flags: number; item: number; drift: number; speed: number;
  /** sideways slide speed (m/s), smoothed steering (-1..1), forward acceleration, floor height under the kart */
  slip: number; steer: number; accel: number; groundY: number;
  visible: boolean; color: string; kart: string;
}
export interface RenderProj { id: number; kind: number; x: number; y: number; z: number; vx: number; vz: number; owner: number }
export type FxEvent = GameEvent | { e: "localkev"; bits: number } | { e: "muzzle"; id: number; item: number } | { e: "celebrate"; id: number };

interface SnapBuf { k: number; karts: Map<number, KartRow>; projs: Map<number, ProjRow> }

const emptyHud = (): Hud => ({
  hp: 100, maxHp: 100, boost: 60, item: 0, ammo: 0, shield: 0, overdrive: 0, spawnShield: 0, alive: true, respawnIn: 0, killer: "", killerWeapon: "", killerInfo: null, firedThisMatch: false,
  timeLeft: 0, countdown: 0, speed: 0, ping: 0, fps: 0, rank: 1, players: 1, score: 0, hurt: 0, hitmark: 0, loading: true, drift: 0,
});

class Store<T> {
  private state: T;
  private ls = new Set<() => void>();
  constructor(s: T) { this.state = s; }
  get = () => this.state;
  subscribe = (fn: () => void) => { this.ls.add(fn); return () => { this.ls.delete(fn); }; };
  set(patch: Partial<T>) { this.state = { ...this.state, ...patch }; for (const l of this.ls) l(); }
}

const STREAK_NAMES: Record<number, string> = { 3: "ON FIRE!", 5: "UNSTOPPABLE!", 7: "BUGGY LEGEND!", 10: "GODLIKE GEARS!" };
const COMBO_NAMES: Record<number, string> = { 2: "DOUBLE SMASH!", 3: "TRIPLE SMASH!", 4: "QUAD SMASH!", 5: "SMASH-TASTIC!" };

export class GameClient {
  readonly ui = new Store<UiState>({
    screen: "menu", status: "idle", mode: null, room: null, you: -1, arena: "isle", roster: new Map(), hud: emptyHud(),
    scores: [], results: null, reward: null, resultsAt: 0, resultsNext: 0, feed: [], banner: null, toast: null, error: null, paused: false,
  });

  // ---- frame state read by the renderer every frame (never put in React state)
  arena: Arena = getArena("isle");
  readonly karts = new Map<number, RenderKart>();
  readonly projs: RenderProj[] = [];
  crates: boolean[] = [];
  nitros: boolean[] = [];
  readonly fx: FxEvent[] = [];
  shake = 0;
  /** weapon kick for the camera (0..1), decays quickly */
  recoil = 0;
  /** floating texts in the world (read by the scene) */
  readonly popups: Popup[] = [];
  /** last time each kart took damage (hit flash) */
  readonly hitFlash = new Map<number, number>();
  /** active emote per kart: emote index + start time */
  readonly emotes = new Map<number, { i: number; t: number }>();
  /** this match's stats for missions */
  stats: MatchStats = { kills: 0, byItem: {}, pickups: 0, bestStreak: 0, lavaPushes: 0 };
  private popupId = 0;
  private comboCount = 0;
  private lastOwnKill = -1e9;
  private killerInfo: KillerInfo | null = null;
  private fired = false;
  private slowFrames = 0;
  private fpsWindow: number[] = [];
  spectate = -1;
  matchEpoch = 0;

  private transport: Transport | null = null;
  private pred: KartPhys = newKartPhys(0, 0, 0);
  private prev = { x: 0, y: 0, z: 0, yaw: 0 };
  private offset = { x: 0, y: 0, z: 0, yaw: 0 };
  private alive = false;
  private havePred = false;
  private seq = 0;
  private pending: { seq: number; bits: number }[] = [];
  private batch: number[] = [];
  private batchStart = 1;
  private acc = 0;
  private tickCount = 0;
  private snaps: SnapBuf[] = [];
  private estTick = 0;
  private frozen = true;
  private lastCd = 0;
  private me: number[] | null = null;
  private lastBits = 0;
  private hudTimer = 0;
  private fpsFrames = 0;
  private fpsTime = 0;
  private pingTimer = 0;
  private rtt = 0;
  private bannerId = 0;
  private scoreRaw: [number, number, number, number][] = [];
  private hurtCount = 0;
  private hitCount = 0;
  private killerName = "";
  private killerWeapon = "";
  private gotFirstSnap = false;
  private frameDt = 0;

  // ------------------------------------------------------------------ connection / lobby API

  private handlers = {
    onMessage: (m: ServerMsg) => this.onMessage(m),
    onStatus: (s: NetStatus) => this.ui.set({ status: s }),
  };

  private hello = (): ClientMsg => ({ t: "hello", name: this.playerName(), kart: settings.get().kart, look: settings.get().look });
  /** recent fire time per kart (drives minigun spin / recoil on the mounted weapon) */
  readonly lastFire = new Map<number, number>();

  playerName() { return settings.get().name.trim() || "Racer"; }

  private online(): Transport {
    if (this.transport?.kind !== "online") {
      this.transport?.close();
      this.transport = new WsTransport(this.handlers, this.hello);
      this.ui.set({ mode: "online" });
    }
    return this.transport;
  }

  /** After a page reload, re-attach to the match we were in (the server keeps our kart for a grace period). */
  resume() { if (readToken() && readToken() !== "local") this.online(); }

  /** Portal ad opportunity before heading into a match (a solo game pauses while an ad plays). */
  private adBreak() { return portal.commercialBreak((p) => this.transport?.setPaused?.(p)); }

  // the socket starts connecting (and waking a sleeping server) while any ad plays
  quickPlay() { sfx.unlock(); this.ui.set({ error: null }); const t = this.online(); void this.adBreak().then(() => t.send({ t: "quick" })); }
  createRoom(s: Partial<RoomSettings>) { sfx.unlock(); this.ui.set({ error: null }); const t = this.online(); void this.adBreak().then(() => t.send({ t: "create", settings: s })); }
  joinRoom(code: string) { sfx.unlock(); this.ui.set({ error: null }); const t = this.online(); void this.adBreak().then(() => t.send({ t: "join", code })); }

  startSolo(s: Partial<RoomSettings>) {
    sfx.unlock();
    void this.adBreak().then(() => {
      this.transport?.close();
      this.ui.set({ mode: "local", error: null });
      this.transport = new LocalTransport(this.handlers, this.playerName(), settings.get().kart, s, settings.get().look);
    });
  }

  startMatch() { this.transport?.send({ t: "start" }); }
  updateRoomSettings(s: Partial<RoomSettings>) { this.transport?.send({ t: "settings", settings: s }); }
  rematch() { void this.adBreak().then(() => this.transport?.send({ t: "rematch" })); }
  setKart(kart: string) { settings.update({ kart }); this.transport?.send({ t: "kart", kart, look: settings.get().look }); }
  setLook(look: string) { settings.update({ look }); this.transport?.send({ t: "kart", kart: settings.get().kart, look }); }

  leave() {
    input.enabled = false;
    if (this.transport?.kind === "local") { this.transport.close(); this.transport = null; this.toMenu(); return; }
    this.transport?.send({ t: "leave" });
    this.toMenu();
  }

  setPaused(p: boolean) {
    this.ui.set({ paused: p });
    input.enabled = !p && this.ui.get().screen === "game";
    if (p) { input.clear(); portal.gameplayStop(); }
    this.transport?.setPaused?.(p);
  }

  /** Dev/test hook (solo only): let a bot brain drive our kart to exercise pickups and weapons. */
  autopilot = false;
  setAutopilot(on: boolean) {
    if (this.transport?.kind !== "local") return;
    this.autopilot = on;
    (this.transport as LocalTransport).room.match?.setDisconnected(this.ui.get().you, on);
  }

  /** Dev/test hook (solo only): put an item in our kart's slot. */
  debugGive(item: number) {
    if (this.transport?.kind !== "local") return;
    const k = (this.transport as LocalTransport).room.match?.karts.get(this.ui.get().you);
    if (!k) return;
    k.item = item as typeof k.item;
    k.ammo = WEAPONS[item as keyof typeof WEAPONS]?.ammo ?? 1;
  }

  /** Dev/test hook: drop the websocket to exercise reconnect. */
  simulateDrop() { (this.transport as WsTransport | null)?.simulateDrop?.(); }

  private toMenu() {
    portal.gameplayStop();
    this.ui.set({ screen: "menu", room: null, results: null, reward: null, paused: false, banner: null });
  }

  // ------------------------------------------------------------------ message handling

  private onMessage(m: ServerMsg) {
    switch (m.t) {
      case "welcome": {
        const s = this.ui.get();
        // a different id after reconnecting means the server forgot us (restart / grace expired)
        if (this.transport?.kind === "online" && s.you !== -1 && m.id !== s.you && s.screen !== "menu") {
          input.enabled = false;
          this.ui.set({ you: m.id, screen: "menu", room: null, results: null, paused: false, error: "Lost the connection to your match. Please join again." });
          break;
        }
        this.ui.set({ you: m.id });
        break;
      }
      case "room": {
        const s = this.ui.get();
        const patch: Partial<UiState> = { room: m.room, you: m.you };
        if (m.room.phase === "lobby" && s.screen !== "lobby") { patch.screen = "lobby"; input.enabled = false; }
        // pick up players who joined mid-match
        if (s.screen === "game" || s.screen === "results") {
          const roster = new Map(s.roster);
          for (const p of m.room.players) {
            if (!roster.has(p.id)) roster.set(p.id, { id: p.id, name: p.name, kart: p.kart, slot: p.slot, bot: p.bot, look: p.look, color: paintColor(p.look) });
          }
          patch.roster = roster;
        }
        this.ui.set(patch);
        break;
      }
      case "left":
        this.toMenu();
        break;
      case "match":
        this.beginMatch(m);
        break;
      case "s":
        this.onSnapshot(m);
        break;
      case "score":
        this.scoreRaw = m.rows;
        this.refreshScores();
        break;
      case "results": {
        input.enabled = false;
        portal.gameplayStop();
        const rank = m.rows.findIndex((r) => r.id === this.ui.get().you) + 1;
        if (rank === 1) sfx.victory(); else sfx.defeat();
        const reward = progress.award(m.rows, this.ui.get().you, this.stats);
        if (reward?.missions.length) setTimeout(() => sfx.coins(), 700);
        if (reward?.levelUp) setTimeout(() => sfx.levelUp(), 1200);
        settings.update({ tutorialSeen: settings.get().tutorialSeen + 1 });
        this.ui.set({ screen: "results", results: m.rows, reward, resultsAt: performance.now(), resultsNext: m.next, paused: false });
        break;
      }
      case "pong":
        this.rtt = performance.now() - m.c;
        break;
      case "err":
        this.ui.set({ error: m.msg });
        break;
    }
  }

  private beginMatch(m: Extract<ServerMsg, { t: "match" }>) {
    this.arena = getArena(m.arena);
    this.stats = { kills: 0, byItem: {}, pickups: 0, bestStreak: 0, lavaPushes: 0 };
    this.popups.length = 0;
    this.hitFlash.clear();
    this.emotes.clear();
    this.comboCount = 0;
    this.killerInfo = null;
    this.fired = false;
    this.matchEpoch++;
    const roster = new Map<number, RosterEntry>();
    for (const r of m.roster) roster.set(r.id, { ...r, color: paintColor(r.look) });
    this.karts.clear();
    this.projs.length = 0;
    this.snaps.length = 0;
    this.pending.length = 0;
    this.batch.length = 0;
    this.fx.length = 0;
    this.crates = this.arena.crates.map(() => true);
    this.nitros = this.arena.nitros.map(() => true);
    this.havePred = false;
    this.gotFirstSnap = false;
    this.spectate = -1;
    this.estTick = m.tick;
    this.lastCd = m.countdown;
    this.frozen = m.countdown > 0;
    this.scoreRaw = [];
    input.enabled = true;
    input.clear();
    this.ui.set({
      screen: "game", arena: m.arena, you: m.you, roster, results: null, feed: [], banner: null, toast: null, paused: false,
      hud: { ...emptyHud(), timeLeft: m.seconds, countdown: m.countdown, loading: true },
    });
  }

  private onSnapshot(s: Snapshot) {
    const you = this.ui.get().you;
    // jitter-tolerant server clock estimate used for interpolation
    if (!this.gotFirstSnap || Math.abs(this.estTick - s.k) > 12) this.estTick = s.k;
    else this.estTick += (s.k - this.estTick) * 0.1;
    const buf: SnapBuf = { k: s.k, karts: new Map(), projs: new Map() };
    for (const r of s.p) buf.karts.set(r[0], r);
    for (const p of s.j) buf.projs.set(p[0], p);
    this.snaps.push(buf);
    if (this.snaps.length > 40) this.snaps.shift();
    if (s.cr) this.crates = [...s.cr].map((c) => c === "1");
    if (s.nt) this.nitros = [...s.nt].map((c) => c === "1");
    this.frozen = s.cd > 0;
    if (Math.ceil(s.cd) !== Math.ceil(this.lastCd)) {
      if (s.cd > 0) sfx.beep(false);
      else { sfx.beep(true); this.showBanner("GO!", undefined, "epic"); }
    }
    this.lastCd = s.cd;

    if (s.me) this.reconcile(s.me, s.a);
    if (s.ev) for (const e of s.ev) this.onEvent(e, you);

    const h = this.ui.get().hud;
    if (!this.gotFirstSnap) {
      this.gotFirstSnap = true;
      this.ui.set({ hud: { ...h, loading: false } });
    }
    h.timeLeft = s.tl;
    h.countdown = s.cd;
  }

  private reconcile(me: number[], ack: number) {
    const wasAlive = this.alive;
    this.me = me;
    this.alive = me[PHYS_FIELDS + 6] === 1;
    const oldX = this.pred.x, oldY = this.pred.y, oldZ = this.pred.z, oldYaw = this.pred.yaw;
    unpackPhys(me, this.pred);
    while (this.pending.length && this.pending[0].seq <= ack) this.pending.shift();
    if (this.alive && !this.frozen && !this.autopilot) {
      const stats = this.myStats();
      for (const p of this.pending) stepKart(this.pred, p.bits, stats, this.arena, DT);
    }
    const ex = oldX - this.pred.x, ey = oldY - this.pred.y, ez = oldZ - this.pred.z;
    if (!this.havePred || !wasAlive || !this.alive || ex * ex + ez * ez > 25) {
      this.offset.x = this.offset.y = this.offset.z = this.offset.yaw = 0;
      this.prev.x = this.pred.x; this.prev.y = this.pred.y; this.prev.z = this.pred.z; this.prev.yaw = this.pred.yaw;
      this.havePred = true;
    } else {
      // hide the correction by blending it out over a few frames
      this.offset.x += ex; this.offset.y += ey; this.offset.z += ez;
      this.offset.yaw += oldYaw - this.pred.yaw;
    }
  }

  private myStats() {
    const r = this.ui.get().roster.get(this.ui.get().you);
    return kartById(r?.kart ?? settings.get().kart);
  }

  private name(id: number) { return this.ui.get().roster.get(id)?.name ?? "???"; }
  private color(id: number) { return this.ui.get().roster.get(id)?.color ?? "#fff"; }

  private onEvent(e: GameEvent, you: number) {
    const lp = this.karts.get(you);
    const dist = (x: number, z: number) => (lp ? Math.hypot(lp.x - x, lp.z - z) : 0);
    switch (e.e) {
      case "fire": {
        this.lastFire.set(e.id, performance.now());
        if (e.id === you) break; // own shots already played locally
        const k = this.karts.get(e.id);
        const d = k ? dist(k.x, k.z) : 50;
        if (e.item === Item.Blaster) sfx.zap(d);
        else if (e.item === Item.Rocket) sfx.rocket(d);
        else if (e.item === Item.Hornet || e.item === Item.Triple) sfx.hornet(d);
        else if (e.item === Item.Lobber || e.item === Item.Cannon) sfx.lob(d);
        else if (e.item === Item.Mine) sfx.mineDrop(d);
        this.fx.push({ e: "muzzle", id: e.id, item: e.item });
        break;
      }
      case "hit":
        if (e.dmg > 0) this.hitFlash.set(e.id, performance.now());
        if (e.by === you && e.id !== you && e.dmg > 0) this.popup(`-${e.dmg}`, e.dmg >= 50 ? "#ff5d5d" : "#ffe066", e.x, e.y + 1.2, e.z, false);
        if (e.id === you && e.dmg > 0) {
          sfx.hurt();
          this.hurtCount++;
          this.addShake(0.35 + e.dmg / 80);
        } else if (e.by === you && e.id !== you) {
          if (e.dmg > 0) { sfx.hitmarker(); this.hitCount++; } else sfx.blocked();
        }
        this.fx.push(e);
        break;
      case "boom": {
        const d = dist(e.x, e.z);
        if (e.kind === Proj.Bolt) sfx.spark(d);
        else { sfx.boom(e.r, d); if (d < 25) this.addShake((1 - d / 25) * (0.3 + e.r * 0.12)); }
        this.fx.push(e);
        break;
      }
      case "kill": {
        const feed = [{ id: ++this.bannerId, killer: e.by >= 0 && e.by !== e.id ? this.name(e.by) : "", victim: this.name(e.id), item: e.item, killerColor: this.color(e.by), victimColor: this.color(e.id), you: e.by === you || e.id === you, t: performance.now() }, ...this.ui.get().feed].slice(0, 6);
        this.ui.set({ feed });
        if (e.by === you && e.id !== you) {
          // combo window: wrecks within 4 s of each other chain into Double / Triple Smash
          const now = performance.now();
          this.comboCount = now - this.lastOwnKill < 4000 ? this.comboCount + 1 : 1;
          this.lastOwnKill = now;
          this.stats.kills++;
          this.stats.byItem[e.item] = (this.stats.byItem[e.item] ?? 0) + 1;
          if (e.item === Item.Lava) this.stats.lavaPushes++;
          this.stats.bestStreak = Math.max(this.stats.bestStreak, e.streak);
          const victim = this.karts.get(e.id);
          if (victim) this.popup("+1", "#ffd23f", victim.x, victim.y + 2.6, victim.z, true);
          this.fx.push({ e: "celebrate", id: e.id });
          const combo = COMBO_NAMES[Math.min(this.comboCount, 5)];
          const streak = STREAK_NAMES[e.streak];
          const title = e.first ? "FIRST BLOOD!" : e.shutdown ? "SHUTDOWN!" : e.revenge ? "REVENGE!" : combo ?? streak ?? "SMASHED!";
          const sub = `You wrecked ${this.name(e.id)}${e.item === Item.Lava ? " into the lava!" : ""}`;
          if (combo || streak || e.first || e.shutdown) sfx.streak(); else sfx.kill();
          this.showBanner(title, sub, "stamp");
          this.addShake(0.25);
        }
        if (e.id === you) {
          sfx.wrecked();
          this.killerName = e.by !== you ? this.name(e.by) : "";
          this.killerWeapon = itemName(e.item);
          const kr = this.ui.get().roster.get(e.by);
          this.killerInfo = e.by !== you && kr ? { name: kr.name, color: kr.color, look: kr.look, kart: kr.kart, item: e.item, bot: kr.bot } : e.item === Item.Lava ? { name: "", color: "#ff7b00", look: "", kart: "", item: Item.Lava, bot: false } : null;
          this.spectate = e.by !== you ? e.by : -1;
          this.addShake(1);
        }
        this.fx.push(e);
        break;
      }
      case "spawn":
        if (e.id === you) { this.spectate = -1; this.havePred = false; sfx.spawn(); }
        this.fx.push(e);
        break;
      case "pickup":
        if (e.id === you) this.stats.pickups++;
        if (e.id === you) {
          const powers: Record<number, string> = { [Item.Shield]: "Bubble Shield!", [Item.Overdrive]: "Turbo!", [Item.Patch]: "Patched up +50" };
          if (powers[e.item]) { sfx.powerup(); this.showToast(powers[e.item]); }
          else sfx.pickup();
        }
        this.fx.push(e);
        break;
      case "nitro":
        if (e.id === you) sfx.nitro();
        this.fx.push(e);
        break;
      case "kev":
        if (e.id !== you) this.fx.push(e);
        break;
      case "msg":
        this.showToast(e.text);
        break;
      case "emote":
        this.emotes.set(e.id, { i: e.i, t: performance.now() });
        if (e.id === you || dist(this.karts.get(e.id)?.x ?? 999, this.karts.get(e.id)?.z ?? 999) < 50) sfx.click();
        break;
    }
  }

  popup(text: string, color: string, x: number, y: number, z: number, big: boolean) {
    this.popups.push({ id: ++this.popupId, text, color, x, y, z, t0: performance.now(), big });
    if (this.popups.length > 24) this.popups.shift();
  }

  emote(i: number) {
    if (this.ui.get().screen !== "game") return;
    this.transport?.send({ t: "emote", i });
  }

  private addShake(v: number) { if (settings.get().shake) this.shake = Math.min(1.5, this.shake + v); }

  showBanner(text: string, sub: string | undefined, tone: Banner["tone"]) {
    const b = { id: ++this.bannerId, text, sub, tone };
    this.ui.set({ banner: b });
    setTimeout(() => { if (this.ui.get().banner?.id === b.id) this.ui.set({ banner: null }); }, 1800);
  }

  showToast(text: string) {
    const b = { id: ++this.bannerId, text, tone: "info" as const };
    this.ui.set({ toast: b });
    setTimeout(() => { if (this.ui.get().toast?.id === b.id) this.ui.set({ toast: null }); }, 1600);
  }

  private refreshScores() {
    const s = this.ui.get();
    const rows: ScoreRow[] = this.scoreRaw.map(([id, score, kills, deaths]) => ({
      id, score, kills, deaths, name: this.name(id), color: this.color(id), you: id === s.you,
    }));
    rows.sort((a, b) => b.score - a.score || a.deaths - b.deaths);
    this.ui.set({ scores: rows });
  }

  // ------------------------------------------------------------------ per-frame update (called by the renderer)

  frame(dtReal: number) {
    const s = this.ui.get();
    if (s.screen !== "game" && s.screen !== "results") return;
    const dt = Math.min(0.25, dtReal);

    // fixed-step local simulation: sample input, predict own kart, batch inputs to the server
    this.acc += dt;
    const stats = this.myStats();
    while (this.acc >= DT) {
      this.acc -= DT;
      this.tickCount++;
      this.estTick += 1;
      const bits = s.screen === "game" && !s.paused ? input.sample() : 0;
      if (bits !== 0) portal.gameplayStart(); // portals count play from the first real input
      this.seq++;
      if (this.batch.length === 0) this.batchStart = this.seq;
      this.batch.push(bits);
      this.pending.push({ seq: this.seq, bits });
      if (this.pending.length > 180) this.pending.shift();
      if (this.havePred && this.alive && !this.frozen && !this.autopilot) {
        this.prev.x = this.pred.x; this.prev.y = this.pred.y; this.prev.z = this.pred.z; this.prev.yaw = this.pred.yaw;
        const kev = stepKart(this.pred, bits, stats, this.arena, DT);
        if (kev) this.onLocalKev(kev);
        this.localFire(bits);
      }
      this.lastBits = bits;
      if (this.batch.length >= INPUT_SEND_INTERVAL) {
        this.transport?.send({ t: "i", s: this.batchStart, b: this.batch });
        this.batch = [];
      }
    }
    const alpha = this.acc / DT;
    this.frameDt = dt;
    const decay = Math.exp(-12 * dt);
    this.offset.x *= decay; this.offset.y *= decay; this.offset.z *= decay; this.offset.yaw *= decay;
    this.shake *= Math.exp(-4 * dt);
    this.recoil *= Math.exp(-9 * dt);

    this.interpolate(alpha, s.you);

    if ((this.pingTimer -= dt) <= 0) {
      this.pingTimer = 2;
      if (this.transport?.kind === "online") this.transport.send({ t: "ping", c: performance.now() });
    }
    this.fpsFrames++;
    this.fpsTime += dtReal;
    if ((this.hudTimer -= dt) <= 0) {
      this.hudTimer = 1 / 15;
      this.pushHud();
    }
  }

  private localFire(bits: number) {
    // immediate audio feedback for our own shots; projectiles themselves come from the server
    const me = this.me;
    if (!me) return;
    const item = me[PHYS_FIELDS + 1], ammo = me[PHYS_FIELDS + 2];
    if (!item || ammo <= 0) return;
    const pressed = (bits & Btn.Fire) !== 0 && !(this.lastBits & Btn.Fire);
    const you = this.ui.get().you;
    if (item === Item.Blaster) {
      if (bits & Btn.Fire && this.tickCount % 4 === 0) {
        sfx.zap();
        this.fired = true;
        this.lastFire.set(you, performance.now());
        this.fx.push({ e: "muzzle", id: you, item });
        this.recoil = Math.min(1, this.recoil + 0.12);
        if (settings.get().shake) this.shake = Math.min(1.5, this.shake + 0.04);
      }
    } else if (pressed) {
      this.lastFire.set(you, performance.now());
      this.fired = true;
      this.fx.push({ e: "muzzle", id: you, item });
      const punch: Record<number, number> = { [Item.Rocket]: 0.7, [Item.Cannon]: 1, [Item.Lobber]: 0.6, [Item.Triple]: 0.6, [Item.Hornet]: 0.5, [Item.Mine]: 0.15 };
      this.recoil = Math.min(1, this.recoil + (punch[item] ?? 0.4));
      this.addShake((punch[item] ?? 0.4) * 0.35);
      if (item === Item.Rocket) sfx.rocket();
      else if (item === Item.Hornet || item === Item.Triple) sfx.hornet();
      else if (item === Item.Lobber || item === Item.Cannon) sfx.lob();
      else if (item === Item.Mine) sfx.mineDrop();
    }
  }

  private onLocalKev(kev: number) {
    if (kev & KEv.Hop) sfx.hop();
    if (kev & KEv.Land) sfx.land();
    if (kev & KEv.Wall) { sfx.bump(); this.addShake(0.25); }
    if (kev & KEv.SuperTurbo) sfx.turbo(2);
    else if (kev & KEv.MiniTurbo) sfx.turbo(1);
    if (kev & KEv.Pad) sfx.boost();
    this.fx.push({ e: "localkev", bits: kev });
  }

  private interpolate(alpha: number, you: number) {
    const rt = this.estTick - INTERP_DELAY_TICKS;
    let a: SnapBuf | undefined, b: SnapBuf | undefined;
    for (let i = this.snaps.length - 1; i >= 0; i--) {
      if (this.snaps[i].k <= rt) { a = this.snaps[i]; b = this.snaps[i + 1]; break; }
    }
    if (!a) { a = this.snaps[0]; b = undefined; }
    if (!a) return;
    const t = b ? Math.min(1, Math.max(0, (rt - a.k) / (b.k - a.k))) : 0;
    const latest = this.snaps[this.snaps.length - 1];
    const roster = this.ui.get().roster;

    for (const id of this.karts.keys()) if (!latest.karts.has(id)) this.karts.delete(id);
    for (const [id, rowL] of latest.karts) {
      let rk = this.karts.get(id);
      const info = roster.get(id);
      if (!rk) {
        rk = { id, x: 0, y: 0, z: 0, yaw: 0, hp: 0, flags: 0, item: 0, drift: 0, speed: 0, slip: 0, steer: 0, accel: 0, groundY: 0, visible: true, color: info?.color ?? "#fff", kart: info?.kart ?? KARTS[0].id };
        this.karts.set(id, rk);
      }
      const prevSpeed = rk.speed, prevYaw = rk.yaw;
      if (id === you && this.havePred) {
        const p = this.pred;
        rk.x = lerp(this.prev.x, p.x, alpha) + this.offset.x;
        rk.y = lerp(this.prev.y, p.y, alpha) + this.offset.y;
        rk.z = lerp(this.prev.z, p.z, alpha) + this.offset.z;
        rk.yaw = lerpAngle(this.prev.yaw, p.yaw, alpha) + this.offset.yaw;
        rk.speed = forwardSpeed(p);
        rk.slip = lateralSpeed(p);
        rk.steer = p.str;
        rk.drift = p.drift;
        let f = rowL[6] & ~(KFlag.Boost | KFlag.Drift | KFlag.Grounded);
        if (this.alive) f |= KFlag.Alive; else f &= ~KFlag.Alive;
        if (isBoosting(p, this.lastBits)) f |= KFlag.Boost;
        if (p.drift) f |= KFlag.Drift;
        if (p.grounded) f |= KFlag.Grounded;
        rk.flags = f;
        rk.hp = rowL[5];
        rk.item = rowL[7];
      } else {
        const ra = a.karts.get(id), rb = b?.karts.get(id);
        const r0 = ra ?? rowL, r1 = rb ?? r0;
        const px = rk.x, pz = rk.z;
        rk.x = lerp(r0[1], r1[1], t);
        rk.y = lerp(r0[2], r1[2], t);
        rk.z = lerp(r0[3], r1[3], t);
        rk.yaw = lerpAngle(r0[4], r1[4], t);
        // remote karts: derive speed / slide / steering from interpolated motion
        if (this.frameDt > 0) {
          const vx = (rk.x - px) / this.frameDt, vz = (rk.z - pz) / this.frameDt;
          const fx = Math.sin(rk.yaw), fz = Math.cos(rk.yaw);
          if (Math.abs(vx) + Math.abs(vz) < 80) {
            rk.speed = lerp(rk.speed, vx * fx + vz * fz, 0.25);
            rk.slip = lerp(rk.slip, -vx * fz + vz * fx, 0.25);
          }
          rk.steer = lerp(rk.steer, Math.max(-1, Math.min(1, -wrapAngle(rk.yaw - prevYaw) / this.frameDt / 2.6)), 0.2);
        }
        rk.hp = r1[5]; rk.flags = r1[6]; rk.item = r1[7]; rk.drift = r1[8];
      }
      if (this.frameDt > 0) rk.accel = lerp(rk.accel, (rk.speed - prevSpeed) / this.frameDt, 0.15);
      rk.groundY = groundAt(this.arena, rk.x, rk.z, rk.y + 0.5);
      rk.visible = (rk.flags & KFlag.Alive) !== 0;
      if (info) { rk.color = info.color; rk.kart = info.kart; }
    }

    // projectiles
    this.projs.length = 0;
    for (const [id, pl] of latest.projs) {
      const p0 = a.projs.get(id), p1 = b?.projs.get(id);
      let x = pl[2], y = pl[3], z = pl[4], vx = 0, vz = 0;
      if (p0 && p1) {
        x = lerp(p0[2], p1[2], t); y = lerp(p0[3], p1[3], t); z = lerp(p0[4], p1[4], t);
        vx = p1[2] - p0[2]; vz = p1[4] - p0[4];
      } else if (p0) { x = p0[2]; y = p0[3]; z = p0[4]; }
      else if (latest !== a) continue; // not born yet at render time
      this.projs.push({ id, kind: pl[1], x, y, z, vx, vz, owner: pl[5] });
    }
  }

  private pushHud() {
    const s = this.ui.get();
    const me = this.me;
    const stats = this.myStats();
    const fps = this.fpsTime > 0 ? Math.round(this.fpsFrames / this.fpsTime) : 0;
    if (this.fpsTime > 1) {
      this.fpsFrames = 0; this.fpsTime = 0;
      this.autoQuality(fps);
    }
    const rank = Math.max(1, s.scores.findIndex((r) => r.you) + 1);
    const hud: Hud = {
      ...s.hud,
      hp: me ? me[PHYS_FIELDS] : stats.maxHp,
      maxHp: stats.maxHp,
      boost: this.pred.boost,
      item: me ? me[PHYS_FIELDS + 1] : 0,
      ammo: me ? me[PHYS_FIELDS + 2] : 0,
      shield: me ? me[PHYS_FIELDS + 3] : 0,
      respawnIn: me ? me[PHYS_FIELDS + 4] : 0,
      spawnShield: me ? me[PHYS_FIELDS + 5] : 0,
      alive: this.alive,
      overdrive: this.pred.overdrive,
      killer: this.killerName,
      killerWeapon: this.killerWeapon,
      killerInfo: this.killerInfo,
      firedThisMatch: this.fired,
      speed: Math.abs(forwardSpeed(this.pred)),
      drift: this.pred.drift ? this.pred.driftTime : 0,
      ping: Math.round(this.rtt),
      fps: fps || s.hud.fps,
      rank,
      players: s.scores.length,
      score: s.scores.find((r) => r.you)?.score ?? 0,
      hurt: this.hurtCount,
      hitmark: this.hitCount,
    };
    if (s.scores.some((r) => r.name === "???")) this.refreshScores();
    this.ui.set({ hud });
  }

  /** Step graphics down when the device can't keep up, so play stays smooth on tablets / old laptops. */
  private autoQuality(fps: number) {
    if (document.hidden || this.ui.get().paused) return;
    this.fpsWindow.push(fps);
    if (this.fpsWindow.length > 6) this.fpsWindow.shift();
    const avg = this.fpsWindow.reduce((a, b) => a + b, 0) / this.fpsWindow.length;
    const q = settings.get().quality;
    if (this.fpsWindow.length < 6) return;
    if ((q === "high" && avg < 42) || (q === "medium" && avg < 30)) {
      if (++this.slowFrames >= 2) {
        settings.update({ quality: q === "high" ? "medium" : "low" });
        this.showToast("Graphics lowered for smoother play");
        this.fpsWindow.length = 0;
        this.slowFrames = 0;
      }
    } else this.slowFrames = 0;
  }

  /** Debug/automation snapshot for tests. */
  debugState() {
    const s = this.ui.get();
    return {
      screen: s.screen, you: s.you, alive: this.alive, pred: { x: this.pred.x, z: this.pred.z, speed: forwardSpeed(this.pred) },
      pending: this.pending.length, snaps: this.snaps.length, karts: this.karts.size, projs: this.projs.length,
      hud: s.hud, scores: s.scores, status: s.status, mode: s.mode, phase: s.room?.phase,
    };
  }
}

export const client = new GameClient();
client.resume();
// console debug hooks only in dev builds or with ?debug in the URL (portals reject shipped debug code)
export const DEBUG = import.meta.env.DEV || new URLSearchParams(location.search).has("debug");
if (DEBUG) (window as unknown as { __bb: GameClient }).__bb = client;
