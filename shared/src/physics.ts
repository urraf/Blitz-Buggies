import { collideCircle, groundAt, padAt, type Arena } from "./arena.ts";
import { BOOST_MAX, GRAVITY, KART_RADIUS } from "./constants.ts";
import type { KartStats } from "./karts.ts";
import { clamp, wrapAngle } from "./math.ts";

/** Input button bits. One byte per tick travels over the wire. */
export const Btn = { Up: 1, Down: 2, Left: 4, Right: 8, Drift: 16, Boost: 32, Fire: 64 } as const;

/** Per-tick event bits returned by stepKart (used for audio / FX). */
export const KEv = { Land: 1, Wall: 2, MiniTurbo: 4, SuperTurbo: 8, Pad: 16, Hop: 32 } as const;

/** Everything that influences kart motion. Kept flat so it serializes into a short array. */
export interface KartPhys {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  yaw: number;
  grounded: boolean;
  /** 0 = not drifting, -1 / 1 = drift direction (left / right). */
  drift: number;
  driftTime: number;
  /** Boost meter 0..BOOST_MAX (only drained by the optional boost button). */
  boost: number;
  /** Free boost seconds (boost pads, drift mini-turbos). */
  boostTimer: number;
  /** Overdrive power-up seconds (unlimited boost). */
  overdrive: number;
  /** Tumble seconds after a heavy hit; control is mostly lost. */
  stun: number;
  /** Smoothed throttle (-1..1): engines spool up instead of snapping to full power. */
  thr: number;
  /** Smoothed steering (-1..1). */
  str: number;
}

export function newKartPhys(x: number, z: number, yaw: number, y = 0): KartPhys {
  return { x, y, z, vx: 0, vy: 0, vz: 0, yaw, grounded: true, drift: 0, driftTime: 0, boost: BOOST_MAX * 0.6, boostTimer: 0, overdrive: 0, stun: 0, thr: 0, str: 0 };
}

export const PHYS_FIELDS = 16;
export function packPhys(s: KartPhys): number[] {
  const r = (v: number) => Math.round(v * 1000) / 1000;
  return [r(s.x), r(s.y), r(s.z), r(s.vx), r(s.vy), r(s.vz), r(s.yaw), s.grounded ? 1 : 0, s.drift, r(s.driftTime), r(s.boost), r(s.boostTimer), r(s.overdrive), r(s.stun), r(s.thr), r(s.str)];
}
export function unpackPhys(a: number[], into: KartPhys): KartPhys {
  into.x = a[0]; into.y = a[1]; into.z = a[2]; into.vx = a[3]; into.vy = a[4]; into.vz = a[5]; into.yaw = a[6];
  into.grounded = a[7] === 1; into.drift = a[8]; into.driftTime = a[9]; into.boost = a[10]; into.boostTimer = a[11];
  into.overdrive = a[12]; into.stun = a[13]; into.thr = a[14]; into.str = a[15];
  return into;
}
export const copyPhys = (from: KartPhys, into: KartPhys) => Object.assign(into, from);

export const isBoosting = (s: KartPhys, bits: number) =>
  s.stun <= 0 && (s.overdrive > 0 || s.boostTimer > 0 || ((bits & Btn.Boost) !== 0 && s.boost > 0));

// Tuning: 0→top ≈ 2.5 s S-curve, coast ≈ 0.5×top/s, reverse ≈ 92 % of top, steering ramps in ≈ 0.3 s.
const THROTTLE_RAMP = 1.5;      // per second toward full power
const THROTTLE_RELEASE = 6;     // per second back to idle
const ENGINE_TAPER = 0.8;       // power falls off near top speed
const COAST = 13;               // m/s² rolling drag with no throttle
const BRAKE = 17;               // m/s² extra when pushing against the direction of travel
const REVERSE_FRAC = 0.92;
const STEER_RATE = 3.6;         // per second toward full lock
const BOOST_MULT = 1.4;
const BOOST_DRAIN = 38;
const BOOST_REGEN = 7;
const HOP_SPEED = 4.6;
const MAX_CLIMB_VY = 14;
const DRIFT_SLIP = 0.38;
/** Above this speed hard steering loosens grip so karts slide (skid marks / smoke). */
const SLIDE_SPEED = 13;

