import { buildArena, segmentClear, segmentHazard, type Arena, type ArenaDef, type Block, type Decor, type Paint, type SpawnPoint } from "./arena.ts";
import { headingTo } from "./math.ts";

// Original arenas in a bright, toy-like style. Scale: about 80 kart-widths across, about 5.5 s
// to cross at top speed.
// Geometry is boxes and wedge ramps only, so the same data drives physics and rendering.

const mirror4 = (x: number, z: number): [number, number][] => [[x, z], [-x, z], [x, -z], [-x, -z]];
const faceCenter = (pts: [number, number][]): SpawnPoint[] => pts.map(([x, z]) => ({ x, z, yaw: headingTo(-x, -z) }));

function ringDecor(halfW: number, halfD: number, kinds: Decor["kind"][], count: number, seed: number, near = 8, far = 40): Decor[] {
  const out: Decor[] = [];
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < count; i++) {
    const side = i % 4;
    const t = rnd() * 2 - 1;
    const off = near + rnd() * (far - near);
    const x = side < 2 ? t * (halfW + 20) : (side === 2 ? 1 : -1) * (halfW + off);
    const z = side < 2 ? (side === 0 ? 1 : -1) * (halfD + off) : t * (halfD + 20);
    out.push({ x, z, s: 0.8 + rnd() * 1.4, kind: kinds[Math.floor(rnd() * kinds.length)] });
  }
  return out;
}

/** Dashed centre lines running along a road segment. */
const dashes = (x: number, z: number, len: number, alongX: boolean): Paint => ({ x, z, w: alongX ? len : 0.5, d: alongX ? 0.5 : len, kind: "dash", rot: alongX ? 1 : 0 });

// ------------------------------------------------------------------ Sunny Isle
const isle: ArenaDef = {
  id: "isle",
  name: "Sunny Isle",
  blurb: "A seaside street circuit: grass islands, a central plaza and jump ramps on the coast road.",
  size: [150, 150],
  grip: 1,
  style: "island",
  wallHeight: 1.6,
  theme: { sky: "#8fd3ff", fog: "#cdeeff", floor: "#d9dde6", floorAlt: "#cfd4de", wall: "#8f3fe0", block: "#ffcf3a", platform: "#56d364", ramp: "#ff8fb8", accent: "#7ef0c8", sun: "#fff6e0", ambient: "#dff3ff" },
  blocks: [
    { x: 0, z: 0, w: 30, d: 30, h: 2.2, style: "grass" },
    { x: 42, z: 0, w: 10, d: 50, h: 0.9, style: "grass" },
    { x: -42, z: 0, w: 10, d: 50, h: 0.9, style: "grass" },
    { x: 0, z: 42, w: 50, d: 10, h: 0.9, style: "grass" },
    { x: 0, z: -42, w: 50, d: 10, h: 0.9, style: "grass" },
    { x: 62, z: 62, w: 9, d: 9, h: 2.4, style: "block", color: "#ffcf3a" },
    { x: -62, z: 62, w: 9, d: 9, h: 2.4, style: "block", color: "#3fa7ff" },
    { x: 62, z: -62, w: 9, d: 9, h: 2.4, style: "block", color: "#ff5d5d" },
    { x: -62, z: -62, w: 9, d: 9, h: 2.4, style: "block", color: "#4fd67a" },
    ...mirror4(26, 26).map(([x, z]): Block => ({ x, z, w: 3, d: 3, h: 3.5, style: "pillar" })),
  ],
  ramps: [
    { x: 0, z: 20, w: 9, d: 10, h: 2.2, dir: 3 },
    { x: 0, z: -20, w: 9, d: 10, h: 2.2, dir: 2 },
    { x: 20, z: 0, w: 10, d: 9, h: 2.2, dir: 1 },
    { x: -20, z: 0, w: 10, d: 9, h: 2.2, dir: 0 },
    { x: 62, z: -8, w: 8, d: 9, h: 1.8, dir: 2 },
    { x: -62, z: 8, w: 8, d: 9, h: 1.8, dir: 3 },
    { x: 8, z: 62, w: 9, d: 8, h: 1.8, dir: 1 },
    { x: -8, z: -62, w: 9, d: 8, h: 1.8, dir: 0 },
  ],
  pads: [
    { x: 30, z: 30, w: 4, d: 10, yaw: 0 },
    { x: -30, z: -30, w: 4, d: 10, yaw: Math.PI },
    { x: -30, z: 30, w: 10, d: 4, yaw: Math.PI / 2 },
    { x: 30, z: -30, w: 10, d: 4, yaw: -Math.PI / 2 },
  ],
  crates: [[0, 0], [-7, 0], [7, 0], ...mirror4(28, 12), [12, 28], [-12, 28], [12, -28], [-12, -28], ...mirror4(52, 52), [62, 30], [-62, -30], [30, -62], [-30, 62]],
  nitros: [],
  spawns: faceCenter([...mirror4(60, 44), [44, 60], [-44, -60], [44, -60], [-44, 60]]),
  paint: [
    // coast road lane markings
    dashes(61, 0, 110, false), dashes(-61, 0, 110, false), dashes(0, 61, 110, true), dashes(0, -61, 110, true),
    // zebra crossings where the islands end
    { x: 42, z: 31, w: 10, d: 5, kind: "zebra", rot: 0 }, { x: 42, z: -31, w: 10, d: 5, kind: "zebra", rot: 0 },
    { x: -42, z: 31, w: 10, d: 5, kind: "zebra", rot: 0 }, { x: -42, z: -31, w: 10, d: 5, kind: "zebra", rot: 0 },
    { x: 31, z: 42, w: 5, d: 10, kind: "zebra", rot: 1 }, { x: -31, z: 42, w: 5, d: 10, kind: "zebra", rot: 1 },
    { x: 31, z: -42, w: 5, d: 10, kind: "zebra", rot: 1 }, { x: -31, z: -42, w: 5, d: 10, kind: "zebra", rot: 1 },
    // red/white kerbs inside the sea wall
    { x: 0, z: 73.5, w: 146, d: 2, kind: "kerb", rot: 1 }, { x: 0, z: -73.5, w: 146, d: 2, kind: "kerb", rot: 1 },
    { x: 73.5, z: 0, w: 2, d: 146, kind: "kerb", rot: 0 }, { x: -73.5, z: 0, w: 2, d: 146, kind: "kerb", rot: 0 },
  ],
  decor: [...ringDecor(75, 75, ["palm", "palm", "rock"], 36, 7, 6, 18), ...ringDecor(75, 75, ["cloud"], 14, 3, 80, 160)],
  hazards: [],
};

