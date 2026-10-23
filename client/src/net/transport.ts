import { DT, Room, type ClientMsg, type RoomSettings, type ServerMsg } from "../../../shared/src/index.ts";

export type NetStatus = "connecting" | "open" | "reconnecting" | "closed";

export interface Transport {
  readonly kind: "online" | "local";
  send(m: ClientMsg): void;
  close(): void;
  setPaused?(p: boolean): void;
}

export interface TransportHandlers {
  onMessage(m: ServerMsg): void;
  onStatus(s: NetStatus): void;
}

/**
 * Game server origin, e.g. "https://blitz-buggies.onrender.com". Empty means same origin (the Node server
 * also serves the client). Set VITE_SERVER_URL at build time when the client is hosted elsewhere (portals).
 */
const SERVER_URL = (import.meta.env.VITE_SERVER_URL ?? "").replace(/\/+$/, "");
const wsUrl = () => SERVER_URL
  ? `${SERVER_URL.replace(/^http/, "ws")}/ws`
  : `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;

/** Free hosts sleep when idle: ping on page load so the server is awake by the time the player presses Play. */
export function wakeServer() {
  if (SERVER_URL) fetch(`${SERVER_URL}/health`, { mode: "no-cors", cache: "no-store" }).catch(() => { /* offline */ });
}

const TOKEN_KEY = "bb.token";
export const readToken = () => { try { return sessionStorage.getItem(TOKEN_KEY) ?? undefined; } catch { return undefined; } };
const writeToken = (t: string) => { try { sessionStorage.setItem(TOKEN_KEY, t); } catch { /* storage unavailable */ } };

/** WebSocket transport with automatic reconnect (the server re-attaches us via the session token). */
export class WsTransport implements Transport {
  readonly kind = "online";
  private ws: WebSocket | null = null;
  private closed = false;
  private retry = 0;
  private outbox: ClientMsg[] = [];
  private h: TransportHandlers;
  private hello: () => ClientMsg;

  constructor(h: TransportHandlers, hello: () => ClientMsg) {
    this.h = h;
    this.hello = hello;
    this.connect();
  }

  private connect() {
    const ws = new WebSocket(wsUrl());
    this.ws = ws;
    this.h.onStatus(this.retry ? "reconnecting" : "connecting");
    ws.onopen = () => {
      this.retry = 0;
      const hello = this.hello() as Extract<ClientMsg, { t: "hello" }>;
      ws.send(JSON.stringify({ ...hello, token: readToken() }));
      this.h.onStatus("open");
      for (const m of this.outbox.splice(0)) ws.send(JSON.stringify(m));
    };
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data as string) as ServerMsg;
      if (m.t === "welcome") writeToken(m.token);
      this.h.onMessage(m);
    };
    ws.onclose = () => {
      if (this.closed) return;
      this.h.onStatus("reconnecting");
      const delay = Math.min(4000, 400 * 2 ** this.retry++);
      setTimeout(() => !this.closed && this.connect(), delay);
    };
  }

  send(m: ClientMsg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
    else if (m.t !== "i" && m.t !== "ping") this.outbox.push(m);
  }

  close() {
    this.closed = true;
    this.ws?.close();
    this.h.onStatus("closed");
  }

  /** Test hook: drop the socket to exercise reconnect. */
  simulateDrop() { this.ws?.close(); }
}

/** Runs a Room inside the page for offline solo play. Same protocol, zero latency, pausable. */
export class LocalTransport implements Transport {
  readonly kind = "local";
  readonly room: Room;
  private timer: number;
  private last = performance.now();
  private acc = 0;
  private paused = false;
  private h: TransportHandlers;
  private readonly me = 1;

  constructor(h: TransportHandlers, name: string, kart: string, settings: Partial<RoomSettings>, look?: string) {
    this.h = h;
    let id = 1;
    this.room = new Room("SOLO", true, settings, (_pid, msg) => this.h.onMessage(msg), () => ++id);
    h.onStatus("open");
    h.onMessage({ t: "welcome", id: this.me, token: "local" });
    this.room.addHuman(this.me, name, kart, look);
    this.room.startMatch();
    this.timer = window.setInterval(() => this.pump(), 4);
  }

  private pump() {
    const now = performance.now();
    if (this.paused) { this.last = now; return; }
    this.acc += Math.min(250, now - this.last);
    this.last = now;
    while (this.acc >= DT * 1000) {
      this.room.tick();
      this.acc -= DT * 1000;
    }
  }

  send(m: ClientMsg) {
    if (m.t === "leave") { this.close(); this.h.onMessage({ t: "left" }); return; }
    if (m.t === "settings" || m.t === "start") {
      // solo rooms are private: host may tweak settings in the lobby and start again
      this.room.handle(this.me, m);
      return;
    }
    this.room.handle(this.me, m);
  }

  setPaused(p: boolean) { this.paused = p; }

  close() {
    clearInterval(this.timer);
    this.h.onStatus("closed");
  }
}
