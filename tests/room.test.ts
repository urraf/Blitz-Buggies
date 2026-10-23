import { test } from "node:test";
import assert from "node:assert/strict";
import { Btn, MAX_PLAYERS, PHYS_FIELDS, QUICK_LOBBY_SECONDS, RECONNECT_GRACE_SECONDS, RESULTS_SECONDS, Room, TICK_RATE, type ServerMsg } from "../shared/src/index.ts";

function harness(isPrivate: boolean, settings = {}) {
  const inbox = new Map<number, ServerMsg[]>();
  let id = 100;
  const room = new Room("TEST1", isPrivate, settings, (pid, m) => { if (!inbox.has(pid)) inbox.set(pid, []); inbox.get(pid)!.push(m); }, () => ++id);
  const msgs = (pid: number, t?: string) => (inbox.get(pid) ?? []).filter((m) => !t || m.t === t);
  const ticks = (sec: number) => { for (let i = 0; i < Math.round(sec * TICK_RATE); i++) room.tick(); };
  return { room, msgs, ticks, inbox };
}

test("private room: host starts, bots fill, full match ends with results, then back to lobby", () => {
  const { room, msgs, ticks } = harness(true, { botFill: 6, seconds: 60 });
  room.addHuman(1, "Alice", "zippy");
  room.addHuman(2, "Bob", "comet");
  assert.equal(room.members.find((m) => m.id === 1)!.host, true);
  room.handle(2, { t: "start" }); // non-host ignored
  assert.equal(room.phase, "lobby");
  room.handle(1, { t: "start" });
  assert.equal(room.phase, "countdown");
  assert.equal(room.match!.karts.size, 6, "bots fill to 6");
  assert.equal(msgs(1, "match").length, 1);
  ticks(3.1);
  assert.equal(room.phase, "playing");
  // Alice holds throttle via the input pipeline
  let seq = 1;
  const x0 = room.match!.karts.get(1)!.phys.x, z0 = room.match!.karts.get(1)!.phys.z;
  for (let i = 0; i < 60; i++) { room.handle(1, { t: "i", s: seq, b: [Btn.Up, Btn.Up] }); seq += 2; room.tick(); room.tick(); }
  const k = room.match!.karts.get(1)!;
  assert.ok(Math.hypot(k.phys.x - x0, k.phys.z - z0) > 10, "human kart moved from inputs");
  const snaps = msgs(1, "s") as Extract<ServerMsg, { t: "s" }>[];
  assert.ok(snaps.length > 40, "snapshots at 20 Hz");
  const last = snaps[snaps.length - 1];
  assert.ok(last.a > 100, `ack advanced (${last.a})`);
  assert.equal(last.me!.length, PHYS_FIELDS + 7);
  assert.ok(snaps.some((s) => s.cr), "crate state sent");
  ticks(60);
  assert.equal(room.phase, "results");
  const res = msgs(2, "results");
  assert.equal(res.length, 1);
  ticks(RESULTS_SECONDS + 0.1);
  assert.equal(room.phase, "lobby", "private room returns to lobby");
});

test("rematch votes from every connected human restart immediately", () => {
  const { room, ticks } = harness(true, { botFill: 2, seconds: 60 });
  room.addHuman(1, "A", "zippy");
  room.addHuman(2, "B", "zippy");
  room.startMatch();
  ticks(64);
  assert.equal(room.phase, "results");
  room.handle(1, { t: "rematch" });
  assert.equal(room.phase, "results");
  room.handle(2, { t: "rematch" });
  assert.equal(room.phase, "countdown");
});

test("quick room auto-starts, accepts drop-ins, rotates arenas", () => {
  const { room, ticks, msgs } = harness(false, { arena: "isle", seconds: 60, botFill: MAX_PLAYERS });
  room.addHuman(1, "A", "zippy");
  assert.ok(room.info().autoStart > 0);
  ticks(QUICK_LOBBY_SECONDS + 0.1);
  assert.equal(room.phase, "countdown");
  assert.equal(room.match!.karts.size, MAX_PLAYERS);
  assert.ok(room.joinable());
  room.addHuman(2, "Late", "bruiser"); // replaces a bot
  assert.equal(room.match!.karts.size, MAX_PLAYERS);
  assert.ok(room.match!.karts.has(2));
  assert.equal(msgs(2, "match").length, 1, "late joiner gets match");
  ticks(64 + RESULTS_SECONDS);
  assert.equal(room.phase, "countdown", "next round started");
  assert.equal(room.settings.arena, "bakery", "arena rotated");
});

