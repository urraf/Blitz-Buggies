import { segmentClear, segmentHazard } from "./arena.ts";
import { Item, isWeapon } from "./items.ts";
import { makeRng, wrapAngle, type Rng } from "./math.ts";
import { Btn, forwardSpeed } from "./physics.ts";
import type { Kart, Match } from "./match.ts";

const BOT_NAMES = [
  "Rusty Bolt", "Captain Skid", "Turbo Tina", "Gearhead Gus", "Sparky", "Nitro Nell", "Wobbles",
  "Dizzy Dyno", "Pip Piston", "Mad Muffler", "Zoom Zelda", "Clank", "Fender Bender", "Lug Nut",
  "Hubcap Hal", "Torque Tess", "Bumper Bea", "Axel Grease",
];
export const botName = (i: number) => BOT_NAMES[i % BOT_NAMES.length] + (i >= BOT_NAMES.length ? ` ${Math.floor(i / BOT_NAMES.length) + 1}` : "");

interface SkillProfile { aim: number; react: number; throttle: number; drift: boolean; boost: boolean; fireChance: number }
const SKILLS: SkillProfile[] = [
  { aim: 0.2, react: 0.5, throttle: 0.93, drift: false, boost: false, fireChance: 0.6 },
  { aim: 0.12, react: 0.3, throttle: 1, drift: false, boost: false, fireChance: 0.85 },
  { aim: 0.06, react: 0.16, throttle: 1, drift: true, boost: false, fireChance: 1 },
];

/**
 * Server-side bot driver. Produces the same button bits a human would send, so bots obey the
 * exact same physics and weapon rules as players.
 */
export class BotBrain {
  private rng: Rng;
  private p: SkillProfile;
  private rethink = 0;
  private targetId = -1;
  private gx = 0;
  private gz = 0;
  private stuck = 0;
  private reverse = 0;
  private reverseSteer = 0;
  private drifting = false;
  private aimOffset = 0;
  private fireWindow = 0;
  private wander = 0;
  private side: number;

  constructor(skill: 0 | 1 | 2, seed: number) {
    this.p = SKILLS[skill];
    this.rng = makeRng(seed >>> 0);
    this.side = this.rng() < 0.5 ? 1 : -1;
  }

  think(m: Match, me: Kart, dt: number): number {
    const p = me.phys;
    const speed = forwardSpeed(p);
    if ((this.rethink -= dt) <= 0) {
      this.rethink = this.p.react * (0.7 + this.rng() * 0.6);
      this.chooseGoal(m, me);
      this.aimOffset = (this.rng() - 0.5) * this.p.aim * 2;
      this.fireWindow = this.rng() < this.p.fireChance ? 1 : 0;
    }
    const target = this.targetId >= 0 ? m.karts.get(this.targetId) : undefined;
    if (target && target.alive) {
      // lead the target a little
      this.gx = target.phys.x + target.phys.vx * 0.25;
      this.gz = target.phys.z + target.phys.vz * 0.25;
    }

    let bits = 0;
    const dx = this.gx - p.x, dz = this.gz - p.z;
    const dist = Math.hypot(dx, dz);
    const y = p.y + 0.6;
    let want = Math.atan2(dx, dz) + this.aimOffset * (target ? 1 : 0);
    // path finding light: if the straight line to the goal is blocked, take the nearest open heading
    const probe = Math.min(dist, 16);
    const hz = m.arena.hazards.length > 0;
    const clearAt = (h: number, len: number) => {
      const x1 = p.x + Math.sin(h) * len, z1 = p.z + Math.cos(h) * len;
      const c = segmentClear(m.arena, p.x, p.z, x1, z1, y);
      return hz ? Math.min(c, segmentHazard(m.arena, p.x, p.z, x1, z1)) : c;
    };
    if (probe > 3 && clearAt(want, probe) < 1) {
      for (const off of [0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.45, -1.45, 1.9, -1.9, 2.5, -2.5]) {
        const h = want + off * this.side;
        if (clearAt(h, 12) >= 1) { want = h; break; }
      }
    }
    let diff = wrapAngle(want - p.yaw);
    // last-moment feelers for whatever is right in front of the bumper
    const look = 5 + Math.max(0, speed) * 0.3;
    if (clearAt(p.yaw, look) < 0.6) {
      const l = clearAt(p.yaw + 0.7, look), r = clearAt(p.yaw - 0.7, look);
      diff = l >= r ? 1 : -1;
    }
    // lava ahead at this speed: swerve to the clearer side, brake if both sides are bad
    let brake = false;
    let danger = false;
    if (hz) {
      const far = 4 + Math.max(0, speed) * 0.75;
      const lavaAt = (h: number) => segmentHazard(m.arena, p.x, p.z, p.x + Math.sin(h) * far, p.z + Math.cos(h) * far, 1.8);
      danger = lavaAt(p.yaw) < 1 || lavaAt(p.yaw + diff * 0.3) < 1;
      if (danger) {
        const l = lavaAt(p.yaw + 0.8), r = lavaAt(p.yaw - 0.8);
        if (Math.max(l, r) >= 1) diff = l >= r ? 1 : -1;
        else { diff = l >= r ? 1 : -1; brake = speed > 6; }
      }
    }

    // unstick: reverse out if we are pushing against something
    if (this.reverse > 0 && hz && segmentHazard(m.arena, p.x, p.z, p.x - Math.sin(p.yaw) * 7, p.z - Math.cos(p.yaw) * 7, 1.5) < 1) this.reverse = 0;
    if (this.reverse > 0) {
      this.reverse -= dt;
      bits |= Btn.Down | (this.reverseSteer > 0 ? Btn.Left : Btn.Right);
      return bits;
    }
    if (Math.abs(speed) < 1.5 && me.phys.stun <= 0) {
      if ((this.stuck += dt) > 0.8) { this.stuck = 0; this.reverse = 0.7 + this.rng() * 0.5; this.reverseSteer = this.rng() - 0.5; }
    } else this.stuck = 0;

    if (brake) {
      bits |= Btn.Down | (diff > 0 ? Btn.Left : Btn.Right);
    } else if (Math.abs(diff) > 2.5 && dist < 10) {
      bits |= Btn.Down | (diff > 0 ? Btn.Right : Btn.Left);
    } else {
      if (this.rng() < this.p.throttle) bits |= Btn.Up;
      if (diff > 0.07) bits |= Btn.Left;
      else if (diff < -0.07) bits |= Btn.Right;
    }

    // drift through sharp turns
    if (this.p.drift) {
      const sharp = Math.abs(diff) > 0.65 && Math.abs(diff) < 2 && speed > 14;
      if (sharp && !danger) this.drifting = true;
      else if (Math.abs(diff) < 0.25 || danger) this.drifting = false;
      if (this.drifting) bits |= Btn.Drift;
    }

    // weapons
    if (isWeapon(me.item) && this.fireWindow) {
      // fire decisions use the true bearing; the aim error above only affects steering
      const ad = target && target.alive ? Math.abs(wrapAngle(Math.atan2(target.phys.x - p.x, target.phys.z - p.z) - p.yaw)) : Math.PI;
      const tol = 1 + this.p.aim * 2;
      const los = target && target.alive && segmentClear(m.arena, p.x, p.z, target.phys.x, target.phys.z, y) >= 1;
      let fire = false;
      switch (me.item) {
        case Item.Blaster: fire = !!los && dist < 40 && ad < 0.22 * tol; break;
        case Item.Rocket: fire = !!los && dist < 50 && ad < 0.12 * tol; break;
        case Item.Cannon: fire = !!los && dist < 48 && ad < 0.12 * tol; break;
        case Item.Triple: fire = dist < 60 && ad < 0.9; break;
        case Item.Hornet: fire = dist < 60 && ad < 0.8; break;
        case Item.Lobber: fire = !!los && dist > 8 && dist < 38 && ad < 0.2 * tol; break;
        case Item.Mine: fire = this.enemyBehind(m, me) || me.heldFor > 4; break;
      }
      // non-auto weapons need a fresh press: release for one tick after firing
      if (fire && (me.item === Item.Blaster || !(me.prevBits & Btn.Fire))) bits |= Btn.Fire;
    }
    return bits;
  }

