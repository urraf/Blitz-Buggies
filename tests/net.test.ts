import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { Btn, type ServerMsg } from "../shared/src/index.ts";

const PORT = 3999;
let server: ChildProcess;

before(async () => {
  server = spawn(process.execPath, ["server/src/index.ts"], { env: { ...process.env, PORT: String(PORT) }, stdio: "pipe" });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`http://localhost:${PORT}/health`)).ok) return; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("server did not start");
});
after(() => { server.kill(); });

class Bot {
  ws!: WebSocket;
  msgs: ServerMsg[] = [];
  bytes = 0;
  id = -1;
  token = "";
  async connect(name: string, token?: string) {
    this.ws = new WebSocket(`ws://localhost:${PORT}/ws`);
    this.ws.onmessage = (e) => {
      this.bytes += (e.data as string).length;
      const m = JSON.parse(e.data as string) as ServerMsg;
      if (m.t === "welcome") { this.id = m.id; this.token = m.token; }
      this.msgs.push(m);
    };
    await new Promise((r) => (this.ws.onopen = r));
    this.ws.send(JSON.stringify({ t: "hello", name, kart: "comet", token }));
    await this.waitFor("welcome");
  }
  send(m: object) { this.ws.send(JSON.stringify(m)); }
  last<T extends ServerMsg["t"]>(t: T) { return [...this.msgs].reverse().find((m) => m.t === t) as Extract<ServerMsg, { t: T }> | undefined; }
  async waitFor<T extends ServerMsg["t"]>(t: T, pred: (m: Extract<ServerMsg, { t: T }>) => boolean = () => true, ms = 5000) {
    const start = Date.now();
    let seen = 0;
    while (Date.now() - start < ms) {
      for (; seen < this.msgs.length; seen++) {
        const m = this.msgs[seen];
        if (m.t === t && pred(m as Extract<ServerMsg, { t: T }>)) return m as Extract<ServerMsg, { t: T }>;
      }
      await new Promise((r) => setTimeout(r, 20));
    }
    throw new Error(`timeout waiting for ${t}`);
  }
  close() { this.ws.close(); }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("two clients: private room, inputs, snapshots, disconnect + reconnect", async () => {
  const a = new Bot(), b = new Bot();
  await a.connect("Alice");
  await b.connect("Bob");
  a.send({ t: "create", settings: { botFill: 4, seconds: 60, arena: "bay" } });
  const room = await a.waitFor("room");
  assert.equal(room.room.isPrivate, true);
  b.send({ t: "join", code: room.room.code.toLowerCase() });
  await a.waitFor("room", (m) => m.room.players.length === 2);
  a.send({ t: "start" });
  const ma = await a.waitFor("match");
  await b.waitFor("match");
  assert.equal(ma.arena, "bay");
  assert.equal(ma.roster.length, 4);

  // wait for countdown, then drive Alice forward for 2s
  await a.waitFor("s", (s) => s.cd === 0, 6000);
  const startB = b.msgs.length, bytesB = b.bytes;
  const t0 = Date.now();
  let seq = 1;
  const rowOf = (s: Extract<ServerMsg, { t: "s" }>) => s.p.find((r) => r[0] === a.id)!;
  const before = rowOf(b.last("s")!);
  while (Date.now() - t0 < 2000) {
    a.send({ t: "i", s: seq, b: [Btn.Up, Btn.Up] });
    seq += 2;
    await sleep(33);
  }
  const elapsed = (Date.now() - t0) / 1000;
  const snapsB = b.msgs.slice(startB).filter((m) => m.t === "s").length;
  const after = rowOf(b.last("s")!);
  const moved = Math.hypot(after[1] - before[1], after[3] - before[3]);
  console.log(`  snapshot rate ${(snapsB / elapsed).toFixed(1)}/s, downstream ${((b.bytes - bytesB) / elapsed / 1024).toFixed(1)} KiB/s, Alice moved ${moved.toFixed(1)}m as seen by Bob`);
  assert.ok(snapsB / elapsed > 15 && snapsB / elapsed < 25, "~20 Hz snapshots");
  assert.ok(moved > 8, "Bob sees Alice drive");
  const ack = a.last("s")!.a;
  assert.ok(ack > seq - 30, `server acked recent inputs (ack ${ack}, sent ${seq - 1})`);

  // Bob drops: Alice sees him as disconnected, his kart keeps existing
  b.close();
  await a.waitFor("room", (m) => m.room.players.some((p) => p.id === b.id && !p.connected));
  assert.ok(a.last("s")!.p.some((r) => r[0] === b.id), "Bob's kart remains in the match");

  // Bob comes back with his token and is re-attached to the same kart
  const b2 = new Bot();
  await b2.connect("Bob", b.token);
  assert.equal(b2.id, b.id, "same player id after reconnect");
  await b2.waitFor("match");
  const snap = await b2.waitFor("s", (s) => !!s.me && !!s.cr);
  assert.ok(snap.me && snap.me.length > 10, "own state restored");
  await a.waitFor("room", (m) => m.room.players.some((p) => p.id === b.id && p.connected));

  a.close(); b2.close();
});

test("quick play matches two strangers into the same room; bad codes are rejected", async () => {
  const c = new Bot(), d = new Bot();
  await c.connect("Cara");
  await d.connect("Dan");
  c.send({ t: "quick" });
  const rc = await c.waitFor("room");
  d.send({ t: "quick" });
  const rd = await d.waitFor("room");
  assert.equal(rd.room.code, rc.room.code);
  assert.equal(rd.room.isPrivate, false);
  const auto = await c.waitFor("match", () => true, 9000);
  assert.ok(auto.roster.length >= 6, "bots filled the quick room");
  d.send({ t: "join", code: "ZZZZZ" });
  const err = await d.waitFor("err");
  assert.match(err.msg, /not found/i);
  c.close(); d.close();
});