// ------------------------------------------------------------------ Sky Bakery
const bakery: ArenaDef = {
  id: "bakery",
  name: "Sky Bakery",
  blurb: "Floating candy courts above the clouds, with frosted plateaus, zig-zag ramps and a central chute.",
  size: [160, 130],
  grip: 1,
  style: "sky",
  wallHeight: 1.8,
  theme: { sky: "#9fdcff", fog: "#e9f6ff", floor: "#38c6f4", floorAlt: "#2bb5e6", wall: "#8f3fe0", block: "#ff6fb5", platform: "#ffad5a", ramp: "#ff5fa8", accent: "#ffe27a", sun: "#fff8ec", ambient: "#e8f6ff" },
  blocks: [
    { x: -48, z: 0, w: 30, d: 40, h: 3.2, style: "cake" },
    { x: 48, z: 0, w: 30, d: 40, h: 3.2, style: "cake" },
    { x: 0, z: 14, w: 30, d: 2, h: 1.5, style: "wall" },
    { x: 0, z: -14, w: 30, d: 2, h: 1.5, style: "wall" },
    ...mirror4(14, 40).map(([x, z]): Block => ({ x, z, w: 4, d: 4, h: 6, style: "pillar" })),
    ...mirror4(70, 30).map(([x, z]): Block => ({ x, z, w: 5, d: 5, h: 2.2, style: "block", color: z > 0 ? "#ffd23f" : "#7bd389" })),
  ],
  ramps: [
    { x: -27, z: 0, w: 12, d: 12, h: 3.2, dir: 1 },
    { x: 27, z: 0, w: 12, d: 12, h: 3.2, dir: 0 },
    { x: -48, z: 27, w: 10, d: 14, h: 3.2, dir: 3 },
    { x: 48, z: -27, w: 10, d: 14, h: 3.2, dir: 2 },
    { x: 0, z: -46, w: 9, d: 10, h: 2.0, dir: 2 },
    { x: 0, z: 46, w: 9, d: 10, h: 2.0, dir: 3 },
  ],
  pads: [
    { x: 0, z: 0, w: 14, d: 4, yaw: Math.PI / 2 },
    { x: -48, z: -10, w: 4, d: 12, yaw: Math.PI },
    { x: 48, z: 10, w: 4, d: 12, yaw: 0 },
  ],
  crates: [[-48, 10], [-48, -6], [48, -10], [48, 6], [-8, 0], [8, 0], [0, 30], [0, -30], ...mirror4(30, 40), [70, 0], [-70, 0], ...mirror4(70, 52)],
  nitros: [],
  spawns: faceCenter([...mirror4(70, 15), [24, 56], [-24, -56], [24, -56], [-24, 56]]),
  paint: [
    { x: 0, z: 0, w: 30, d: 0.6, kind: "lane", rot: 1 },
    { x: 0, z: 30, w: 50, d: 0.5, kind: "dash", rot: 1 }, { x: 0, z: -30, w: 50, d: 0.5, kind: "dash", rot: 1 },
    { x: 0, z: 63.5, w: 156, d: 2, kind: "kerb", rot: 1 }, { x: 0, z: -63.5, w: 156, d: 2, kind: "kerb", rot: 1 },
    { x: 78.5, z: 0, w: 2, d: 126, kind: "kerb", rot: 0 }, { x: -78.5, z: 0, w: 2, d: 126, kind: "kerb", rot: 0 },
  ],
  decor: [...ringDecor(80, 65, ["cake", "cake", "balloon"], 22, 11, 14, 60), ...ringDecor(80, 65, ["cloud"], 26, 5, 10, 120)],
  hazards: [],
};

