import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { Item, KFlag, kartById, parseLook, PAINTS, type DriverId, type HatId } from "../../../shared/src/index.ts";
import { client, type RosterEntry } from "../game/client.ts";
import { merge, roundedBlock, tint } from "./geometry.ts";
import { nameTexture } from "./textures.ts";
import { MOUNTS, weaponMat } from "./weapons.ts";
import { emoteTexture } from "./Overlays3D.tsx";

// ------------------------------------------------------------------ procedural model

const ni = (g: THREE.BufferGeometry) => (g.index ? g.toNonIndexed() : g);
function piece(g: THREE.BufferGeometry, x: number, y: number, z: number, color: string, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  g.scale(sx, sy, sz);
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  const n = ni(g);
  if (n.attributes.uv) n.deleteAttribute("uv");
  return tint(n, color);
}
const box = (x: number, y0: number, z: number, w: number, h: number, d: number, c: string, r?: number) => {
  const g = roundedBlock(x, z, w, h, d, c, y0, r);
  g.deleteAttribute("uv");
  return g;
};
const sphere = (r: number, seg = 14) => new THREE.SphereGeometry(r, seg, Math.max(8, seg - 4));

function driverParts(driver: DriverId, shirt: string): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const hy = 1.58, hz = -0.18;
  // torso + arms reaching to the wheel
  out.push(box(0, 0.62, -0.28, 0.74, 0.62, 0.5, shirt, 0.2));
  out.push(piece(new THREE.CapsuleGeometry(0.1, 0.45, 4, 8), 0.3, 0.95, 0.05, shirt, Math.PI / 2.6));
  out.push(piece(new THREE.CapsuleGeometry(0.1, 0.45, 4, 8), -0.3, 0.95, 0.05, shirt, Math.PI / 2.6));
  const eyes = (y: number, z: number, spread: number, r: number) => {
    for (const sx of [-1, 1]) {
      out.push(piece(sphere(r, 10), sx * spread, y, z, "#ffffff"));
      out.push(piece(sphere(r * 0.55, 8), sx * spread, y + r * 0.1, z + r * 0.62, "#1d1b2b"));
    }
  };
  switch (driver) {
    case "bunny":
      out.push(piece(sphere(0.46), 0, hy, hz, "#ffffff"));
      for (const sx of [-1, 1]) {
        out.push(piece(new THREE.CapsuleGeometry(0.11, 0.62, 4, 10), sx * 0.17, hy + 0.68, hz - 0.06, "#ffffff", -0.15, 0, sx * -0.18));
        out.push(piece(new THREE.CapsuleGeometry(0.055, 0.45, 4, 8), sx * 0.18, hy + 0.66, hz + 0.02, "#ff9ec7", -0.15, 0, sx * -0.18));
        out.push(piece(sphere(0.09, 8), sx * 0.28, hy - 0.12, hz + 0.37, "#ffc2dc"));
      }
      eyes(hy + 0.08, hz + 0.34, 0.16, 0.1);
      out.push(piece(sphere(0.07, 8), 0, hy - 0.06, hz + 0.46, "#ff6fa8"));
      out.push(box(0, hy - 0.26, hz + 0.4, 0.14, 0.1, 0.04, "#ffffff", 0.01));
      break;
    case "bear":
      out.push(piece(sphere(0.48), 0, hy, hz, "#b5703f"));
      for (const sx of [-1, 1]) {
        out.push(piece(sphere(0.17, 10), sx * 0.34, hy + 0.36, hz - 0.04, "#b5703f"));
        out.push(piece(sphere(0.09, 8), sx * 0.34, hy + 0.36, hz + 0.06, "#f1c99b"));
      }
      out.push(piece(sphere(0.22, 12), 0, hy - 0.13, hz + 0.33, "#f1c99b", 0, 0, 0, 1.25, 0.85, 1));
      out.push(piece(sphere(0.08, 8), 0, hy - 0.05, hz + 0.53, "#2b1d16"));
      eyes(hy + 0.1, hz + 0.36, 0.17, 0.09);
      break;
    case "fox":
      out.push(piece(sphere(0.46), 0, hy, hz, "#ff8a3d"));
      for (const sx of [-1, 1]) {
        out.push(piece(new THREE.ConeGeometry(0.17, 0.45, 8), sx * 0.26, hy + 0.48, hz - 0.05, "#ff8a3d", 0, 0, sx * -0.25));
        out.push(piece(new THREE.ConeGeometry(0.08, 0.18, 6), sx * 0.31, hy + 0.67, hz - 0.05, "#3a2a24", 0, 0, sx * -0.25));
        out.push(piece(sphere(0.16, 10), sx * 0.2, hy - 0.16, hz + 0.3, "#ffffff"));
      }
      out.push(piece(new THREE.ConeGeometry(0.2, 0.42, 10), 0, hy - 0.12, hz + 0.52, "#ffffff", Math.PI / 2));
      out.push(piece(sphere(0.07, 8), 0, hy - 0.12, hz + 0.74, "#2b1d16"));
      eyes(hy + 0.1, hz + 0.34, 0.17, 0.09);
      break;
    case "cat":
      out.push(piece(sphere(0.46), 0, hy, hz, "#9aa3b5"));
      for (const sx of [-1, 1]) {
        out.push(piece(new THREE.ConeGeometry(0.16, 0.36, 4), sx * 0.27, hy + 0.44, hz - 0.04, "#9aa3b5", 0, Math.PI / 4, sx * -0.2));
        out.push(piece(new THREE.ConeGeometry(0.08, 0.2, 4), sx * 0.27, hy + 0.42, hz + 0.02, "#ffb3c7", 0, Math.PI / 4, sx * -0.2));
        for (const w of [-0.04, 0.05]) out.push(piece(new THREE.CylinderGeometry(0.008, 0.008, 0.34, 4), sx * 0.3, hy - 0.12 + w, hz + 0.36, "#ffffff", 0, 0, Math.PI / 2 + sx * w * 3));
      }
      out.push(piece(sphere(0.18, 12), 0, hy - 0.14, hz + 0.3, "#ffffff", 0, 0, 0, 1.3, 0.8, 1));
      out.push(piece(sphere(0.06, 8), 0, hy - 0.06, hz + 0.46, "#ff7aa2"));
      eyes(hy + 0.08, hz + 0.34, 0.17, 0.1);
      break;
    case "panda":
      out.push(piece(sphere(0.48), 0, hy, hz, "#ffffff"));
      for (const sx of [-1, 1]) {
        out.push(piece(sphere(0.16, 10), sx * 0.33, hy + 0.36, hz - 0.04, "#2b2b36"));
        out.push(piece(sphere(0.14, 10), sx * 0.17, hy + 0.08, hz + 0.33, "#2b2b36", 0, 0, sx * 0.5, 1, 1.3, 0.6));
      }
      out.push(piece(sphere(0.18, 12), 0, hy - 0.15, hz + 0.33, "#f1f1f5", 0, 0, 0, 1.25, 0.8, 1));
      out.push(piece(sphere(0.075, 8), 0, hy - 0.07, hz + 0.5, "#2b2b36"));
      for (const sx of [-1, 1]) {
        out.push(piece(sphere(0.06, 8), sx * 0.17, hy + 0.1, hz + 0.42, "#ffffff"));
        out.push(piece(sphere(0.035, 8), sx * 0.17, hy + 0.1, hz + 0.47, "#1d1b2b"));
      }
      break;
    case "penguin":
      out.push(piece(sphere(0.47), 0, hy, hz, "#2f3654"));
      out.push(piece(sphere(0.38, 12), 0, hy - 0.06, hz + 0.14, "#ffffff", 0, 0, 0, 1.05, 0.95, 0.8));
      out.push(piece(new THREE.ConeGeometry(0.12, 0.28, 8), 0, hy - 0.1, hz + 0.5, "#ffb03d", Math.PI / 2));
      eyes(hy + 0.1, hz + 0.38, 0.15, 0.09);
      break;
    case "duck":
      out.push(piece(sphere(0.46), 0, hy, hz, "#ffd23f"));
      out.push(piece(sphere(0.2, 12), 0, hy - 0.12, hz + 0.42, "#ff9b3d", 0, 0, 0, 1.4, 0.45, 1.2));
      out.push(piece(new THREE.CapsuleGeometry(0.05, 0.18, 4, 6), 0, hy + 0.52, hz - 0.05, "#ffd23f", 0.4));
      eyes(hy + 0.12, hz + 0.34, 0.16, 0.1);
      break;
    case "frog":
      out.push(piece(sphere(0.46), 0, hy - 0.05, hz, "#6fd36f", 0, 0, 0, 1.25, 0.85, 1.05));
      for (const sx of [-1, 1]) {
        out.push(piece(sphere(0.18, 12), sx * 0.24, hy + 0.32, hz + 0.08, "#6fd36f"));
        out.push(piece(sphere(0.13, 10), sx * 0.24, hy + 0.35, hz + 0.2, "#ffffff"));
        out.push(piece(sphere(0.07, 8), sx * 0.24, hy + 0.36, hz + 0.31, "#1d1b2b"));
        out.push(piece(sphere(0.08, 8), sx * 0.36, hy - 0.12, hz + 0.33, "#ff9ec7"));
      }
      out.push(piece(new THREE.TorusGeometry(0.2, 0.035, 6, 14, Math.PI), 0, hy - 0.12, hz + 0.43, "#2f6b3a", Math.PI));
      break;
  }
  return out;
}

