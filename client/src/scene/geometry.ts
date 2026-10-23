import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Block, Ramp } from "../../../shared/src/index.ts";

const tmpColor = new THREE.Color();

/** Paint every vertex of a geometry one colour (lets many differently coloured parts share one draw call). */
export function tint(g: THREE.BufferGeometry, color: THREE.ColorRepresentation) {
  tmpColor.set(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = tmpColor.r; arr[i * 3 + 1] = tmpColor.g; arr[i * 3 + 2] = tmpColor.b; }
  g.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return g;
}

/** Soft-edged toy block standing on the floor at (x,z), bottom at y0. */
export function roundedBlock(x: number, z: number, w: number, h: number, d: number, color: THREE.ColorRepresentation, y0 = 0, radius?: number) {
  const r = radius ?? Math.min(0.55, h / 2.6, w / 2.6, d / 2.6);
  const g = new RoundedBoxGeometry(w, h, d, 2, Math.max(0.02, r));
  g.translate(x, y0 + h / 2, z);
  return tint(g.index ? g.toNonIndexed() : g, color);
}

/** Box with UVs in world units (for tiling textures on tops). */
export function blockGeometry(b: Block, uvScale = 0.25) {
  const g = new THREE.BoxGeometry(b.w, b.h, b.d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const pos = g.attributes.position as THREE.BufferAttribute;
  const nrm = g.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i));
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (ny > 0.5) uv.setXY(i, (x + b.x) * uvScale, (z + b.z) * uvScale);
    else if (nx > 0.5) uv.setXY(i, z * uvScale, y * uvScale);
    else uv.setXY(i, x * uvScale, y * uvScale);
  }
  g.translate(b.x, b.h / 2, b.z);
  return g.toNonIndexed();
}

/** Flat horizontal quad at height y with world-space UVs (decals, grass tops). */
export function flatQuad(x: number, z: number, w: number, d: number, y: number, uvScale = 0.25, rotUv = false) {
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(-Math.PI / 2);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const px = pos.getX(i) + x, pz = pos.getZ(i) + z;
    if (rotUv) uv.setXY(i, pz * uvScale, px * uvScale);
    else uv.setXY(i, px * uvScale, pz * uvScale);
  }
  g.translate(x, y, z);
  return g.toNonIndexed();
}

/** Wedge prism rising from 0 to r.h along r.dir. */
export function rampGeometry(r: Ramp) {
  const hw = r.w / 2, hd = r.d / 2;
  const hAt = (x: number, z: number) => {
    switch (r.dir) {
      case 0: return x > 0 ? r.h : 0;
      case 1: return x < 0 ? r.h : 0;
      case 2: return z > 0 ? r.h : 0;
      default: return z < 0 ? r.h : 0;
    }
  };
  const c = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]] as const;
  const top = c.map(([x, z]) => new THREE.Vector3(x, hAt(x, z) + 0.001, z));
  const bot = c.map(([x, z]) => new THREE.Vector3(x, 0, z));
  const tris: THREE.Vector3[][] = [[top[0], top[2], top[1]], [top[0], top[3], top[2]]];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    tris.push([bot[i], top[j], bot[j]], [bot[i], top[i], top[j]]);
  }
  const along = r.dir < 2;
  const posArr: number[] = [];
  const uvArr: number[] = [];
  for (const t of tris) for (const v of t) {
    posArr.push(v.x, v.y, v.z);
    uvArr.push((along ? v.z : v.x) * 0.25, (along ? v.x : v.z) * 0.25 + v.y * 0.25);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(posArr, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvArr, 2));
  g.computeVertexNormals();
  g.translate(r.x, 0, r.z);
  return g;
}

export function merge(geos: THREE.BufferGeometry[]) {
  if (geos.length === 0) return new THREE.BufferGeometry();
  const m = mergeGeometries(geos, false)!;
  for (const g of geos) g.dispose();
  return m;
}
