import { STEP_HEIGHT } from "./constants.ts";

export type BlockStyle = "wall" | "block" | "platform" | "pillar" | "grass" | "cake";
/** Axis-aligned solid box standing on the floor. x/z is the centre, w/d full extents. */
export interface Block { x: number; z: number; w: number; d: number; h: number; style?: BlockStyle; color?: string }
/** Wedge ramp rising from 0 to h along dir: 0:+X 1:-X 2:+Z 3:-Z. */
export interface Ramp { x: number; z: number; w: number; d: number; h: number; dir: 0 | 1 | 2 | 3 }
/** Boost pad: driving over it grants a short free boost. yaw is the chevron direction. */
export interface Pad { x: number; z: number; w: number; d: number; yaw: number }
export interface SpawnPoint { x: number; z: number; yaw: number }
export interface Decor { x: number; z: number; s: number; kind: "tree" | "rock" | "crystal" | "tower" | "lamp" | "palm" | "cake" | "cloud" | "pine" | "iceberg" | "balloon" | "volcano" | "building" }
/** Purely visual floor markings. rot 1 rotates stripe direction by 90°. */
export interface Paint { x: number; z: number; w: number; d: number; kind: "zebra" | "dash" | "kerb" | "grass" | "lane" | "zigzag"; rot?: 0 | 1 }
export type ArenaStyle = "island" | "sky" | "ice" | "lava" | "park";
/** Floor area that wrecks any kart driving onto it (lava). */
export interface Hazard { x: number; z: number; w: number; d: number }

export interface ArenaTheme {
  sky: string;
  fog: string;
  floor: string;
  floorAlt: string;
  wall: string;
  block: string;
  platform: string;
  ramp: string;
  accent: string;
  sun: string;
  ambient: string;
}

export interface ArenaDef {
  id: string;
  name: string;
  blurb: string;
  /** Inner playable size (x, z). Perimeter walls are generated around it. */
  size: [number, number];
  /** Lateral grip multiplier (ice < 1). */
  grip: number;
  style: ArenaStyle;
  wallHeight: number;
  paint: Paint[];
  hazards: Hazard[];
  theme: ArenaTheme;
  blocks: Block[];
  ramps: Ramp[];
  pads: Pad[];
  crates: [number, number][];
  nitros: [number, number][];
  spawns: SpawnPoint[];
  decor: Decor[];
}

export interface Arena extends ArenaDef {
  /** blocks + perimeter walls */
  solids: Block[];
  halfW: number;
  halfD: number;
}

export function buildArena(def: ArenaDef): Arena {
  const [w, d] = def.size;
  const t = 3;
  const WALL_HEIGHT = def.wallHeight;
  const perimeter: Block[] = [
    { x: 0, z: d / 2 + t / 2, w: w + t * 2, d: t, h: WALL_HEIGHT, style: "wall" },
    { x: 0, z: -d / 2 - t / 2, w: w + t * 2, d: t, h: WALL_HEIGHT, style: "wall" },
    { x: w / 2 + t / 2, z: 0, w: t, d, h: WALL_HEIGHT, style: "wall" },
    { x: -w / 2 - t / 2, z: 0, w: t, d, h: WALL_HEIGHT, style: "wall" },
  ];
  return { ...def, solids: [...def.blocks, ...perimeter], halfW: w / 2, halfD: d / 2 };
}

export const inRect = (x: number, z: number, cx: number, cz: number, w: number, d: number, m = 0) =>
  Math.abs(x - cx) <= w / 2 + m && Math.abs(z - cz) <= d / 2 + m;

export function rampHeight(r: Ramp, x: number, z: number): number {
  let t: number;
  switch (r.dir) {
    case 0: t = (x - (r.x - r.w / 2)) / r.w; break;
    case 1: t = (r.x + r.w / 2 - x) / r.w; break;
    case 2: t = (z - (r.z - r.d / 2)) / r.d; break;
    default: t = (r.z + r.d / 2 - z) / r.d;
  }
  return r.h * Math.min(1, Math.max(0, t));
}

/** Ramps can be mounted when their surface is within this distance above the kart. */
const RAMP_STEP = 0.9;

/** Height of the walkable surface under (x,z) for an object currently at height y. */
export function groundAt(a: Arena, x: number, z: number, y: number): number {
  let g = 0;
  for (const b of a.solids) {
    if (b.h > g && b.h <= y + STEP_HEIGHT && inRect(x, z, b.x, b.z, b.w, b.d)) g = b.h;
  }
  for (const r of a.ramps) {
    if (!inRect(x, z, r.x, r.z, r.w, r.d)) continue;
    const h = rampHeight(r, x, z);
    if (h > g && h <= y + RAMP_STEP) g = h;
  }
  return g;
}

