import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { brotliCompressSync, gzipSync, constants as zlibConst } from "node:zlib";
import { networkInterfaces } from "node:os";
import { WebSocketServer, type WebSocket } from "ws";
import { ARENA_DEFS, MAX_PLAYERS, RECONNECT_GRACE_SECONDS, Room, TICK_RATE, type ClientMsg, type ServerMsg } from "../../shared/src/index.ts";

const PORT = Number(process.env.PORT ?? 3000);
const STATIC_DIR = normalize(join(dirname(fileURLToPath(import.meta.url)), "../../client/dist"));
const MAX_MSGS_PER_SEC = 120;
const MAX_BUFFERED = 256 * 1024;

interface Player {
  id: number;
  token: string;
  name: string;
  kart: string;
  look: string;
  ws: WebSocket | null;
  room: Room | null;
  msgCount: number;
  goneTimer: NodeJS.Timeout | null;
}

const players = new Map<number, Player>();
const byToken = new Map<string, Player>();
const rooms = new Map<string, Room>();
let nextId = 1;
const newId = () => nextId++;

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function newCode() {
  for (;;) {
    let c = "";
    for (let i = 0; i < 5; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    if (!rooms.has(c)) return c;
  }
}

function send(id: number, msg: ServerMsg) {
  const p = players.get(id);
  const ws = p?.ws;
  if (!ws || ws.readyState !== ws.OPEN) return;
  // under backpressure drop snapshots (the next one supersedes it) but keep reliable messages
  if (msg.t === "s" && ws.bufferedAmount > MAX_BUFFERED) return;
  ws.send(JSON.stringify(msg));
}

function createRoom(isPrivate: boolean, settings: object) {
  const code = newCode();
  const room = new Room(code, isPrivate, settings, send, newId);
  room.onEmpty = () => {
    rooms.delete(code);
    log(`room ${code} closed`);
  };
  rooms.set(code, room);
  log(`room ${code} created (${isPrivate ? "private" : "quick"}, ${room.settings.arena})`);
  return room;
}

function leaveRoom(p: Player) {
  const r = p.room;
  if (!r) return;
  p.room = null;
  r.removeMember(p.id);
}

function joinRoom(p: Player, r: Room) {
  leaveRoom(p);
  p.room = r;
  r.addHuman(p.id, p.name, p.kart, p.look);
}

function handle(p: Player, raw: string) {
  let msg: ClientMsg;
  try { msg = JSON.parse(raw); } catch { return; }
  if (!msg || typeof msg !== "object" || typeof msg.t !== "string") return;
  switch (msg.t) {
    case "quick": {
      const open = [...rooms.values()].filter((r) => r.joinable()).sort((a, b) => b.humans.length - a.humans.length)[0];
      joinRoom(p, open ?? createRoom(false, { arena: ARENA_DEFS[Math.floor(Math.random() * ARENA_DEFS.length)].id }));
      break;
    }
    case "create":
      joinRoom(p, createRoom(true, msg.settings ?? {}));
      break;
    case "join": {
      const r = rooms.get(String(msg.code ?? "").toUpperCase().trim());
      if (!r) send(p.id, { t: "err", msg: "Room not found" });
      else if (r.humans.length >= MAX_PLAYERS) send(p.id, { t: "err", msg: "Room is full" });
      else joinRoom(p, r);
      break;
    }
    case "leave":
      leaveRoom(p);
      send(p.id, { t: "left" });
      break;
    case "kart":
      if (typeof msg.kart === "string") p.kart = msg.kart;
      if (typeof msg.look === "string") p.look = msg.look;
      p.room?.handle(p.id, msg);
      break;
    default:
      p.room?.handle(p.id, msg);
  }
}

// ------------------------------------------------------------------ static files

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml",
  ".png": "image/png", ".json": "application/json", ".ico": "image/x-icon", ".woff2": "font/woff2",
  ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".txt": "text/plain; charset=utf-8", ".webmanifest": "application/manifest+json",
};

async function serveStatic(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? "/", "http://x");
  if (url.pathname === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, players: players.size }));
    return;
  }
  let file = normalize(join(STATIC_DIR, decodeURIComponent(url.pathname)));
  if (!file.startsWith(STATIC_DIR)) { res.writeHead(403).end(); return; }
  try {
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
  } catch {
    file = join(STATIC_DIR, "index.html"); // SPA fallback
  }
  try {
    const { body, br, gz, type } = await loadAsset(file);
    const enc = String(req.headers["accept-encoding"] ?? "");
    const headers: Record<string, string> = {
      "content-type": type,
      "cache-control": file.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin",
      vary: "accept-encoding",
    };
    let out = body;
    if (br && enc.includes("br")) { out = br; headers["content-encoding"] = "br"; }
    else if (gz && enc.includes("gzip")) { out = gz; headers["content-encoding"] = "gzip"; }
    res.writeHead(200, headers);
    res.end(out);
  } catch {
    res.writeHead(404, { "content-type": "text/plain" }).end("Client not built. Run `npm run build` or use `npm run dev`.");
  }
}