function hatParts(hat: HatId, driver: DriverId): THREE.BufferGeometry[] {
  const top = driver === "frog" ? 2.0 : 2.02, z = -0.2;
  switch (hat) {
    case "cap": return [
      piece(sphere(0.36, 14), 0, top - 0.12, z, "#ff5d5d", 0, 0, 0, 1, 0.55, 1),
      box(0, top - 0.22, z + 0.38, 0.5, 0.06, 0.34, "#ff5d5d", 0.03),
    ];
    case "beanie": return [
      piece(sphere(0.38, 14), 0, top - 0.1, z, "#3fa7ff", 0, 0, 0, 1, 0.7, 1),
      piece(new THREE.TorusGeometry(0.36, 0.07, 6, 18), 0, top - 0.22, z, "#ffffff", Math.PI / 2),
      piece(sphere(0.12, 10), 0, top + 0.18, z, "#ffffff"),
    ];
    case "party": return [
      piece(new THREE.ConeGeometry(0.24, 0.62, 14), 0, top + 0.18, z, "#c77dff"),
      piece(sphere(0.08, 8), 0, top + 0.52, z, "#ffd23f"),
    ];
    case "cowboy": return [
      piece(new THREE.CylinderGeometry(0.62, 0.62, 0.06, 20), 0, top - 0.12, z, "#a0663a"),
      piece(new THREE.CylinderGeometry(0.26, 0.32, 0.34, 16), 0, top + 0.06, z, "#a0663a"),
      piece(new THREE.CylinderGeometry(0.33, 0.33, 0.08, 16), 0, top - 0.04, z, "#5c3d2e"),
    ];
    case "helmet": return [
      piece(sphere(0.52, 16), 0, top - 0.32, z, "#f4f4f8", 0, 0, 0, 1, 0.85, 1),
      box(0, top - 0.52, z + 0.38, 0.62, 0.22, 0.12, "#3a3550", 0.05),
      box(0, top - 0.02, z, 0.12, 0.16, 0.9, "#ff5d5d", 0.04),
    ];
    case "tophat": return [
      piece(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 18), 0, top - 0.12, z, "#2b2b36"),
      piece(new THREE.CylinderGeometry(0.24, 0.24, 0.5, 16), 0, top + 0.14, z, "#2b2b36"),
      piece(new THREE.CylinderGeometry(0.25, 0.25, 0.08, 16), 0, top - 0.02, z, "#ff5d5d"),
    ];
    case "crown": {
      const parts = [piece(new THREE.CylinderGeometry(0.28, 0.3, 0.2, 16, 1, true), 0, top - 0.02, z, "#ffd23f")];
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        parts.push(piece(new THREE.ConeGeometry(0.07, 0.2, 6), Math.sin(a) * 0.26, top + 0.16, z + Math.cos(a) * 0.26, "#ffd23f"));
        parts.push(piece(sphere(0.04, 6), Math.sin(a) * 0.29, top + 0.02, z + Math.cos(a) * 0.29, i % 2 ? "#ff5d5d" : "#3fa7ff"));
      }
      return parts;
    }
    default: return [];
  }
}

