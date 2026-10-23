import * as THREE from "three";
import { Item } from "../../../shared/src/index.ts";
import { merge, roundedBlock, tint } from "./geometry.ts";

// Weapon art: detailed procedural models for the mounted pods and the projectiles.
// Origin of a mount = the attach point on the kart; barrels point +Z.

const ni = (g: THREE.BufferGeometry) => (g.index ? g.toNonIndexed() : g);
type Xf = { x?: number; y?: number; z?: number; rx?: number; ry?: number; rz?: number; sx?: number; sy?: number; sz?: number };
function p(g: THREE.BufferGeometry, color: string, t: Xf = {}) {
  g.scale(t.sx ?? 1, t.sy ?? 1, t.sz ?? 1);
  if (t.rx) g.rotateX(t.rx);
  if (t.ry) g.rotateY(t.ry);
  if (t.rz) g.rotateZ(t.rz);
  g.translate(t.x ?? 0, t.y ?? 0, t.z ?? 0);
  const n = ni(g);
  if (n.attributes.uv) n.deleteAttribute("uv");
  return tint(n, color);
}
const rb = (x: number, y0: number, z: number, w: number, h: number, d: number, c: string, r?: number) => {
  const g = roundedBlock(x, z, w, h, d, c, y0, r);
  g.deleteAttribute("uv");
  return g;
};
/** Cylinder lying along Z. */
const tube = (r0: number, r1: number, len: number, seg = 16) => new THREE.CylinderGeometry(r1, r0, len, seg).rotateX(Math.PI / 2);

const GUNMETAL = "#4a4f5e", STEEL = "#c3c9d6", DARK = "#24242e", BRASS = "#e2b544", YELLOW = "#ffc933", RED = "#ff4b4b";

/** Hazard stripes along a box face (alternating yellow/black slabs). */
function hazard(x: number, y0: number, z: number, w: number, h: number, d: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const n = 5;
  for (let i = 0; i < n; i++) out.push(rb(x - w / 2 + (i + 0.5) * (w / n), y0, z, w / n + 0.002, h, d, i % 2 ? DARK : YELLOW, 0.01));
  return out;
}

export interface MountGeo { body: THREE.BufferGeometry; spin?: THREE.BufferGeometry; muzzle: number }

function minigun(): MountGeo {
  const body = merge([
    rb(0, -0.42, -0.25, 0.14, 0.34, 0.26, DARK, 0.04),                                         // bracket
    p(tube(0.19, 0.19, 0.46), GUNMETAL, { z: -0.12 }),                                          // motor housing
    p(tube(0.2, 0.2, 0.06), DARK, { z: 0.12 }),
    p(tube(0.12, 0.12, 0.14), STEEL, { z: -0.4 }),                                             // rear cap
    rb(0.27, -0.16, -0.14, 0.2, 0.3, 0.34, YELLOW, 0.05),                                       // ammo drum
    rb(0.27, -0.03, -0.14, 0.21, 0.05, 0.35, DARK, 0.01),
    p(new THREE.TorusGeometry(0.12, 0.025, 6, 12, Math.PI), BRASS, { x: 0.18, y: 0.02, z: 0.0, ry: Math.PI / 2 }),  // ammo belt
  ]);
  const barrels: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2, bx = Math.cos(a) * 0.1, by = Math.sin(a) * 0.1;
    barrels.push(p(tube(0.04, 0.04, 0.95, 10), STEEL, { x: bx, y: by, z: 0.55 }));
    barrels.push(p(tube(0.048, 0.048, 0.06, 10), DARK, { x: bx, y: by, z: 1.0 }));
  }
  barrels.push(p(tube(0.17, 0.17, 0.07), GUNMETAL, { z: 0.42 }), p(tube(0.17, 0.17, 0.06), GUNMETAL, { z: 0.85 }), p(tube(0.04, 0.04, 0.9), DARK, { z: 0.55 }));
  return { body, spin: merge(barrels), muzzle: 1.05 };
}

function rocketPod(): MountGeo {
  const parts = [
    rb(0, -0.42, -0.2, 0.14, 0.3, 0.24, DARK, 0.04),
    rb(0, -0.24, 0.05, 0.5, 0.48, 0.86, "#eef1f6", 0.08),
    rb(0, -0.24, 0.05, 0.52, 0.1, 0.88, RED, 0.03),
    rb(0, 0.14, 0.05, 0.52, 0.06, 0.88, RED, 0.02),
  ];
  for (const [ox, oy] of [[-0.12, 0.08], [0.12, 0.08], [-0.12, -0.12], [0.12, -0.12]]) {
    parts.push(p(tube(0.095, 0.095, 0.06, 14), DARK, { x: ox, y: oy, z: 0.49 }));
    parts.push(p(new THREE.ConeGeometry(0.075, 0.2, 12).rotateX(Math.PI / 2), RED, { x: ox, y: oy, z: 0.5 }));
  }
  return { body: merge(parts), muzzle: 0.55 };
}

