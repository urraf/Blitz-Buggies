import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ARENA_DEFS, buildArena, segmentClear, segmentHazard, hazardAt, Btn, DT, getArena, Item, kartById, KEv, Match, newKartPhys, stepKart, TICK_RATE, forwardSpeed, groundAt,
} from "../shared/src/index.ts";

const flat = buildArena({ ...ARENA_DEFS[0], id: "flat", size: [400, 400], blocks: [], ramps: [], pads: [], grip: 1, hazards: [] });
const run = (ticks: number, f: (i: number) => void) => { for (let i = 0; i < ticks; i++) f(i); };

test("kart accelerates to top speed and coasts down", () => {
  const a = flat;
  const k = kartById("sprocket");
  const s = newKartPhys(0, -150, 0);
  run(TICK_RATE * 3, () => stepKart(s, Btn.Up, k, a, DT));
  const top = forwardSpeed(s);
  assert.ok(top > k.maxSpeed * 0.95 && top <= k.maxSpeed + 0.5, `top speed ${top}`);
  run(TICK_RATE * 5, () => stepKart(s, 0, k, a, DT));
  assert.ok(forwardSpeed(s) < 1, "coasts to a stop");
});

test("steering right decreases yaw; reverse works", () => {
  const a = getArena("isle");
  const k = kartById("zippy");
  const s = newKartPhys(-40, -40, 0);
  run(30, () => stepKart(s, Btn.Up, k, a, DT));
  const y0 = s.yaw;
  run(20, () => stepKart(s, Btn.Up | Btn.Right, k, a, DT));
  assert.ok(s.yaw < y0, "right turn lowers yaw");
  const r = newKartPhys(-40, -40, 0);
  run(60, () => stepKart(r, Btn.Down, k, a, DT));
  assert.ok(forwardSpeed(r) < -5, "reverses");
});

test("drift charge releases a mini-turbo", () => {
  const a = flat;
  const k = kartById("sprocket");
  const s = newKartPhys(0, -150, 0);
  run(90, () => stepKart(s, Btn.Up, k, a, DT));
  let ev = 0;
  run(70, () => { ev |= stepKart(s, Btn.Up | Btn.Drift | Btn.Left, k, a, DT); });
  assert.ok(ev & KEv.Hop, "drift hop");
  assert.ok(s.drift !== 0, "drifting");
  ev = stepKart(s, Btn.Up, k, a, DT);
  assert.ok(ev & (KEv.MiniTurbo | KEv.SuperTurbo), "turbo on release");
  assert.ok(s.boostTimer > 0);
});

test("ramps lift the kart onto platforms and launch off jump ramps", () => {
  const a = getArena("isle");
  const k = kartById("comet");
  // west ramp rises toward +x onto the 2.2 m central plaza
  const s = newKartPhys(-33, 0, Math.PI / 2);
  let maxY = 0;
  run(TICK_RATE * 3, () => { stepKart(s, Btn.Up, k, a, DT); maxY = Math.max(maxY, s.y); });
  assert.ok(maxY >= 2.1, `reached plaza height ${maxY}`);
  // coast-road jump ramp at (62,-8) rises toward +z
  const j = newKartPhys(62, -40, 0);
  let airborne = false;
  run(TICK_RATE * 3, () => { stepKart(j, Btn.Up, k, a, DT); if (!j.grounded && j.y > 1.6) airborne = true; });
  assert.ok(airborne, "launched off jump ramp");
});

test("walls stop karts and keep them in bounds", () => {
  const a = getArena("bay");
  const k = kartById("bruiser");
  const s = newKartPhys(10, 40, 0);
  run(TICK_RATE * 6, () => stepKart(s, Btn.Up | Btn.Boost, k, a, DT));
  assert.ok(s.z < a.halfD, "inside arena");
  assert.ok(Number.isFinite(s.x) && Number.isFinite(s.z));
});

for (const def of ARENA_DEFS) {
  test(`arena ${def.id}: spawns, crates and nitros are on open ground`, () => {
    const a = getArena(def.id);
    for (const [x, z] of a.crates) assert.ok(!hazardAt(a, x, z, 1), `crate (${x},${z}) in lava`);
    for (const sp of a.spawns) assert.ok(!hazardAt(a, sp.x, sp.z, 2), `spawn (${sp.x},${sp.z}) in lava`);
    for (const sp of a.spawns) {
      const s = newKartPhys(sp.x, sp.z, sp.yaw, groundAt(a, sp.x, sp.z, 50));
      const x0 = s.x, z0 = s.z;
      stepKart(s, 0, kartById("zippy"), a, DT);
      assert.ok(Math.hypot(s.x - x0, s.z - z0) < 0.01, `spawn ${sp.x},${sp.z} not inside geometry`);
    }
  });
}