// ------------------------------------------------------------------ Frosty Bay
const bay: ArenaDef = {
  id: "bay",
  name: "Frosty Bay",
  blurb: "A slippery ice rink on the bay, with a walled inner ring and ramps that vault over it.",
  size: [140, 140],
  grip: 0.5,
  style: "ice",
  wallHeight: 1.6,
  theme: { sky: "#a8dcff", fog: "#e6f5ff", floor: "#eaf7ff", floorAlt: "#dcf0fd", wall: "#4d8dff", block: "#9fd9ff", platform: "#ffffff", ramp: "#ff8fb8", accent: "#ff5fa8", sun: "#ffffff", ambient: "#e2f1ff" },
  blocks: [
    { x: 0, z: 0, w: 14, d: 14, h: 1.8, style: "platform" },
    ...[18.5, -18.5].flatMap((c): Block[] => [
      { x: c, z: 30, w: 23, d: 2, h: 1.5, style: "wall" },
      { x: c, z: -30, w: 23, d: 2, h: 1.5, style: "wall" },
      { x: 30, z: c, w: 2, d: 23, h: 1.5, style: "wall" },
      { x: -30, z: c, w: 2, d: 23, h: 1.5, style: "wall" },
    ]),
    ...mirror4(50, 50).map(([x, z]): Block => ({ x, z, w: 4, d: 4, h: 5, style: "pillar" })),
    { x: 0, z: 56, w: 4, d: 4, h: 5, style: "pillar" },
    { x: 0, z: -56, w: 4, d: 4, h: 5, style: "pillar" },
  ],
  ramps: [
    { x: 0, z: 11, w: 7, d: 8, h: 1.8, dir: 3 },
    { x: 0, z: -11, w: 7, d: 8, h: 1.8, dir: 2 },
    { x: 50, z: 0, w: 10, d: 8, h: 1.7, dir: 1 },
    { x: -50, z: 0, w: 10, d: 8, h: 1.7, dir: 0 },
  ],
  pads: [
    { x: 0, z: 44, w: 14, d: 4, yaw: Math.PI / 2 },
    { x: 0, z: -44, w: 14, d: 4, yaw: -Math.PI / 2 },
  ],
  crates: [[0, 0], ...mirror4(16, 16), ...mirror4(50, 26), [26, 50], [-26, -50], [26, -50], [-26, 50], [0, 64], [0, -64]],
  nitros: [],
  spawns: faceCenter([...mirror4(60, 60), [62, 16], [-62, -16], [16, -62], [-16, 62]]),
  paint: [
    { x: 0, z: 0, w: 140, d: 0.6, kind: "lane", rot: 1 },
    { x: 0, z: 0, w: 0.6, d: 140, kind: "lane", rot: 0 },
    { x: 0, z: 68.5, w: 136, d: 2, kind: "kerb", rot: 1 }, { x: 0, z: -68.5, w: 136, d: 2, kind: "kerb", rot: 1 },
    { x: 68.5, z: 0, w: 2, d: 136, kind: "kerb", rot: 0 }, { x: -68.5, z: 0, w: 2, d: 136, kind: "kerb", rot: 0 },
  ],
  decor: [...ringDecor(70, 70, ["pine", "pine", "iceberg"], 40, 23, 6, 30), ...ringDecor(70, 70, ["cloud"], 12, 9, 90, 160)],
  hazards: [],
};