function homingLauncher(n: 1 | 3): MountGeo {
  const parts = [rb(0, -0.42, -0.2, 0.14, 0.3, 0.24, DARK, 0.04)];
  const offs = n === 1 ? [[0, 0, 0.19]] : [[0, 0.13, 0.11], [-0.12, -0.08, 0.11], [0.12, -0.08, 0.11]];
  for (const [ox, oy, r] of offs) {
    parts.push(p(tube(r, r, 0.95, 16), n === 1 ? "#5d6b7d" : "#ff9b3d", { x: ox, y: oy, z: 0.05 }));
    parts.push(p(tube(r * 1.12, r * 1.12, 0.08, 16), YELLOW, { x: ox, y: oy, z: 0.35 }));
    parts.push(p(tube(r * 1.12, r * 1.12, 0.08, 16), DARK, { x: ox, y: oy, z: -0.38 }));
    // missile nose with a glossy seeker
    parts.push(p(new THREE.SphereGeometry(r * 0.85, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), "#1f2a44", { x: ox, y: oy, z: 0.52 }));
  }
  if (n === 1) for (const a of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) parts.push(rb(Math.cos(a) * 0.2, Math.sin(a) * 0.2 - 0.12, -0.42, Math.abs(Math.cos(a)) * 0.16 + 0.03, Math.abs(Math.sin(a)) * 0.16 + 0.03, 0.22, YELLOW, 0.01));
  if (n === 3) parts.push(p(tube(0.25, 0.25, 0.08, 18), DARK, { z: 0.05 }));
  return { body: merge(parts), muzzle: 0.6 };
}

function mortar(): MountGeo {
  const parts = [
    rb(0, -0.42, -0.1, 0.42, 0.14, 0.42, DARK, 0.05),
    p(tube(0.22, 0.17, 0.7, 18), "#6a5a7e", { y: 0.05, z: 0.1, rx: -Math.PI / 4 }),
    p(tube(0.24, 0.24, 0.08, 18), YELLOW, { y: 0.27, z: 0.32, rx: -Math.PI / 4 }),
    p(new THREE.SphereGeometry(0.16, 14, 10), "#2c2638", { y: 0.33, z: 0.38 }),
    p(tube(0.03, 0.03, 0.14, 6), "#c9b38a", { y: 0.49, z: 0.42, rx: -0.6 }),
    p(new THREE.SphereGeometry(0.05, 8, 6), "#ffd23f", { y: 0.56, z: 0.47 }),
  ];
  return { body: merge(parts), muzzle: 0.55 };
}

function cannon(): MountGeo {
  const parts = [
    rb(0, -0.42, -0.2, 0.36, 0.22, 0.4, DARK, 0.05),
    p(tube(0.23, 0.16, 1.15, 20), "#3a3448", { z: 0.2 }),
    p(new THREE.SphereGeometry(0.24, 16, 12), "#3a3448", { z: -0.38 }),
    p(tube(0.25, 0.25, 0.08, 20), BRASS, { z: -0.12 }),
    p(tube(0.2, 0.2, 0.07, 20), BRASS, { z: 0.35 }),
    p(tube(0.22, 0.21, 0.14, 20), "#2a2636", { z: 0.8 }),
    p(tube(0.15, 0.15, 0.02, 20), "#0f0f14", { z: 0.88 }),
    p(tube(0.06, 0.06, 0.62, 10), STEEL, { ry: Math.PI / 2, y: -0.05, z: -0.15 }),
  ];
  return { body: merge(parts), muzzle: 0.9 };
}

function mineDispenser(): MountGeo {
  const parts = [
    rb(0, -0.42, -0.1, 0.14, 0.2, 0.24, DARK, 0.04),
    rb(0, -0.24, -0.05, 0.52, 0.42, 0.56, "#3a3444", 0.08),
    ...hazard(0, -0.08, 0.235, 0.54, 0.12, 0.04),
    p(new THREE.SphereGeometry(0.07, 10, 8), RED, { y: 0.24, z: -0.05 }),
    ...spikyMineParts(0.18).map((g) => g.translate(0, 0.02, -0.38)),
  ];
  return { body: merge(parts), muzzle: -0.4 };
}