for (const def of ARENA_DEFS) {
  test(`full bot match on ${def.id} plays out with kills, pickups and respawns`, () => {
    const m = new Match(def.id, 120, 1234, 2);
    for (let i = 0; i < 6; i++) m.addKart({ id: i + 1, name: `bot${i}`, kartId: ["zippy", "bruiser", "comet", "sprocket"][i % 4], slot: i, bot: true, skill: 2 });
    const seen = { fire: new Set<number>(), kills: 0, self: 0, pickups: 0, spawns: 0, hits: 0, nitro: 0 };
    let ticks = 0;
    while (!m.over && ticks < TICK_RATE * 140) {
      m.step();
      ticks++;
      for (const e of m.events) {
        if (e.e === "fire") seen.fire.add(e.item);
        else if (e.e === "kill") { seen.kills++; if (e.by === e.id) seen.self++; }
        else if (e.e === "pickup") seen.pickups++;
        else if (e.e === "spawn") seen.spawns++;
        else if (e.e === "hit" && e.dmg > 0) seen.hits++;
        else if (e.e === "nitro") seen.nitro++;
      }
      m.events.length = 0;
      for (const k of m.karts.values()) {
        assert.ok(Number.isFinite(k.phys.x + k.phys.y + k.phys.z), "finite position");
        assert.ok(Math.abs(k.phys.x) <= m.arena.halfW && Math.abs(k.phys.z) <= m.arena.halfD, "in bounds");
      }
    }
    assert.ok(m.over, "timer ended the match");
    const res = m.results();
    console.log(`  ${def.id}: kills=${seen.kills} self=${seen.self} hits=${seen.hits} pickups=${seen.pickups} nitro=${seen.nitro} weapons=${[...seen.fire].join(",")} top=${res[0].name}:${res[0].score}`);
    assert.ok(seen.pickups >= 10, "bots collect crates");
    assert.ok(seen.hits >= 10, "bots land hits");
    assert.ok(seen.kills >= 3, "bots score kills");
    assert.ok(seen.spawns >= 6 + 3, "dead karts respawn");
    assert.ok(seen.fire.has(Item.Blaster), "blaster used");
    assert.equal(res.reduce((s, r) => s + r.score, 0), seen.kills - seen.self, "score equals kills by others");
    assert.ok(seen.self <= seen.kills * 0.35, `too many self-wrecks (${seen.self}/${seen.kills})`);
  });
}

for (const def of ARENA_DEFS) {
  test(`arena ${def.id}: every spawn has a clear lane ahead`, () => {
    const a = getArena(def.id);
    for (const sp of a.spawns) {
      const fx = Math.sin(sp.yaw), fz = Math.cos(sp.yaw), rx = -fz, rz = fx;
      for (const off of [-1.3, 0, 1.3]) {
        const x0 = sp.x + rx * off, z0 = sp.z + rz * off;
        const t = segmentClear(a, x0, z0, x0 + fx * 22, z0 + fz * 22, 0.5);
        assert.equal(t, 1, `spawn (${sp.x},${sp.z}) blocked at offset ${off} (t=${t.toFixed(2)})`);
        assert.equal(segmentHazard(a, x0, z0, x0 + fx * 18, z0 + fz * 18, 1), 1, `spawn (${sp.x},${sp.z}) faces lava`);
      }
    }
  });
}

test("lava wrecks a kart that drives in, credited to whoever knocked it", () => {
  const m = new Match("lava", 120, 5, 1);
  m.addKart({ id: 1, name: "victim", kartId: "zippy", slot: 0, bot: false });
  m.addKart({ id: 2, name: "pusher", kartId: "zippy", slot: 1, bot: false });
  m.countdown = 0;
  const v = m.karts.get(1)!;
  v.spawnShield = 0;
  v.phys = { ...v.phys, x: 20, z: -1, y: 0, vx: 0, vz: 0, yaw: 0, grounded: true };
  v.lastHitBy = 2; v.lastHitAt = m.tick;
  m.step();
  assert.equal(v.alive, false, "wrecked by lava");
  assert.equal(m.karts.get(2)!.score, 1, "pusher credited");
});