interface KartGeo { body: THREE.BufferGeometry; front: THREE.BufferGeometry; rear: THREE.BufferGeometry }
const geoCache = new Map<string, KartGeo>();

function wheelGeo(r: number, w: number, hub: string) {
  return merge([
    piece(new THREE.CylinderGeometry(r, r, w, 18), 0, 0, 0, "#2a2a35", 0, 0, Math.PI / 2),
    piece(new THREE.CylinderGeometry(r * 0.62, r * 0.62, w + 0.03, 14), 0, 0, 0, "#eceef6", 0, 0, Math.PI / 2),
    piece(new THREE.CylinderGeometry(r * 0.28, r * 0.28, w + 0.06, 10), 0, 0, 0, hub, 0, 0, Math.PI / 2),
  ]);
}

/** Build (and cache) the merged, vertex-coloured kart + driver geometry for a kart body + look. */
function kartGeometry(kartId: string, lookStr: string): KartGeo {
  const key = `${kartId}:${lookStr}`;
  const look = parseLook(lookStr);
  const color = PAINTS[look.paint].color;
  let g = geoCache.get(key);
  if (g) return g;
  const k = kartById(kartId);
  const dark = "#2b2d42", metal = "#c9ced9";
  const parts: THREE.BufferGeometry[] = [
    box(0, 0.22, 0.05, 1.45, 0.34, 2.4, color, 0.14),                 // chassis tub
    box(0, 0.3, 1.18, 1.05, 0.3, 0.55, color, 0.12),                  // nose
    box(0, 0.2, 1.5, 1.75, 0.2, 0.24, dark, 0.08),                    // front bumper
    box(0.86, 0.3, 0.05, 0.34, 0.34, 1.25, color, 0.12),              // side pods
    box(-0.86, 0.3, 0.05, 0.34, 0.34, 1.25, color, 0.12),
    box(0, 0.52, -0.55, 0.86, 0.62, 0.2, k.trim, 0.08),               // seat back
    box(0, 0.42, -1.0, 0.95, 0.46, 0.55, "#6b7083", 0.1),             // engine block
    box(0, 0.56, 0.62, 0.9, 0.16, 0.5, dark, 0.06),                   // dash
    piece(new THREE.TorusGeometry(0.2, 0.04, 6, 16), 0, 0.95, 0.42, dark, -0.9),
    piece(new THREE.CylinderGeometry(0.11, 0.13, 0.5, 10), 0.28, 0.78, -1.32, metal, -0.9),   // exhausts
    piece(new THREE.CylinderGeometry(0.11, 0.13, 0.5, 10), -0.28, 0.78, -1.32, metal, -0.9),
    box(0, 0.22, -1.36, 1.72, 0.18, 0.2, dark, 0.06),                 // rear bumper
  ];
  if (kartId === "comet" || kartId === "bruiser") {
    parts.push(box(0, 1.05, -1.25, 1.6, 0.1, 0.45, k.color, 0.04));
    parts.push(box(0.55, 0.6, -1.25, 0.08, 0.5, 0.2, dark, 0.02), box(-0.55, 0.6, -1.25, 0.08, 0.5, 0.2, dark, 0.02));
  }
  if (kartId === "zippy") parts.push(box(0, 0.55, 1.05, 0.6, 0.12, 0.3, "#ffffff", 0.05));
  parts.push(...driverParts(look.driver, k.color), ...hatParts(look.hat, look.driver));
  g = { body: merge(parts), front: wheelGeo(0.36, 0.34, k.color), rear: wheelGeo(0.44, 0.44, k.color) };
  geoCache.set(key, g);
  return g;
}

