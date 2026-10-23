import { groundAt, hazardAt, pointBlocked, segmentClear, type Arena } from "./arena.ts";
import { getArena } from "./arenas.ts";
import { BotBrain } from "./bot.ts";
import {
  BOOST_MAX, COUNTDOWN_SECONDS, CRATE_RESPAWN_SECONDS, DT, KART_RADIUS, NITRO_RESPAWN_SECONDS,
  PICKUP_RADIUS, RESPAWN_SECONDS, SPAWN_SHIELD_SECONDS, TICK_RATE,
} from "./constants.ts";
import { Item, POWERS, Proj, WEAPONS, isWeapon, rollCrate, type ItemId, type ProjKind } from "./items.ts";
import { kartById, type KartStats } from "./karts.ts";
import { clamp, makeRng, q2, q3, wrapAngle, type Rng } from "./math.ts";
import { Btn, KEv, isBoosting, newKartPhys, packPhys, stepKart, type KartPhys } from "./physics.ts";
import { KFlag, type GameEvent, type KartRow, type ProjRow, type ResultRow } from "./protocol.ts";

export interface Kart {
  id: number;
  name: string;
  kartId: string;
  stats: KartStats;
  slot: number;
  bot: boolean;
  brain: BotBrain | null;
  phys: KartPhys;
  hp: number;
  alive: boolean;
  respawnIn: number;
  spawnShield: number;
  shield: number;
  item: ItemId;
  ammo: number;
  fireCd: number;
  heldFor: number;
  prevBits: number;
  score: number;
  kills: number;
  deaths: number;
  streak: number;
  bestStreak: number;
  lastKiller: number;
  ramCd: number;
  /** who last damaged this kart and when (tick) - credits knock-into-lava wrecks */
  lastHitBy: number;
  lastHitAt: number;
  // input pipeline (humans)
  queue: number[];
  lastSeq: number;
  lastBits: number;
  starve: number;
  disconnected: boolean;
}

export interface Projectile {
  id: number;
  kind: ProjKind;
  owner: number;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number;
  target: number;
  arm: number;
  /** item that fired it (for kill credit) */
  tag: number;
}

interface Pickup { x: number; y: number; z: number; active: boolean; timer: number }

const MAX_QUEUE = 8;
const INPUT_TIMEOUT_TICKS = 15;
const MAX_MINES_PER_KART = 6;

export class Match {
  readonly arena: Arena;
  readonly karts = new Map<number, Kart>();
  readonly projectiles: Projectile[] = [];
  readonly crates: Pickup[];
  readonly nitros: Pickup[];
  readonly rng: Rng;
  tick = 0;
  countdown = COUNTDOWN_SECONDS;
  timeLeft: number;
  over = false;
  events: GameEvent[] = [];
  /** wrecks scored by any kart this match (first blood detection) */
  private totalKills = 0;
  cratesDirty = true;
  nitrosDirty = true;
  scoreDirty = true;
  private nextProjId = 1;

  readonly botSkill: 0 | 1 | 2;

  constructor(arenaId: string, seconds: number, seed: number, botSkill: 0 | 1 | 2 = 1) {
    this.botSkill = botSkill;
    this.arena = getArena(arenaId);
    this.timeLeft = seconds;
    this.rng = makeRng(seed);
    const mk = ([x, z]: [number, number]): Pickup => ({ x, z, y: groundAt(this.arena, x, z, 50), active: true, timer: 0 });
    this.crates = this.arena.crates.map(mk);
    this.nitros = this.arena.nitros.map(mk);
  }

  get frozen() { return this.countdown > 0; }

  addKart(o: { id: number; name: string; kartId: string; slot: number; bot: boolean; skill?: 0 | 1 | 2 }): Kart {
    const stats = kartById(o.kartId);
    const k: Kart = {
      id: o.id, name: o.name, kartId: stats.id, stats, slot: o.slot, bot: o.bot,
      brain: o.bot ? new BotBrain(o.skill ?? this.botSkill, this.rng() * 1e9) : null,
      phys: newKartPhys(0, 0, 0), hp: stats.maxHp, alive: false, respawnIn: 0, spawnShield: 0, shield: 0,
      item: Item.None, ammo: 0, fireCd: 0, heldFor: 0, prevBits: 0,
      score: 0, kills: 0, deaths: 0, streak: 0, bestStreak: 0, lastKiller: -1, ramCd: 0, lastHitBy: -1, lastHitAt: -9999,
      queue: [], lastSeq: 0, lastBits: 0, starve: 0, disconnected: false,
    };
    this.karts.set(k.id, k);
    this.respawn(k);
    this.scoreDirty = true;
    return k;
  }

