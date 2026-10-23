export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Wrap an angle to (-PI, PI]. */
export function wrapAngle(a: number): number {
  a %= Math.PI * 2;
  if (a > Math.PI) a -= Math.PI * 2;
  else if (a <= -Math.PI) a += Math.PI * 2;
  return a;
}

export const lerpAngle = (a: number, b: number, t: number) => a + wrapAngle(b - a) * t;

/** Heading convention: yaw 0 faces +Z, forward = (sin yaw, cos yaw). */
export const headingTo = (dx: number, dz: number) => Math.atan2(dx, dz);

export const dist2 = (ax: number, az: number, bx: number, bz: number) => {
  const dx = ax - bx, dz = az - bz;
  return dx * dx + dz * dz;
};

/** Quantize to 2 decimals for compact snapshots. */
export const q2 = (v: number) => Math.round(v * 100) / 100;
export const q3 = (v: number) => Math.round(v * 1000) / 1000;

/** Small deterministic PRNG (mulberry32). */
export function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export type Rng = ReturnType<typeof makeRng>;