// ------------------------------------------------------------------ Lava Pit
const lavaRiver = [[-59.75, 30.5], [-20, 31], [20, 31], [59.75, 30.5]] as const;
const lava: ArenaDef = {
  id: "lava",
  name: "Lava Pit",
  blurb: "A volcanic crater split by a lava river. Cross the bridges, or jump it. Don't get knocked in!",
  size: [150, 150],
  grip: 1,
  style: "lava",
  wallHeight: 1.8,
  theme: { sky: "#ff9f6b", fog: "#ffc3a0", floor: "#6a5670", floorAlt: "#5f4d66", wall: "#3b2f4a", block: "#7d6886", platform: "#8a7392", ramp: "#ffb03d", accent: "#ffb703", sun: "#ffe3c4", ambient: "#ffd9c7" },
  blocks: [
    ...mirror4(26, 36).map(([x, z]): Block => ({ x, z, w: 8, d: 6, h: 2.5, style: "block", color: "#7d6886" })),
    ...mirror4(62, 24).map(([x, z]): Block => ({ x, z, w: 4, d: 4, h: 5, style: "pillar" })),
    // bridge rails keep karts honest on the crossings
    ...[-44.1, -35.9, -4.1, 4.1, 35.9, 44.1].map((x): Block => ({ x, z: 0, w: 0.8, d: 7, h: 0.9, style: "wall" })),
    { x: 0, z: 30, w: 4, d: 4, h: 3, style: "pillar" },
    { x: 0, z: -30, w: 4, d: 4, h: 3, style: "pillar" },
  ],
  ramps: [
    { x: 20, z: -14, w: 8, d: 10, h: 1.8, dir: 2 },
    { x: -20, z: -14, w: 8, d: 10, h: 1.8, dir: 2 },
    { x: 20, z: 14, w: 8, d: 10, h: 1.8, dir: 3 },
    { x: -20, z: 14, w: 8, d: 10, h: 1.8, dir: 3 },
  ],
  pads: [
    { x: 0, z: 18, w: 7, d: 4, yaw: Math.PI },
    { x: 0, z: -18, w: 7, d: 4, yaw: 0 },
  ],
  crates: [[0, 10], [0, -10], ...mirror4(40, 15), ...mirror4(20, 32), [0, 62], [0, -62], ...mirror4(64, 36), [35, 60], [-35, -60]],
  nitros: [],
  spawns: faceCenter([...mirror4(30, 62), [66, 12], [-66, -12], [66, -12], [-66, 12]]),
  paint: [
    { x: 0, z: 73.5, w: 146, d: 2, kind: "kerb", rot: 1 }, { x: 0, z: -73.5, w: 146, d: 2, kind: "kerb", rot: 1 },
    { x: 73.5, z: 0, w: 2, d: 146, kind: "kerb", rot: 0 }, { x: -73.5, z: 0, w: 2, d: 146, kind: "kerb", rot: 0 },
    { x: -40, z: 0, w: 7.4, d: 7, kind: "zebra", rot: 1 }, { x: 0, z: 0, w: 7.4, d: 7, kind: "zebra", rot: 1 }, { x: 40, z: 0, w: 7.4, d: 7, kind: "zebra", rot: 1 },
  ],
  decor: [...ringDecor(75, 75, ["volcano", "rock", "rock"], 26, 31, 10, 60), ...ringDecor(75, 75, ["cloud"], 10, 13, 90, 160)],
  hazards: [...lavaRiver.map(([x, w]) => ({ x, z: 0, w, d: 7 })), ...mirror4(52, 52).map(([x, z]) => ({ x, z, w: 14, d: 14 }))],
};