  removeKart(id: number) {
    this.karts.delete(id);
    for (let i = this.projectiles.length - 1; i >= 0; i--) if (this.projectiles[i].owner === id) this.projectiles.splice(i, 1);
    this.scoreDirty = true;
  }

  /** Human input batch: sequence numbers start at 1 and increase by one per client tick. */
  pushInputs(id: number, firstSeq: number, bits: number[]) {
    const k = this.karts.get(id);
    if (!k) return;
    for (let i = 0; i < bits.length; i++) {
      const seq = firstSeq + i;
      if (seq <= k.lastSeq) continue;
      k.queue.push(bits[i] & 0x7f);
      k.lastSeq = seq;
    }
    while (k.queue.length > MAX_QUEUE) k.queue.shift();
  }

  /** Last input sequence the server has applied for this kart. */
  ackFor(id: number) {
    const k = this.karts.get(id);
    return k ? k.lastSeq - k.queue.length : 0;
  }

  setDisconnected(id: number, d: boolean) {
    const k = this.karts.get(id);
    if (!k) return;
    k.disconnected = d;
    // a bot drives the kart while its owner is away so the match stays lively
    k.brain = d ? new BotBrain(1, this.rng() * 1e9) : k.bot ? k.brain : null;
    // a reconnecting client may be a reloaded page whose input sequence restarts at 1
    if (!d) { k.queue.length = 0; k.lastSeq = 0; k.lastBits = 0; }
  }

  step() {
    this.tick++;
    if (this.countdown > 0) this.countdown = Math.max(0, this.countdown - DT);
    else if (!this.over) {
      this.timeLeft = Math.max(0, this.timeLeft - DT);
      if (this.timeLeft <= 0) this.over = true;
    }

    for (const k of this.karts.values()) {
      let bits: number;
      if (k.brain) bits = k.alive && !this.frozen ? k.brain.think(this, k, DT) : 0;
      else {
        const next = k.queue.shift();
        if (next !== undefined) { k.lastBits = next; k.starve = 0; }
        else if (++k.starve > INPUT_TIMEOUT_TICKS) k.lastBits = 0; // client stalled (tab hidden / lag): release controls
        bits = k.lastBits;
      }
      if (this.frozen || this.over) bits = 0;

      if (!k.alive) {
        if (!this.over && (k.respawnIn -= DT) <= 0) this.respawn(k);
        k.prevBits = bits;
        continue;
      }
      const kev = stepKart(k.phys, bits, k.stats, this.arena, DT);
      if (k.phys.grounded && k.phys.y < 0.25 && this.arena.hazards.length && hazardAt(this.arena, k.phys.x, k.phys.z)) {
        // lava: instant wreck, credited to whoever knocked us in recently
        const by = k.lastHitBy >= 0 && this.tick - k.lastHitAt < 4 * TICK_RATE ? k.lastHitBy : k.id;
        this.kill(k, by, Item.Lava);
        k.prevBits = bits;
        continue;
      }
      if (kev & (KEv.Land | KEv.Wall | KEv.MiniTurbo | KEv.SuperTurbo | KEv.Pad)) this.events.push({ e: "kev", id: k.id, bits: kev });
      this.handleFire(k, bits);
      k.prevBits = bits;
      k.spawnShield = Math.max(0, k.spawnShield - DT);
      k.shield = Math.max(0, k.shield - DT);
      k.fireCd = Math.max(0, k.fireCd - DT);
      k.ramCd = Math.max(0, k.ramCd - DT);
      if (k.item !== Item.None) k.heldFor += DT;
    }
    this.collideKarts();
    this.stepProjectiles();
    this.stepPickups();
  }

  // ---------------------------------------------------------------- spawning / damage

  respawn(k: Kart) {
    const sp = this.pickSpawn(k.id);
    const y = groundAt(this.arena, sp.x, sp.z, 50);
    k.phys = newKartPhys(sp.x, sp.z, sp.yaw, y);
    k.hp = k.stats.maxHp;
    k.alive = true;
    k.spawnShield = SPAWN_SHIELD_SECONDS;
    k.shield = 0;
    k.item = Item.None;
    k.ammo = 0;
    this.events.push({ e: "spawn", id: k.id });
  }