export interface KartParts { wheels: THREE.Mesh[]; flames: THREE.Mesh[]; body: THREE.Group }

const bodyMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const flameMat = new THREE.MeshBasicMaterial({ color: "#ffb703", transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });

export function KartModel({ kart, look, parts, material = bodyMat }: { kart: string; look: string; parts?: React.RefObject<KartParts | null>; material?: THREE.Material }) {
  const geo = useMemo(() => kartGeometry(kart, look), [kart, look]);
  const wheels = useRef<THREE.Mesh[]>([]);
  const flames = useRef<THREE.Mesh[]>([]);
  const body = useRef<THREE.Group>(null);
  useEffect(() => {
    if (parts) parts.current = { wheels: wheels.current, flames: flames.current, body: body.current! };
  });
  const W: [number, number, number, boolean][] = [[0.98, 0.36, 0.82, true], [-0.98, 0.36, 0.82, true], [1.02, 0.44, -0.86, false], [-1.02, 0.44, -0.86, false]];
  return (
    <group ref={body}>
      <mesh geometry={geo.body} material={material} castShadow />
      {W.map(([x, y, z, front], i) => (
        // rotation order YXZ: steering (Y) is applied outside the axle spin (X), so wheels turn cleanly without wobbling
        <mesh key={i} ref={(m) => { if (m) { m.rotation.order = "YXZ"; wheels.current[i] = m; } }} geometry={front ? geo.front : geo.rear} material={material} position={[x, y, z]} castShadow />
      ))}
      {[0.28, -0.28].map((x, i) => (
        <mesh key={i} ref={(m) => { if (m) flames.current[i] = m; }} position={[x, 0.95, -1.7]} rotation-x={-Math.PI / 2 - 0.9} visible={false} material={flameMat}>
          <coneGeometry args={[0.2, 1.0, 8]} />
        </mesh>
      ))}
    </group>
  );
}