// ------------------------------------------------------------------ Skate Park
const park: ArenaDef = {
  id: "park",
  name: "Skate Park",
  blurb: "Funbox, kickers, a spine and quarter-pipes. Built for big air.",
  size: [140, 120],
  grip: 1,
  style: "park",
  wallHeight: 1.4,
  theme: { sky: "#8fd3ff", fog: "#d6efff", floor: "#cdd2dc", floorAlt: "#c2c8d3", wall: "#ff7a59", block: "#3fa7ff", platform: "#ffd23f", ramp: "#3fa7ff", accent: "#ffffff", sun: "#fff6e0", ambient: "#e5f4ff" },
  blocks: [
    { x: 0, z: 0, w: 14, d: 10, h: 1.6, style: "platform" },
    ...mirror4(26, 22).map(([x, z]): Block => ({ x, z, w: 6, d: 1.6, h: 0.8, style: "block", color: "#ff6fb5" })),
    ...mirror4(46, 14).map(([x, z]): Block => ({ x, z, w: 7, d: 7, h: 1.2, style: "grass" })),
    { x: 58, z: 0, w: 2, d: 18, h: 0.4, style: "block", color: "#c77dff" },
    { x: -58, z: 0, w: 2, d: 18, h: 0.4, style: "block", color: "#c77dff" },
  ],
  ramps: [
    { x: 12, z: 0, w: 10, d: 8, h: 1.6, dir: 1 },
    { x: -12, z: 0, w: 10, d: 8, h: 1.6, dir: 0 },
    { x: 32, z: 0, w: 7, d: 8, h: 1.8, dir: 0 },
    { x: -32, z: 0, w: 7, d: 8, h: 1.8, dir: 1 },
    { x: -30, z: 53, w: 26, d: 8, h: 2.6, dir: 2 },
    { x: 30, z: -53, w: 26, d: 8, h: 2.6, dir: 3 },
    { x: 0, z: 37, w: 12, d: 8, h: 1.8, dir: 2 },
    { x: 0, z: 45, w: 12, d: 8, h: 1.8, dir: 3 },
    { x: 0, z: -37, w: 12, d: 8, h: 1.8, dir: 3 },
    { x: 0, z: -45, w: 12, d: 8, h: 1.8, dir: 2 },
  ],
  pads: [
    { x: 48, z: -32, w: 4, d: 10, yaw: 0 },
    { x: -48, z: 32, w: 4, d: 10, yaw: Math.PI },
    { x: 20, z: 30, w: 10, d: 4, yaw: Math.PI / 2 },
    { x: -20, z: -30, w: 10, d: 4, yaw: -Math.PI / 2 },
  ],
  crates: [[0, 0], [-5, 0], [5, 0], ...mirror4(18, 12), ...mirror4(52, 32), [0, 24], [0, -24], [30, 52], [-30, -52], ...mirror4(62, 48)],
  nitros: [],
  spawns: faceCenter([...mirror4(62, 30), [40, 52], [-40, -52], [40, -44], [-40, 44]]),
  paint: [
    { x: 0, z: 58.5, w: 136, d: 2, kind: "kerb", rot: 1 }, { x: 0, z: -58.5, w: 136, d: 2, kind: "kerb", rot: 1 },
    { x: 68.5, z: 0, w: 2, d: 116, kind: "kerb", rot: 0 }, { x: -68.5, z: 0, w: 2, d: 116, kind: "kerb", rot: 0 },
    { x: 0, z: 24, w: 40, d: 0.5, kind: "dash", rot: 1 }, { x: 0, z: -24, w: 40, d: 0.5, kind: "dash", rot: 1 },
  ],
  decor: [...ringDecor(70, 60, ["building", "building", "tree", "lamp"], 34, 17, 8, 50), ...ringDecor(70, 60, ["cloud"], 12, 19, 90, 160)],
  hazards: [],
};

export const ARENA_DEFS: ArenaDef[] = [isle, bakery, lava, bay, park];

/** Clear driving distance from (x,z) along yaw, checking the kart's width. */
function laneLength(a: Arena, x: number, z: number, yaw: number, max: number) {
  const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -fz, rz = fx;
  let best = max;
  for (const off of [-1.3, 0, 1.3]) {
    const x0 = x + rx * off, z0 = z + rz * off;
    const x1 = x0 + fx * max, z1 = z0 + fz * max;
    best = Math.min(best, segmentClear(a, x0, z0, x1, z1, 0.5) * max, segmentHazard(a, x0, z0, x1, z1, 1.5) * max);
  }
  return best;
}

/** Aim each spawn down the longest open lane that still points roughly toward the centre. */
function aimSpawns(a: Arena) {
  for (const sp of a.spawns) {
    const center = headingTo(-sp.x, -sp.z);
    let bestYaw = center, bestScore = -Infinity;
    for (let d = -90; d <= 90; d += 5) {
      const yaw = center + (d * Math.PI) / 180;
      const score = laneLength(a, sp.x, sp.z, yaw, 40) - Math.abs(d) * 0.08;
      if (score > bestScore) { bestScore = score; bestYaw = yaw; }
    }
    sp.yaw = bestYaw;
  }
}

const cache = new Map<string, Arena>();
export function getArena(id: string): Arena {
  let a = cache.get(id);
  if (!a) {
    const def = ARENA_DEFS.find((d) => d.id === id) ?? isle;
    a = buildArena({ ...def, spawns: def.spawns.map((s) => ({ ...s })) });
    aimSpawns(a);
    cache.set(id, a);
  }
  return a;
}