  private pickSpawn(selfId: number) {
    let best = this.arena.spawns[0], bestScore = -1;
    for (const sp of this.arena.spawns) {
      let minD = 1e9;
      for (const o of this.karts.values()) {
        if (o.id === selfId || !o.alive) continue;
        const d = (o.phys.x - sp.x) ** 2 + (o.phys.z - sp.z) ** 2;
        if (d < minD) minD = d;
      }
      const score = minD + this.rng() * 50; // small jitter so spawns vary
      if (score > bestScore) { bestScore = score; best = sp; }
    }
    return best;
  }

  damage(t: Kart, amount: number, byId: number, item: number, x: number, y: number, z: number) {
    if (!t.alive || this.over) return;
    if (t.spawnShield > 0 || t.shield > 0) {
      this.events.push({ e: "hit", id: t.id, by: byId, dmg: 0, x: q2(x), y: q2(y), z: q2(z) });
      return;
    }
    const dmg = Math.round(amount);
    if (byId !== t.id) { t.lastHitBy = byId; t.lastHitAt = this.tick; }
    t.hp -= dmg;
    this.events.push({ e: "hit", id: t.id, by: byId, dmg, x: q2(x), y: q2(y), z: q2(z) });
    if (t.hp <= 0) this.kill(t, byId, item);
  }

  private kill(t: Kart, byId: number, item: number) {
    const victimStreak = t.streak;
    t.hp = 0;
    t.alive = false;
    t.respawnIn = RESPAWN_SECONDS;
    t.deaths++;
    t.streak = 0;
    t.item = Item.None;
    t.ammo = 0;
    const by = this.karts.get(byId);
    let revenge = false, streak = 0, first = false;
    const shutdown = victimStreak >= 3 && !!by && by.id !== t.id;
    if (by && by.id !== t.id) {
      first = this.totalKills === 0;
      this.totalKills++;
      by.score++;
      by.kills++;
      by.streak++;
      by.bestStreak = Math.max(by.bestStreak, by.streak);
      streak = by.streak;
      revenge = by.lastKiller === t.id;
      if (revenge) by.lastKiller = -1;
      t.lastKiller = by.id;
    }
    this.events.push({ e: "boom", x: q2(t.phys.x), y: q2(t.phys.y + 0.5), z: q2(t.phys.z), r: 3.5, kind: 0 });
    this.events.push({ e: "kill", id: t.id, by: byId, item, streak, revenge, shutdown, first });
    this.scoreDirty = true;
  }

  // ---------------------------------------------------------------- weapons