  private chooseGoal(m: Match, me: Kart) {
    const p = me.phys;
    const hasWeapon = isWeapon(me.item);
    const prev = this.targetId;
    this.targetId = -1;
    if (hasWeapon || me.shield > 0) {
      let best = -1, bestD = 75 * 75;
      for (const o of m.karts.values()) {
        if (o.id === me.id || !o.alive) continue;
        let d = (o.phys.x - p.x) ** 2 + (o.phys.z - p.z) ** 2;
        if (o.id === prev) d *= 0.6; // stick with the current target
        if (d < bestD) { bestD = d; best = o.id; }
      }
      if (best >= 0) { this.targetId = best; return; }
    }
    if (!hasWeapon) {
      const c = nearest(m.crates, p.x, p.z, p.y);
      if (c) { this.gx = c.x; this.gz = c.z; return; }
    }
    if (p.boost < 30) {
      const n = nearest(m.nitros, p.x, p.z);
      if (n) { this.gx = n.x; this.gz = n.z; return; }
    }
    if ((this.wander -= 1) <= 0 || Math.hypot(this.gx - p.x, this.gz - p.z) < 6) {
      const sp = m.arena.spawns[Math.floor(this.rng() * m.arena.spawns.length)];
      this.gx = sp.x * 0.6; this.gz = sp.z * 0.6;
      this.wander = 6;
    }
  }

  private enemyBehind(m: Match, me: Kart) {
    for (const o of m.karts.values()) {
      if (o.id === me.id || !o.alive) continue;
      const dx = o.phys.x - me.phys.x, dz = o.phys.z - me.phys.z;
      if (dx * dx + dz * dz > 18 * 18) continue;
      if (Math.abs(wrapAngle(Math.atan2(dx, dz) - me.phys.yaw)) > 2.3) return true;
    }
    return false;
  }
}

function nearest(list: { x: number; y?: number; z: number; active: boolean }[], x: number, z: number, y = 0) {
  let best: { x: number; z: number } | null = null, bd = Infinity;
  for (const c of list) {
    if (!c.active) continue;
    const climb = Math.max(0, (c.y ?? 0) - y - 0.5);
    const d = (c.x - x) ** 2 + (c.z - z) ** 2 + (climb * 30) ** 2;
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