export interface Contact { nx: number; nz: number; depth: number }

/** Resolve a vertical cylinder (x,z,radius at height y) against solids. Mutates pos, returns strongest contact. */
export function collideCircle(a: Arena, pos: { x: number; z: number; y: number }, radius: number): Contact | null {
  let best: Contact | null = null;
  const test = (cx: number, cz: number, w: number, d: number) => {
    const hx = w / 2, hz = d / 2;
    const px = Math.max(cx - hx, Math.min(pos.x, cx + hx));
    const pz = Math.max(cz - hz, Math.min(pos.z, cz + hz));
    const dx = pos.x - px, dz = pos.z - pz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) return;
    let nx: number, nz: number, depth: number;
    if (d2 > 1e-8) {
      const dd = Math.sqrt(d2);
      nx = dx / dd; nz = dz / dd; depth = radius - dd;
    } else {
      // centre inside the box: push out along the shallowest axis
      const ox = hx - Math.abs(pos.x - cx), oz = hz - Math.abs(pos.z - cz);
      if (ox < oz) { nx = Math.sign(pos.x - cx) || 1; nz = 0; depth = ox + radius; }
      else { nx = 0; nz = Math.sign(pos.z - cz) || 1; depth = oz + radius; }
    }
    pos.x += nx * depth; pos.z += nz * depth;
    if (!best || depth > best.depth) best = { nx, nz, depth };
  };
  for (const b of a.solids) {
    if (pos.y >= b.h - STEP_HEIGHT) continue;
    test(b.x, b.z, b.w, b.d);
  }
  for (const r of a.ramps) {
    const px = Math.max(r.x - r.w / 2, Math.min(pos.x, r.x + r.w / 2));
    const pz = Math.max(r.z - r.d / 2, Math.min(pos.z, r.z + r.d / 2));
    if (pos.y + RAMP_STEP >= rampHeight(r, px, pz)) continue;
    test(r.x, r.z, r.w, r.d);
  }
  return best;
}

/** True if a small sphere at (x,y,z) is inside geometry. */
export function pointBlocked(a: Arena, x: number, y: number, z: number, r = 0.2): boolean {
  if (y <= 0) return true;
  for (const b of a.solids) if (y < b.h && inRect(x, z, b.x, b.z, b.w, b.d, r)) return true;
  for (const rp of a.ramps) if (inRect(x, z, rp.x, rp.z, rp.w, rp.d) && y < rampHeight(rp, x, z)) return true;
  return false;
}

/**
 * 2D segment vs solids taller than y. Returns the fraction [0,1] along the segment of the first hit
 * (1 = clear). Used for bot line-of-sight and steering feelers.
 */
export function segmentClear(a: Arena, x0: number, z0: number, x1: number, z1: number, y: number): number {
  let tMin = 1;
  const dx = x1 - x0, dz = z1 - z0;
  for (const b of a.solids) {
    if (b.h <= y) continue;
    let t0 = 0, t1 = tMin;
    const minX = b.x - b.w / 2, maxX = b.x + b.w / 2, minZ = b.z - b.d / 2, maxZ = b.z + b.d / 2;
    if (Math.abs(dx) < 1e-9) { if (x0 < minX || x0 > maxX) continue; }
    else {
      let ta = (minX - x0) / dx, tb = (maxX - x0) / dx;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) continue;
    }
    if (Math.abs(dz) < 1e-9) { if (z0 < minZ || z0 > maxZ) continue; }
    else {
      let ta = (minZ - z0) / dz, tb = (maxZ - z0) / dz;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) continue;
    }
    if (t0 < tMin) tMin = t0;
  }
  return tMin;
}

export function padAt(a: Arena, x: number, z: number, y: number): Pad | null {
  for (const p of a.pads) {
    if (inRect(x, z, p.x, p.z, p.w, p.d) && Math.abs(y - groundAt(a, p.x, p.z, y)) < 0.4) return p;
  }
  return null;
}

/** True when (x,z) is over a hazard (lava). */
export function hazardAt(a: Arena, x: number, z: number, margin = 0): boolean {
  for (const h of a.hazards) if (inRect(x, z, h.x, h.z, h.w, h.d, margin)) return true;
  return false;
}

/** Fraction of a 2D segment that is clear of hazards (1 = clear). */
export function segmentHazard(a: Arena, x0: number, z0: number, x1: number, z1: number, margin = 1.2): number {
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (hazardAt(a, x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, margin)) return (i - 1) / steps;
  }
  return 1;
}