const approach = (v: number, target: number, rate: number) => (v < target ? Math.min(target, v + rate) : Math.max(target, v - rate));

/**
 * Advance one kart by dt. Pure function of (state, input, stats, arena): the server runs it
 * authoritatively and the client replays it for prediction.
 */
export function stepKart(s: KartPhys, bits: number, k: KartStats, a: Arena, dt: number): number {
  let ev = 0;
  const throttle = (bits & Btn.Up ? 1 : 0) - (bits & Btn.Down ? 1 : 0);
  const steer = (bits & Btn.Right ? 1 : 0) - (bits & Btn.Left ? 1 : 0);
  const control = s.stun > 0 ? 0.15 : 1;

  // spool throttle / steering toward the pressed keys
  const thrTarget = throttle * control;
  s.thr = approach(s.thr, thrTarget, (Math.abs(thrTarget) > Math.abs(s.thr) && Math.sign(thrTarget) === Math.sign(s.thr || thrTarget) ? THROTTLE_RAMP : THROTTLE_RELEASE) * dt);
  s.str = approach(s.str, steer, STEER_RATE * dt);

  // boost meter / timers
  const boosting = isBoosting(s, bits);
  if (bits & Btn.Boost && s.overdrive <= 0 && s.boostTimer <= 0 && s.boost > 0) s.boost = Math.max(0, s.boost - BOOST_DRAIN * dt);
  else if (!(bits & Btn.Boost)) s.boost = Math.min(BOOST_MAX, s.boost + BOOST_REGEN * dt);
  const maxSpd = k.maxSpeed * (boosting ? BOOST_MULT : 1);

  let fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
  let rx = -fz, rz = fx;
  let fwd = s.vx * fx + s.vz * fz;
  let lat = s.vx * rx + s.vz * rz;

  if (s.grounded) {
    const power = boosting ? Math.max(s.thr, 1) : s.thr;
    if (power > 0.01) {
      if (fwd < -0.5) fwd = Math.min(0, fwd + (BRAKE + COAST) * power * dt);           // braking out of reverse
      else if (fwd < maxSpd) fwd = Math.min(maxSpd, fwd + k.accel * power * (1 - ENGINE_TAPER * (Math.max(0, fwd) / maxSpd) ** 2) * dt * (boosting ? 1.8 : 1));
    } else if (power < -0.01) {
      const revMax = maxSpd * REVERSE_FRAC;
      if (fwd > 0.5) fwd = Math.max(0, fwd - (BRAKE + COAST) * -power * dt);           // braking forward motion
      else if (fwd > -revMax) fwd = Math.max(-revMax, fwd - k.accel * -power * (1 - ENGINE_TAPER * (Math.max(0, -fwd) / revMax) ** 2) * dt);
    }
    if (Math.abs(power) < 0.5) fwd -= Math.sign(fwd) * Math.min(Math.abs(fwd), COAST * (1 - Math.abs(power) * 2) * dt);
    if (fwd > maxSpd) fwd = Math.max(maxSpd, fwd - 20 * dt);
  } else {
    fwd *= 1 - 0.1 * dt;
  }

  // optional drift: hold Drift while steering at speed; release after charging for a mini-turbo
  if (s.drift === 0) {
    if (bits & Btn.Drift && s.grounded && steer !== 0 && fwd > 9 && s.stun <= 0) {
      s.drift = steer;
      s.driftTime = 0;
      s.vy = HOP_SPEED;
      s.grounded = false;
      ev |= KEv.Hop;
    }
  } else if (!(bits & Btn.Drift) || fwd < 5 || s.stun > 0) {
    if (s.driftTime > 1.6) { s.boostTimer = Math.max(s.boostTimer, 1.1); ev |= KEv.SuperTurbo; }
    else if (s.driftTime > 0.75) { s.boostTimer = Math.max(s.boostTimer, 0.6); ev |= KEv.MiniTurbo; }
    s.drift = 0;
    s.driftTime = 0;
  } else if (s.grounded) {
    s.driftTime += dt;
  }

  // steering (reversing steers like a car: the back end swings the other way)
  const turn = k.turnRate * (s.grounded ? 1 : 0.4) * control;
  let yawRate: number;
  if (s.drift !== 0) {
    yawRate = -s.drift * turn * (0.7 + 0.4 * s.str * s.drift);
  } else {
    const speedFactor = clamp(Math.abs(fwd) / 6, 0, 1) * (fwd >= -0.5 ? 1 : -1) * (1 - 0.15 * clamp(fwd / k.maxSpeed, 0, 1));
    yawRate = -s.str * turn * speedFactor;
  }
  const vx = fx * fwd + rx * lat, vz = fz * fwd + rz * lat;
  s.yaw += yawRate * dt;
  fx = Math.sin(s.yaw); fz = Math.cos(s.yaw); rx = -fz; rz = fx;
  fwd = vx * fx + vz * fz;
  lat = vx * rx + vz * rz;
  if (s.drift !== 0 && s.grounded) {
    // drift: travel direction trails the body by a fixed slip angle and speed is held
    const sp = Math.min(maxSpd, Math.hypot(vx, vz));
    const cur = Math.atan2(vx, vz);
    const want = s.yaw + s.drift * DRIFT_SLIP;
    const rate = (4 + 3 * a.grip) * dt;
    const h = cur + clamp(wrapAngle(want - cur), -rate, rate);
    s.vx = Math.sin(h) * sp;
    s.vz = Math.cos(h) * sp;
  } else {
    // hard steering at speed loosens grip so the kart slides through corners
    const slide = Math.abs(s.str) * clamp((Math.abs(fwd) - SLIDE_SPEED) / 10, 0, 1);
    const grip = k.grip * a.grip * (1 - 0.6 * slide) * (s.grounded ? 1 : 0.05);
    lat *= Math.exp(-grip * dt);
    s.vx = fx * fwd + rx * lat;
    s.vz = fz * fwd + rz * lat;
  }

  // integrate + walls (head-on impacts kill most of the speed)
  s.x += s.vx * dt;
  s.z += s.vz * dt;
  const c = collideCircle(a, s, KART_RADIUS);
  if (c) {
    const vn = s.vx * c.nx + s.vz * c.nz;
    if (vn < 0) {
      s.vx -= 1.25 * vn * c.nx;
      s.vz -= 1.25 * vn * c.nz;
      s.vx *= 0.94; s.vz *= 0.94;
      if (vn < -8) ev |= KEv.Wall;
    }
  }
  s.x = clamp(s.x, -a.halfW + KART_RADIUS, a.halfW - KART_RADIUS);
  s.z = clamp(s.z, -a.halfD + KART_RADIUS, a.halfD - KART_RADIUS);

  // vertical: follow ground, launch off edges with the vertical speed gained while climbing
  const g = groundAt(a, s.x, s.z, s.y);
  if (s.grounded) {
    if (g >= s.y) {
      s.vy = Math.min((g - s.y) / dt, MAX_CLIMB_VY);
      s.y = g;
    } else if (s.y - g < 0.3) {
      s.y = g;
      s.vy = 0;
    } else {
      s.grounded = false;
    }
  }
  if (!s.grounded) {
    s.vy -= GRAVITY * dt;
    s.y += s.vy * dt;
    if (s.y <= g) {
      if (s.vy < -10) ev |= KEv.Land;
      s.y = g;
      s.vy = 0;
      s.grounded = true;
    }
  }

  if (s.grounded && padAt(a, s.x, s.z, s.y)) {
    if (s.boostTimer < 0.3) ev |= KEv.Pad;
    s.boostTimer = Math.max(s.boostTimer, 1.0);
  }

  s.boostTimer = Math.max(0, s.boostTimer - dt);
  s.overdrive = Math.max(0, s.overdrive - dt);
  s.stun = Math.max(0, s.stun - dt);
  return ev;
}

/** Forward speed helper for HUD / audio. */
export const forwardSpeed = (s: KartPhys) => s.vx * Math.sin(s.yaw) + s.vz * Math.cos(s.yaw);
/** Sideways slip speed (skid marks / smoke when large). */
export const lateralSpeed = (s: KartPhys) => -s.vx * Math.cos(s.yaw) + s.vz * Math.sin(s.yaw);