/** Files are read once and kept (with brotli/gzip variants for text) - the client bundle is small and immutable. */
const assetCache = new Map<string, { body: Buffer; br?: Buffer; gz?: Buffer; type: string }>();
const COMPRESSIBLE = new Set([".html", ".js", ".css", ".svg", ".json", ".webmanifest", ".txt"]);
async function loadAsset(file: string) {
  const hit = assetCache.get(file);
  if (hit && !file.endsWith("index.html")) return hit;
  const body = await readFile(file);
  const ext = extname(file);
  const entry: { body: Buffer; br?: Buffer; gz?: Buffer; type: string } = { body, type: MIME[ext] ?? "application/octet-stream" };
  if (COMPRESSIBLE.has(ext) && body.length > 1024) {
    entry.br = brotliCompressSync(body, { params: { [zlibConst.BROTLI_PARAM_QUALITY]: 9 } });
    entry.gz = gzipSync(body, { level: 9 });
  }
  if (!file.endsWith("index.html")) assetCache.set(file, entry);
  return entry;
}

// ------------------------------------------------------------------ websocket

const http = createServer(serveStatic);
const wss = new WebSocketServer({ server: http, path: "/ws", maxPayload: 8 * 1024 });

wss.on("connection", (ws) => {
  let p: Player | null = null;
  ws.on("message", (data) => {
    const raw = data.toString();
    if (!p) {
      // first message must be hello (optionally with a reconnect token)
      let hello: ClientMsg;
      try { hello = JSON.parse(raw); } catch { ws.close(); return; }
      if (hello.t !== "hello") { ws.close(); return; }
      const existing = hello.token ? byToken.get(hello.token) : undefined;
      if (existing) {
        p = existing;
        p.ws?.close();
        p.ws = ws;
        if (p.goneTimer) { clearTimeout(p.goneTimer); p.goneTimer = null; }
        send(p.id, { t: "welcome", id: p.id, token: p.token });
        if (p.room && !p.room.reconnect(p.id)) p.room = null;
        log(`player ${p.id} reconnected`);
      } else {
        p = { id: newId(), token: randomBytes(12).toString("hex"), name: String(hello.name ?? "Racer"), kart: String(hello.kart ?? ""), look: String(hello.look ?? ""), ws, room: null, msgCount: 0, goneTimer: null };
        players.set(p.id, p);
        byToken.set(p.token, p);
        send(p.id, { t: "welcome", id: p.id, token: p.token });
        log(`player ${p.id} connected`);
      }
      return;
    }
    if (++p.msgCount > MAX_MSGS_PER_SEC) return;
    handle(p, raw);
  });
  ws.on("close", () => {
    if (!p || p.ws !== ws) return;
    const player = p;
    player.ws = null;
    player.room?.disconnect(player.id);
    log(`player ${player.id} disconnected`);
    player.goneTimer = setTimeout(() => {
      leaveRoom(player);
      players.delete(player.id);
      byToken.delete(player.token);
    }, RECONNECT_GRACE_SECONDS * 1000);
  });
});

// ------------------------------------------------------------------ fixed-rate loop

const stepMs = 1000 / TICK_RATE;
let last = performance.now();
let acc = 0;
setInterval(() => {
  const now = performance.now();
  acc += now - last;
  last = now;
  let n = 0;
  while (acc >= stepMs && n < 8) {
    for (const r of rooms.values()) r.tick();
    acc -= stepMs;
    n++;
  }
  if (n === 8) acc = 0; // overloaded: drop backlog instead of spiralling
}, 4);
setInterval(() => { for (const p of players.values()) p.msgCount = 0; }, 1000);

function log(s: string) { console.log(`[${new Date().toISOString().slice(11, 19)}] ${s}`); }

// graceful shutdown: tell players, close sockets, then exit (Docker / PaaS send SIGTERM on deploy)
function shutdown(signal: string) {
  log(`${signal} received, shutting down`);
  for (const p of players.values()) { try { p.ws?.close(1012, "server restarting"); } catch { /* ignore */ } }
  wss.close();
  http.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

http.listen(PORT, () => {
  log(`Blitz Buggies server on http://localhost:${PORT}  (ws: /ws)`);
  // LAN addresses so other devices on the same Wi-Fi can join
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) if (a.family === "IPv4" && !a.internal) log(`  on your network: http://${a.address}:${PORT}`);
  }
});