// ------------------------------------------------------------------ mounted weapons

/** Exported so effects can place muzzle flashes at the pod tips. Local to the kart, before scale. */
export const MOUNT_POS = { x: 0.82, y: 1.12, z: -0.55, scale: 1.25 };

/** Twin weapon pods behind the driver showing the held weapon. Barrels spin, launchers recoil. */
function WeaponMount({ id }: { id: number }) {
  const pods = useRef<(THREE.Group | null)[]>([]);
  const bodies = useRef<(THREE.Mesh | null)[]>([]);
  const spins = useRef<(THREE.Mesh | null)[]>([]);
  const spin = useRef(0);
  const spinVel = useRef(0);
  const lastItem = useRef(0);
  const pop = useRef(1);
  useFrame((_, dt) => {
    const rk = client.karts.get(id);
    const mount = rk ? MOUNTS[rk.item] : undefined;
    const since = (performance.now() - (client.lastFire.get(id) ?? 0)) / 1000;
    const minigun = rk?.item === Item.Blaster;
    // barrels spin up while firing and wind down after
    spinVel.current = THREE.MathUtils.lerp(spinVel.current, minigun && since < 0.2 ? 38 : 0, 1 - Math.exp(-dt * (since < 0.2 ? 10 : 2.5)));
    spin.current += spinVel.current * dt;
    if ((rk?.item ?? 0) !== lastItem.current) { lastItem.current = rk?.item ?? 0; pop.current = 0; }
    pop.current = Math.min(1, pop.current + dt * 4);
    const popS = 1 + Math.sin(pop.current * Math.PI) * 0.35;
    const kick = minigun ? Math.sin(performance.now() / 18) * 0.025 * (since < 0.12 ? 1 : 0) : Math.max(0, 0.22 - since) * 1.6;
    for (let i = 0; i < 2; i++) {
      const g = pods.current[i], body = bodies.current[i], sp = spins.current[i];
      if (!g || !body || !sp) continue;
      g.visible = !!mount;
      if (!mount) continue;
      const side = i === 0 ? -1 : 1;
      if (body.geometry !== mount.body) body.geometry = mount.body;
      sp.visible = !!mount.spin;
      if (mount.spin && sp.geometry !== mount.spin) sp.geometry = mount.spin;
      sp.rotation.z = spin.current * side;
      g.position.set(side * MOUNT_POS.x, MOUNT_POS.y, MOUNT_POS.z - kick);
      g.scale.set(side * MOUNT_POS.scale * popS, MOUNT_POS.scale * popS, MOUNT_POS.scale * popS);
    }
  });
  return (
    <>
      {[0, 1].map((i) => (
        <group key={i} ref={(g) => { pods.current[i] = g; }} visible={false}>
          <mesh ref={(m) => { bodies.current[i] = m; }} material={weaponMat} castShadow />
          <mesh ref={(m) => { spins.current[i] = m; }} material={weaponMat} castShadow />
        </group>
      ))}
    </>
  );
}