  private handleFire(k: Kart, bits: number) {
    if (!isWeapon(k.item) || k.ammo <= 0 || k.fireCd > 0 || k.phys.stun > 0) return;
    const def = WEAPONS[k.item]!;
    const held = (bits & Btn.Fire) !== 0;
    const pressed = held && !(k.prevBits & Btn.Fire);
    if (!(def.auto ? held : pressed)) return;

    const p = k.phys;
    let fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
    const fwd = Math.max(0, p.vx * fx + p.vz * fz);
    const mx = p.x + fx * 1.9, my = p.y + 0.75, mz = p.z + fz * 1.9;
    // gentle aim assist: straight-firing weapons bend toward a kart that is almost in the sights
    const assisted = this.assistAim(k, 0.2, 60);
    const aimYaw = assisted ?? p.yaw;
    switch (k.item) {
      case Item.Blaster: {
        const a = (assisted !== null ? p.yaw + wrapAngle(assisted - p.yaw) * 0.6 : p.yaw) + (this.rng() - 0.5) * 0.08;
        const sp = 95 + fwd;
        this.spawnProj(Proj.Bolt, k.id, mx, my, mz, Math.sin(a) * sp, 0, Math.cos(a) * sp, 0.55);
        break;
      }
      case Item.Rocket: {
        const sp = 50 + fwd;
        fx = Math.sin(aimYaw); fz = Math.cos(aimYaw);
        this.spawnProj(Proj.Rocket, k.id, mx, my, mz, fx * sp, 0, fz * sp, 3);
        break;
      }
      case Item.Cannon: {
        const sp = 58 + fwd;
        fx = Math.sin(aimYaw); fz = Math.cos(aimYaw);
        this.spawnProj(Proj.Ball, k.id, mx, my + 0.2, mz, fx * sp, 3, fz * sp, 2.5);
        break;
      }
      case Item.Triple: {
        const sp = 32 + fwd * 0.5;
        for (const off of [-0.28, 0, 0.28]) {
          const a = p.yaw + off;
          const pr = this.spawnProj(Proj.Hornet, k.id, mx, my, mz, Math.sin(a) * sp, 0, Math.cos(a) * sp, 4);
          pr.target = this.acquireTarget(k, 1.3, 70, pr.id % 3);
          pr.tag = Item.Triple;
        }
        break;
      }
      case Item.Hornet: {
        const sp = 34 + fwd * 0.5;
        const pr = this.spawnProj(Proj.Hornet, k.id, mx, my, mz, fx * sp, 0, fz * sp, 4);
        pr.target = this.acquireTarget(k, 1.2, 70);
        break;
      }
      case Item.Lobber: {
        const sp = 22 + fwd * 0.9;
        this.spawnProj(Proj.Lob, k.id, mx, my + 0.4, mz, fx * sp, 11, fz * sp, 3.5);
        break;
      }
      case Item.Mine: {
        const bx = p.x - fx * 2.4, bz = p.z - fz * 2.4;
        const pr = this.spawnProj(Proj.Mine, k.id, bx, groundAt(this.arena, bx, bz, p.y + 0.5) + 0.15, bz, 0, 0, 0, 25);
        pr.arm = 0.7;
        const mine = this.projectiles.filter((q) => q.kind === Proj.Mine && q.owner === k.id);
        if (mine.length > MAX_MINES_PER_KART) this.projectiles.splice(this.projectiles.indexOf(mine[0]), 1);
        break;
      }
    }
    k.ammo--;
    k.fireCd = def.interval;
    this.events.push({ e: "fire", id: k.id, item: k.item });
    if (k.ammo <= 0) { k.item = Item.None; k.heldFor = 0; }
  }

  private spawnProj(kind: ProjKind, owner: number, x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number): Projectile {
    const pr: Projectile = { id: this.nextProjId++, kind, owner, x, y, z, vx, vy, vz, life, target: -1, arm: 0, tag: 0 };
    this.projectiles.push(pr);
    return pr;
  }

  /** Bearing to an enemy nearly in the sights (within halfCone), or null. */
  private assistAim(k: Kart, halfCone: number, range: number): number | null {
    const id = this.acquireTarget(k, halfCone, range);
    const t = this.karts.get(id);
    if (!t) return null;
    // lead a little so straight shots meet moving karts
    const d = Math.hypot(t.phys.x - k.phys.x, t.phys.z - k.phys.z);
    const lead = Math.min(0.5, d / 70);
    return Math.atan2(t.phys.x + t.phys.vx * lead - k.phys.x, t.phys.z + t.phys.vz * lead - k.phys.z);
  }

  /** Nearest visible enemy inside a forward cone (half-angle in radians). `skip` picks the n-th nearest. */
  acquireTarget(k: Kart, halfCone: number, range: number, skip = 0): number {
    const found: [number, number][] = [];
    for (const o of this.karts.values()) {
      if (o.id === k.id || !o.alive) continue;
      const dx = o.phys.x - k.phys.x, dz = o.phys.z - k.phys.z;
      const d = dx * dx + dz * dz;
      if (d > range * range) continue;
      if (Math.abs(wrapAngle(Math.atan2(dx, dz) - k.phys.yaw)) > halfCone) continue;
      if (segmentClear(this.arena, k.phys.x, k.phys.z, o.phys.x, o.phys.z, k.phys.y + 0.8) < 1) continue;
      found.push([d, o.id]);
    }
    if (!found.length) return -1;
    found.sort((a, b) => a[0] - b[0]);
    return found[Math.min(skip, found.length - 1)][1];
  }