export const MOUNTS: Partial<Record<number, MountGeo>> = {
  [Item.Blaster]: minigun(),
  [Item.Rocket]: rocketPod(),
  [Item.Hornet]: homingLauncher(1),
  [Item.Triple]: homingLauncher(3),
  [Item.Lobber]: mortar(),
  [Item.Cannon]: cannon(),
  [Item.Mine]: mineDispenser(),
};

// ------------------------------------------------------------------ projectiles

/** Naval-mine style: dark ball with a red band and 14 steel spikes. */
function spikyMineParts(r: number): THREE.BufferGeometry[] {
  const out = [p(new THREE.SphereGeometry(r, 16, 12), "#3a3444"), p(new THREE.TorusGeometry(r * 1.01, r * 0.12, 6, 24), RED, { rx: Math.PI / 2 })];
  const dirs = new THREE.IcosahedronGeometry(1, 0).attributes.position;
  const seen = new Set<string>();
  const v = new THREE.Vector3();
  for (let i = 0; i < dirs.count; i++) {
    v.fromBufferAttribute(dirs, i).normalize();
    const key = `${v.x.toFixed(2)},${v.y.toFixed(2)},${v.z.toFixed(2)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const cone = new THREE.ConeGeometry(r * 0.17, r * 0.75, 8);
    cone.translate(0, r + r * 0.3, 0);
    cone.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v));
    out.push(p(cone, STEEL));
    const tip = new THREE.SphereGeometry(r * 0.07, 6, 4);
    tip.translate(v.x * r * 1.68, v.y * r * 1.68, v.z * r * 1.68);
    out.push(p(tip, DARK));
  }
  return out;
}

export function mineGeometry() {
  const g = merge(spikyMineParts(0.42));
  g.scale(1, 0.85, 1);
  g.translate(0, 0.25, 0);
  return g;
}

export function rocketGeometry() {
  return merge([
    p(tube(0.2, 0.2, 1.0, 14), "#f4f6fa"),
    p(new THREE.ConeGeometry(0.2, 0.5, 14).rotateX(Math.PI / 2), RED, { z: 0.75 }),
    p(tube(0.21, 0.21, 0.1, 14), RED, { z: 0.2 }),
    p(tube(0.16, 0.12, 0.18, 12), DARK, { z: -0.58 }),
    ...[0, 1, 2, 3].map((i) => {
      const fin = new THREE.BoxGeometry(0.05, 0.36, 0.34);
      fin.translate(0, 0.27, -0.38);
      fin.rotateZ((i * Math.PI) / 2 + Math.PI / 4);
      return p(fin, YELLOW);
    }),
  ]);
}

export function hornetGeometry() {
  return merge([
    p(tube(0.15, 0.15, 0.85, 12), "#5d6b7d"),
    p(new THREE.SphereGeometry(0.15, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), "#1f2a44", { z: 0.42 }),
    p(tube(0.16, 0.16, 0.08, 12), YELLOW, { z: 0.2 }),
    ...[0, 1, 2, 3].map((i) => {
      const fin = new THREE.BoxGeometry(0.04, 0.3, 0.26);
      fin.translate(0, 0.2, -0.33);
      fin.rotateZ((i * Math.PI) / 2);
      return p(fin, YELLOW);
    }),
    ...[0, 1, 2, 3].map((i) => {
      const can = new THREE.BoxGeometry(0.03, 0.14, 0.12);
      can.translate(0, 0.17, 0.25);
      can.rotateZ((i * Math.PI) / 2);
      return p(can, DARK);
    }),
  ]);
}

export function bombGeometry() {
  return merge([
    p(new THREE.SphereGeometry(0.5, 18, 14), "#2c2638"),
    p(new THREE.SphereGeometry(0.16, 10, 8), "#6f6787", { x: -0.2, y: 0.22, z: 0.25 }),
    p(tube(0.13, 0.13, 0.22, 10).rotateX(-Math.PI / 2), STEEL, { y: 0.55 }),
    p(tube(0.03, 0.03, 0.25, 6).rotateX(-Math.PI / 2), "#c9b38a", { y: 0.75, x: 0.04 }),
  ]);
}

export function ballGeometry() {
  return merge([
    p(new THREE.SphereGeometry(0.55, 20, 14), "#26222f"),
    p(new THREE.SphereGeometry(0.17, 10, 8), "#6b6780", { x: 0.22, y: 0.25, z: 0.3 }),
    p(new THREE.TorusGeometry(0.55, 0.05, 6, 24), BRASS, { rx: Math.PI / 2 }),
  ]);
}

/** Metallic weapon material: needs scene.environment for reflections (set in GameScene). */
export const weaponMat = new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.45, roughness: 0.38, envMapIntensity: 0.9 });