test("disconnect hands the kart to a bot; reconnect restores it; grace expiry removes", () => {
  const { room, ticks, msgs } = harness(true, { botFill: 4, seconds: 120 });
  room.addHuman(1, "A", "zippy");
  room.addHuman(2, "B", "zippy");
  room.startMatch();
  ticks(4);
  room.disconnect(2);
  assert.ok(room.match!.karts.get(2)!.brain, "bot took over");
  assert.equal(room.members.find((m) => m.id === 1)!.host, true);
  ticks(2);
  assert.ok(room.reconnect(2));
  assert.equal(room.match!.karts.get(2)!.brain, null, "control returned");
  assert.equal(msgs(2, "match").length, 2, "match resent on reconnect");
  room.disconnect(2);
  ticks(RECONNECT_GRACE_SECONDS + 1);
  assert.ok(!room.members.some((m) => m.id === 2), "removed after grace");
  assert.ok(!room.match!.karts.has(2));
});

test("host leaving promotes another human; last human leaving closes room", () => {
  const { room } = harness(true);
  let closed = false;
  room.onEmpty = () => { closed = true; };
  room.addHuman(1, "A", "zippy");
  room.addHuman(2, "B", "zippy");
  room.removeMember(1);
  assert.equal(room.members.find((m) => m.id === 2)!.host, true);
  room.removeMember(2);
  assert.ok(closed);
});

test("malformed client messages are ignored safely", () => {
  const { room, ticks } = harness(true);
  room.addHuman(1, "A<script>", "not-a-kart");
  const m = room.members[0];
  assert.equal(m.name, "Ascript");
  assert.equal(m.kart, "zippy");
  room.startMatch();
  room.handle(1, { t: "i", s: 1, b: Array(500).fill(255) } as never);
  room.handle(1, { t: "settings", settings: { botFill: 999, seconds: 7, arena: "nope" } as never });
  room.handle(1, { t: "bogus" } as never);
  ticks(1);
  assert.equal(room.settings.botFill, 6);
});

test("reconnect from a reloaded page (input sequence restarts at 1) still drives the kart", () => {
  const { room, ticks } = harness(true, { botFill: 2, seconds: 120 });
  room.addHuman(1, "A", "zippy");
  room.startMatch();
  ticks(3.2);
  let seq = 1;
  for (let i = 0; i < 300; i++) { room.handle(1, { t: "i", s: seq, b: [0, 0] }); seq += 2; room.tick(); room.tick(); }
  room.disconnect(1);
  ticks(1);
  room.reconnect(1);
  const k = room.match!.karts.get(1)!;
  const x0 = k.phys.x, z0 = k.phys.z;
  let s2 = 1; // fresh page
  for (let i = 0; i < 45; i++) { room.handle(1, { t: "i", s: s2, b: [Btn.Up, Btn.Up] }); s2 += 2; room.tick(); room.tick(); }
  assert.ok(Math.hypot(k.phys.x - x0, k.phys.z - z0) > 8, "inputs after reload are applied");
  assert.ok(room.match!.ackFor(1) > 60 && room.match!.ackFor(1) <= s2, "ack tracks the new sequence");
});

test("names are filtered for kids; emotes are rate limited", async () => {
  const { safeName, isNameBlocked } = await import("../shared/src/index.ts");
  assert.ok(isNameBlocked("sh1t head"));
  assert.ok(isNameBlocked("F.U.C.K"));
  assert.ok(!isNameBlocked("Turbo Panda"));
  assert.notEqual(safeName("b1tch"), "b1tch");
  assert.equal(safeName("Speedy Sam"), "Speedy Sam");
  const { room, ticks, msgs } = harness(true, { botFill: 2 });
  room.addHuman(1, "a$$hole", "zippy");
  assert.ok(!/ass/i.test(room.members[0].name), `renamed to ${room.members[0].name}`);
  room.startMatch();
  room.handle(1, { t: "emote", i: 1 });
  room.handle(1, { t: "emote", i: 2 }); // too soon: dropped
  room.handle(1, { t: "emote", i: 99 }); // invalid
  ticks(0.2);
  const emotes = (msgs(1, "s") as Extract<import("../shared/src/index.ts").ServerMsg, { t: "s" }>[]).flatMap((s) => s.ev ?? []).filter((e) => e.e === "emote");
  assert.equal(emotes.length, 1);
});