  private explode(x: number, y: number, z: number, radius: number, dmg: number, owner: number, item: number, kind: number) {
    this.events.push({ e: "boom", x: q2(x), y: q2(y), z: q2(z), r: radius, kind });
    for (const t of this.karts.values()) {
      if (!t.alive || t.id === owner) continue;
      const dx = t.phys.x - x, dy = t.phys.y + 0.5 - y, dz = t.phys.z - z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > radius) continue;
      const f = 1 - d / radius;
      const blocked = t.spawnShield > 0 || t.shield > 0;
      this.damage(t, dmg * (0.5 + 0.5 * f), owner, item, t.phys.x, t.phys.y + 0.6, t.phys.z);
      if (!blocked && t.alive) {
        const hd = Math.hypot(dx, dz) || 1;
        t.phys.vx += (dx / hd) * 13 * f;
        t.phys.vz += (dz / hd) * 13 * f;
        t.phys.vy = Math.max(t.phys.vy, 6 + 5 * f);
        t.phys.grounded = false;
        t.phys.stun = Math.max(t.phys.stun, 0.35 + 0.4 * f);
        t.phys.drift = 0;
      }
    }
  }

  private stepProjectiles() {
    const a = this.arena;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.life -= DT;
      let dead = pr.life <= 0;
      switch (pr.kind) {
        case Proj.Bolt: {
          for (let sub = 0; sub < 2 && !dead; sub++) {
            pr.x += pr.vx * DT * 0.5; pr.z += pr.vz * DT * 0.5;
            if (pointBlocked(a, pr.x, pr.y, pr.z, 0.15) || Math.abs(pr.x) > a.halfW || Math.abs(pr.z) > a.halfD) {
              this.events.push({ e: "boom", x: q2(pr.x), y: q2(pr.y), z: q2(pr.z), r: 0.6, kind: Proj.Bolt });
              dead = true; break;
            }
            const t = this.hitKart(pr, 1.45);
            if (t) {
              this.damage(t, WEAPONS[Item.Blaster]!.damage, pr.owner, Item.Blaster, pr.x, pr.y, pr.z);
              t.phys.vx += pr.vx * 0.03; t.phys.vz += pr.vz * 0.03;
              dead = true;
            }
          }
          break;
        }
        case Proj.Rocket: {
          pr.x += pr.vx * DT; pr.z += pr.vz * DT;
          const gy = groundAt(a, pr.x, pr.z, pr.y + 0.5) + 0.8;
          pr.y += (gy - pr.y) * Math.min(1, 10 * DT);
          if (dead || pointBlocked(a, pr.x, pr.y, pr.z, 0.3) || this.hitKart(pr, 1.6) || Math.abs(pr.x) > a.halfW || Math.abs(pr.z) > a.halfD) {
            const w = WEAPONS[Item.Rocket]!;
            this.explode(pr.x, pr.y, pr.z, w.splash, w.damage, pr.owner, Item.Rocket, Proj.Rocket);
            dead = true;
          }
          break;
        }
        case Proj.Hornet: {
          const t = this.karts.get(pr.target);
          let sp = Math.hypot(pr.vx, pr.vz);
          sp = Math.min(46, sp + 18 * DT);
          let heading = Math.atan2(pr.vx, pr.vz);
          if (t && t.alive) {
            const want = Math.atan2(t.phys.x - pr.x, t.phys.z - pr.z);
            heading += clamp(wrapAngle(want - heading), -2.6 * DT, 2.6 * DT);
          }
          pr.vx = Math.sin(heading) * sp; pr.vz = Math.cos(heading) * sp;
          pr.x += pr.vx * DT; pr.z += pr.vz * DT;
          const gy = groundAt(a, pr.x, pr.z, pr.y + 0.5) + 0.9;
          pr.y += (gy - pr.y) * Math.min(1, 8 * DT);
          if (dead || pointBlocked(a, pr.x, pr.y, pr.z, 0.3) || this.hitKart(pr, 1.7)) {
            const item = pr.tag === Item.Triple ? Item.Triple : Item.Hornet;
            const w = WEAPONS[item]!;
            this.explode(pr.x, pr.y, pr.z, w.splash, w.damage, pr.owner, item, Proj.Hornet);
            dead = true;
          }
          break;
        }
        case Proj.Ball: {
          pr.vy -= 9 * DT;
          pr.x += pr.vx * DT; pr.y += pr.vy * DT; pr.z += pr.vz * DT;
          if (dead || pointBlocked(a, pr.x, pr.y, pr.z, 0.45) || this.hitKart(pr, 1.8) || Math.abs(pr.x) > a.halfW || Math.abs(pr.z) > a.halfD) {
            const w = WEAPONS[Item.Cannon]!;
            this.explode(pr.x, Math.max(pr.y, 0.4), pr.z, w.splash, w.damage, pr.owner, Item.Cannon, Proj.Ball);
            dead = true;
          }
          break;
        }
        case Proj.Lob: {
          pr.vy -= 30 * DT;
          pr.x += pr.vx * DT; pr.y += pr.vy * DT; pr.z += pr.vz * DT;
          if (dead || pointBlocked(a, pr.x, pr.y, pr.z, 0.35) || this.hitKart(pr, 1.7)) {
            const w = WEAPONS[Item.Lobber]!;
            this.explode(pr.x, Math.max(pr.y, 0.3), pr.z, w.splash, w.damage, pr.owner, Item.Lobber, Proj.Lob);
            dead = true;
          }
          break;
        }
        case Proj.Mine: {
          pr.arm -= DT;
          if (pr.arm <= 0 && !dead) {
            for (const t of this.karts.values()) {
              if (!t.alive || t.id === pr.owner) continue;
              if ((t.phys.x - pr.x) ** 2 + (t.phys.z - pr.z) ** 2 < 2.5 * 2.5 && Math.abs(t.phys.y - pr.y) < 2) {
                const w = WEAPONS[Item.Mine]!;
                this.explode(pr.x, pr.y + 0.3, pr.z, w.splash, w.damage, pr.owner, Item.Mine, Proj.Mine);
                dead = true;
                break;
              }
            }
          }
          break;
        }
      }
      if (dead) this.projectiles.splice(i, 1);
    }
  }

  private hitKart(pr: Projectile, r: number): Kart | null {
    for (const t of this.karts.values()) {
      if (!t.alive || t.id === pr.owner) continue;
      const dx = t.phys.x - pr.x, dy = t.phys.y + 0.6 - pr.y, dz = t.phys.z - pr.z;
      if (dx * dx + dy * dy + dz * dz < r * r) return t;
    }
    return null;
  }

  // ---------------------------------------------------------------- kart vs kart

  private collideKarts() {
    const list = [...this.karts.values()].filter((k) => k.alive);
    const minD = KART_RADIUS * 2;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const A = list[i], B = list[j];
        const a = A.phys, b = B.phys;
        if (Math.abs(a.y - b.y) > 1.4) continue;
        let dx = a.x - b.x, dz = a.z - b.z;
        const d2 = dx * dx + dz * dz;
        if (d2 >= minD * minD) continue;
        const d = Math.sqrt(d2) || 0.001;
        dx /= d; dz /= d;
        const ma = A.stats.mass * (A.shield > 0 ? 2 : 1), mb = B.stats.mass * (B.shield > 0 ? 2 : 1);
        const pen = minD - d;
        a.x += dx * pen * (mb / (ma + mb)); a.z += dz * pen * (mb / (ma + mb));
        b.x -= dx * pen * (ma / (ma + mb)); b.z -= dz * pen * (ma / (ma + mb));
        const vrel = (a.vx - b.vx) * dx + (a.vz - b.vz) * dz;
        if (vrel < 0) {
          const jimp = (-(1 + 0.5) * vrel) / (1 / ma + 1 / mb);
          a.vx += (jimp / ma) * dx; a.vz += (jimp / ma) * dz;
          b.vx -= (jimp / mb) * dx; b.vz -= (jimp / mb) * dz;
          // shielded karts ram for damage
          if (-vrel > 6) {
            if (A.shield > 0 && A.ramCd <= 0) { A.ramCd = 0.6; this.damage(B, 25, A.id, Item.Shield, b.x, b.y + 0.6, b.z); }
            if (B.shield > 0 && B.ramCd <= 0) { B.ramCd = 0.6; this.damage(A, 25, B.id, Item.Shield, a.x, a.y + 0.6, a.z); }
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------- pickups

  private stepPickups() {
    for (const c of this.crates) if (!c.active && (c.timer -= DT) <= 0) { c.active = true; this.cratesDirty = true; }
    for (const n of this.nitros) if (!n.active && (n.timer -= DT) <= 0) { n.active = true; this.nitrosDirty = true; }
    const r2 = PICKUP_RADIUS * PICKUP_RADIUS;
    for (const k of this.karts.values()) {
      if (!k.alive) continue;
      const p = k.phys;
      if (k.item === Item.None) {
        for (let i = 0; i < this.crates.length; i++) {
          const c = this.crates[i];
          if (!c.active || Math.abs(p.y - c.y) > 2 || (p.x - c.x) ** 2 + (p.z - c.z) ** 2 > r2) continue;
          c.active = false;
          c.timer = CRATE_RESPAWN_SECONDS;
          this.cratesDirty = true;
          const got = rollCrate(this.rng, k.hp / k.stats.maxHp);
          this.grant(k, got);
          this.events.push({ e: "pickup", id: k.id, item: got, crate: i });
          break;
        }
      }
      if (p.boost < BOOST_MAX - 5) {
        for (let i = 0; i < this.nitros.length; i++) {
          const n = this.nitros[i];
          if (!n.active || Math.abs(p.y - n.y) > 2 || (p.x - n.x) ** 2 + (p.z - n.z) ** 2 > r2) continue;
          n.active = false;
          n.timer = NITRO_RESPAWN_SECONDS;
          this.nitrosDirty = true;
          p.boost = Math.min(BOOST_MAX, p.boost + 45);
          this.events.push({ e: "nitro", id: k.id, idx: i });
          break;
        }
      }
    }
  }

  private grant(k: Kart, id: ItemId) {
    if (isWeapon(id)) { k.item = id; k.ammo = WEAPONS[id]!.ammo; k.heldFor = 0; k.fireCd = 0.15; return; }
    if (id === Item.Shield) k.shield = POWERS[Item.Shield]!.seconds;
    else if (id === Item.Overdrive) k.phys.overdrive = POWERS[Item.Overdrive]!.seconds;
    else if (id === Item.Patch) k.hp = Math.min(k.stats.maxHp, k.hp + 50);
  }

  // ---------------------------------------------------------------- serialization

  kartRows(): KartRow[] {
    const rows: KartRow[] = [];
    for (const k of this.karts.values()) {
      const p = k.phys;
      let f = 0;
      if (k.alive) f |= KFlag.Alive;
      if (k.shield > 0) f |= KFlag.Shield;
      if (k.spawnShield > 0) f |= KFlag.SpawnShield;
      if (isBoosting(p, k.prevBits)) f |= KFlag.Boost;
      if (p.drift !== 0) f |= KFlag.Drift;
      if (p.grounded) f |= KFlag.Grounded;
      if (p.stun > 0) f |= KFlag.Stun;
      if (p.overdrive > 0) f |= KFlag.Overdrive;
      if (k.bot) f |= KFlag.Bot;
      if (k.disconnected) f |= KFlag.Disconnected;
      rows.push([k.id, q2(p.x), q2(p.y), q2(p.z), q3(p.yaw), Math.max(0, Math.round(k.hp)), f, k.item, p.drift]);
    }
    return rows;
  }

  projRows(): ProjRow[] {
    return this.projectiles.map((p) => [p.id, p.kind, q2(p.x), q2(p.y), q2(p.z), p.owner]);
  }

  /** Own-kart block: physics state for reconciliation + HUD values. */
  meRow(id: number): number[] | undefined {
    const k = this.karts.get(id);
    if (!k) return undefined;
    return [...packPhys(k.phys), Math.max(0, Math.round(k.hp)), k.item, k.ammo, q2(k.shield), q2(k.respawnIn), q2(k.spawnShield), k.alive ? 1 : 0];
  }

  crateBits() { return this.crates.map((c) => (c.active ? "1" : "0")).join(""); }
  nitroBits() { return this.nitros.map((c) => (c.active ? "1" : "0")).join(""); }

  scoreRows(): [number, number, number, number][] {
    return [...this.karts.values()].map((k) => [k.id, k.score, k.kills, k.deaths]);
  }

  results(): ResultRow[] {
    return [...this.karts.values()]
      .map((k) => ({ id: k.id, name: k.name, kart: k.kartId, bot: k.bot, score: k.score, kills: k.kills, deaths: k.deaths, bestStreak: k.bestStreak, look: "" }))
      .sort((a, b) => b.score - a.score || a.deaths - b.deaths || b.kills - a.kills);
  }
}

export const SECONDS_TO_TICKS = (s: number) => Math.round(s * TICK_RATE);