// ------------------------------------------------------------------ in-match kart

const shieldMat = new THREE.MeshBasicMaterial({ color: "#64c8ff", transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false });

/** One kart in the match, driven every frame from the client's interpolated state. */
export function KartView({ entry, isYou }: { entry: RosterEntry; isYou: boolean }) {
  const root = useRef<THREE.Group>(null);
  const parts = useRef<KartParts | null>(null);
  const shield = useRef<THREE.Mesh>(null);
  const hpFill = useRef<THREE.Sprite>(null);
  const tag = useRef<THREE.Group>(null);
  const spin = useRef(0);
  const nameTex = useMemo(() => nameTexture(entry.name, "#ffffff"), [entry.name]);
  const maxHp = kartById(entry.kart).maxHp;
  const blob = useRef<THREE.Mesh>(null);
  const emote = useRef<THREE.Sprite>(null);
  // own material per kart so it can flash white when hit
  const mat = useMemo(() => new THREE.MeshLambertMaterial({ vertexColors: true, emissive: new THREE.Color("#ffffff"), emissiveIntensity: 0 }), []);

  useFrame((state, dt) => {
    const rk = client.karts.get(entry.id);
    const g = root.current;
    if (!g) return;
    const shown = !!rk && rk.visible;
    g.visible = shown;
    if (tag.current) tag.current.visible = shown;
    if (blob.current) blob.current.visible = shown;
    if (!rk || !shown) return;
    g.position.set(rk.x, rk.y, rk.z);
    const stun = (rk.flags & KFlag.Stun) !== 0;
    spin.current = stun ? spin.current + dt * 12 : spin.current * Math.exp(-dt * 10);
    g.rotation.y = rk.yaw + spin.current;
    const p = parts.current;
    if (p) {
      const airborne = (rk.flags & KFlag.Grounded) === 0;
      // body rolls into slides and pitches when airborne
      const slip = THREE.MathUtils.clamp(rk.slip / 10, -1, 1);
      p.body.rotation.z = THREE.MathUtils.lerp(p.body.rotation.z, -slip * 0.12 + rk.drift * 0.12 + (stun ? Math.sin(spin.current) * 0.4 : 0), 0.2);
      p.body.rotation.x = THREE.MathUtils.lerp(p.body.rotation.x, airborne ? -0.12 : -Math.min(0.05, rk.accel * 0.004), 0.12);
      p.body.position.y = Math.sin(performance.now() / 60 + entry.id) * 0.012 * Math.min(1, Math.abs(rk.speed) / 10);
      const roll = (rk.speed * dt) / 0.42;
      for (let i = 0; i < p.wheels.length; i++) {
        const w = p.wheels[i];
        w.rotation.x = (w.rotation.x + roll) % (Math.PI * 2);
        if (i < 2) w.rotation.y = THREE.MathUtils.lerp(w.rotation.y, -THREE.MathUtils.clamp(rk.steer, -1, 1) * 0.42, 0.25);
      }
      const boosting = (rk.flags & KFlag.Boost) !== 0;
      for (const f of p.flames) {
        f.visible = boosting;
        if (boosting) f.scale.set(1, 0.8 + Math.random() * 0.6, 1);
      }
    }
    if (shield.current) {
      const on = (rk.flags & (KFlag.Shield | KFlag.SpawnShield)) !== 0;
      shield.current.visible = on;
      if (on) {
        shield.current.scale.setScalar(1 + Math.sin(performance.now() / 140) * 0.03);
        shieldMat.opacity = 0.28 + Math.sin(performance.now() / 120) * 0.06;
      }
    }
    if (blob.current) { blob.current.position.set(rk.x, rk.groundY + 0.04, rk.z); blob.current.rotation.z = -rk.yaw; }
    const sinceHit = (performance.now() - (client.hitFlash.get(entry.id) ?? -1e9)) / 1000;
    mat.emissiveIntensity = sinceHit < 0.18 ? 0.85 * (1 - sinceHit / 0.18) : 0;
    const em = client.emotes.get(entry.id), es = emote.current;
    if (es) {
      const age = em ? (performance.now() - em.t) / 1000 : 99;
      es.visible = age < 2.2;
      if (es.visible && em) {
        const m = es.material as THREE.SpriteMaterial;
        const tex = emoteTexture(em.i);
        if (m.map !== tex) { m.map = tex; m.needsUpdate = true; }
        const pop = age < 0.2 ? age / 0.2 * 1.25 : age > 1.9 ? Math.max(0, (2.2 - age) / 0.3) : 1 + Math.sin(age * 8) * 0.04;
        es.scale.setScalar(2.1 * pop);
        es.position.set(rk.x, rk.y + 4.4, rk.z);
      }
    }
    if (hpFill.current && tag.current) {
      const f = Math.max(0, Math.min(1, rk.hp / maxHp));
      hpFill.current.scale.x = 1.8 * f;
      hpFill.current.position.x = -0.9 * (1 - f);
      (hpFill.current.material as THREE.SpriteMaterial).color.set(f > 0.5 ? "#4fd67a" : f > 0.25 ? "#ffd23f" : "#ff5d5d");
      tag.current.position.set(rk.x, rk.y + 3, rk.z);
      tag.current.quaternion.copy(state.camera.quaternion);
    }
  });

  return (
    <>
      <group ref={root}>
        <KartModel kart={entry.kart} look={entry.look} parts={parts} material={mat} />
        <WeaponMount id={entry.id} />
        <mesh ref={shield} position={[0, 0.9, 0]} visible={false} material={shieldMat}>
          <sphereGeometry args={[2.0, 22, 16]} />
        </mesh>
      </group>
      <sprite ref={emote} visible={false} renderOrder={9}>
        <spriteMaterial transparent depthTest={false} />
      </sprite>
      {/* soft contact shadow keeps karts readable even where the shadow map is coarse */}
      <mesh ref={blob} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[2.3, 3.1]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.18} depthWrite={false} />
      </mesh>
      {!isYou && (
        <group ref={tag}>
          <sprite position={[0, 0.45, 0]} scale={[3.2, 0.8, 1]}>
            <spriteMaterial map={nameTex} depthWrite={false} transparent />
          </sprite>
          <sprite scale={[1.9, 0.2, 1]}>
            <spriteMaterial color="#14102b" depthWrite={false} />
          </sprite>
          <sprite ref={hpFill} scale={[1.8, 0.13, 1]} position={[0, 0, 0.01]}>
            <spriteMaterial color="#4fd67a" depthWrite={false} />
          </sprite>
        </group>
      )}
    </>
  );
}
