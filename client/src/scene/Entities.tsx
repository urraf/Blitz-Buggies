import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { groundAt, KFlag, Proj, type Arena } from "../../../shared/src/index.ts";
import { client } from "../game/client.ts";
import { merge, roundedBlock, tint } from "./geometry.ts";
import { crateTexture, scorchTexture, sparkleTexture } from "./textures.ts";
import { MOUNTS, ballGeometry, bombGeometry, hornetGeometry, mineGeometry, rocketGeometry, weaponMat } from "./weapons.ts";
import { MOUNT_POS } from "./Kart.tsx";

const dummy = new THREE.Object3D();
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const ni = (g: THREE.BufferGeometry) => (g.index ? g.toNonIndexed() : g);
const colored = (g: THREE.BufferGeometry, c: string, f: (g: THREE.BufferGeometry) => void = () => {}) => {
  f(g);
  const n = ni(g);
  if (n.attributes.uv) n.deleteAttribute("uv");
  return tint(n, c);
};

const litMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const looseWheelGeo = merge([
  colored(new THREE.CylinderGeometry(0.42, 0.42, 0.4, 16), "#2a2a35", (g) => g.rotateZ(Math.PI / 2)),
  colored(new THREE.CylinderGeometry(0.26, 0.26, 0.43, 12), "#eceef6", (g) => g.rotateZ(Math.PI / 2)),
]);

const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.3, 0.4), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
const lightMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.3, 0.3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });

/** Projectiles: one InstancedMesh per kind, rewritten each frame from interpolated server state. */
export function Projectiles() {
  const refs = useRef<Record<number, THREE.InstancedMesh | null>>({});
  const flames = useRef<THREE.InstancedMesh>(null);
  const lights = useRef<THREE.InstancedMesh>(null);
  const geos = useMemo(() => ({ rocket: rocketGeometry(), hornet: hornetGeometry(), bomb: bombGeometry(), mine: mineGeometry(), ball: ballGeometry() }), []);
  useFrame(() => {
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
    let nf = 0, nl = 0;
    const t = performance.now() / 1000;
    const fl = flames.current, li = lights.current;
    for (const p of client.projs) {
      const m = refs.current[p.kind];
      if (!m || counts[p.kind] >= m.count) continue;
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      const heading = Math.atan2(p.vx, p.vz);
      if (p.kind === Proj.Bolt || p.kind === Proj.Hornet || p.kind === Proj.Rocket) dummy.rotation.y = heading;
      if (p.kind === Proj.Rocket || p.kind === Proj.Hornet) dummy.rotation.z = t * 9;
      if (p.kind === Proj.Lob || p.kind === Proj.Ball) dummy.rotation.set(t * 5, t * 3, 0);
      if (p.kind === Proj.Mine) { dummy.rotation.y = t * 0.8 + p.id; }
      dummy.updateMatrix();
      m.setMatrixAt(counts[p.kind]++, dummy.matrix);
      // exhaust flame behind rockets / hornets
      if ((p.kind === Proj.Rocket || p.kind === Proj.Hornet) && fl && nf < fl.count) {
        const back = p.kind === Proj.Rocket ? 0.95 : 0.7;
        dummy.position.set(p.x - Math.sin(heading) * back, p.y, p.z - Math.cos(heading) * back);
        dummy.rotation.set(0, heading, 0);
        const flick = 0.8 + Math.random() * 0.5;
        dummy.scale.set(flick, flick, flick * 1.3);
        dummy.updateMatrix();
        fl.setMatrixAt(nf++, dummy.matrix);
      }
      // blinking warning light on mines
      if (p.kind === Proj.Mine && li && nl < li.count) {
        const on = Math.sin(t * 9 + p.id) > 0;
        dummy.position.set(p.x, p.y + 0.72, p.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(on ? 1 : 0.35);
        dummy.updateMatrix();
        li.setMatrixAt(nl++, dummy.matrix);
      }
    }
    for (const [kind, m] of Object.entries(refs.current)) {
      if (!m) continue;
      for (let i = counts[+kind]; i < m.count; i++) m.setMatrixAt(i, HIDDEN);
      m.instanceMatrix.needsUpdate = true;
    }
    if (fl) { for (let i = nf; i < fl.count; i++) fl.setMatrixAt(i, HIDDEN); fl.instanceMatrix.needsUpdate = true; }
    if (li) { for (let i = nl; i < li.count; i++) li.setMatrixAt(i, HIDDEN); li.instanceMatrix.needsUpdate = true; }
  });
  const set = (k: number) => (m: THREE.InstancedMesh | null) => { refs.current[k] = m; };
  return (
    <group>
      <instancedMesh ref={set(Proj.Bolt)} args={[undefined, undefined, 128]} frustumCulled={false}>
        <capsuleGeometry args={[0.07, 1.3, 2, 6]} onUpdate={(g) => g.rotateX(Math.PI / 2)} />
        <meshBasicMaterial color={[2.4, 2.0, 0.6]} />
      </instancedMesh>
      <instancedMesh ref={set(Proj.Rocket)} args={[geos.rocket, weaponMat, 24]} frustumCulled={false} castShadow />
      <instancedMesh ref={set(Proj.Hornet)} args={[geos.hornet, weaponMat, 36]} frustumCulled={false} castShadow />
      <instancedMesh ref={set(Proj.Lob)} args={[geos.bomb, weaponMat, 24]} frustumCulled={false} castShadow />
      <instancedMesh ref={set(Proj.Mine)} args={[geos.mine, weaponMat, 64]} frustumCulled={false} castShadow />
      <instancedMesh ref={set(Proj.Ball)} args={[geos.ball, weaponMat, 24]} frustumCulled={false} castShadow />
      <instancedMesh ref={flames} args={[undefined, flameMat, 48]} frustumCulled={false}>
        <coneGeometry args={[0.2, 0.9, 10]} onUpdate={(g) => { g.rotateX(-Math.PI / 2); g.translate(0, 0, -0.45); }} />
      </instancedMesh>
      <instancedMesh ref={lights} args={[undefined, lightMat, 64]} frustumCulled={false}>
        <sphereGeometry args={[0.1, 8, 6]} />
      </instancedMesh>
    </group>
  );
}

/** Item crates with bob/spin and a pop-in when they respawn. */
export function Pickups({ arena }: { arena: Arena }) {
  const crates = useRef<THREE.InstancedMesh>(null);
  const tex = useMemo(() => crateTexture(), []);
  const geo = useMemo(() => {
    const g = roundedBlock(0, 0, 1.5, 1.5, 1.5, "#ffffff", -0.75, 0.22);
    return g;
  }, []);
  const cratePos = useMemo(() => arena.crates.map(([x, z]) => [x, groundAt(arena, x, z, 50), z] as const), [arena]);
  const scales = useRef<number[]>([]);
  useFrame((_, dt) => {
    const m = crates.current;
    if (!m) return;
    const t = performance.now() / 1000;
    for (let i = 0; i < cratePos.length; i++) {
      const target = client.crates[i] === false ? 0 : 1;
      scales.current[i] = THREE.MathUtils.lerp(scales.current[i] ?? 1, target, 1 - Math.exp(-dt * (target ? 6 : 14)));
      const sc = scales.current[i] * (1 + (target && scales.current[i] < 0.98 ? 0.3 * Math.sin(scales.current[i] * Math.PI) : 0));
      const [x, y, z] = cratePos[i];
      dummy.position.set(x, y + 1.3 + Math.sin(t * 2.2 + i) * 0.22, z);
      dummy.rotation.set(0.15, t * 1.4 + i, 0.1);
      dummy.scale.setScalar(Math.max(0.0001, sc));
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={crates} args={[geo, undefined, Math.max(1, cratePos.length)]} castShadow frustumCulled={false}>
      <meshLambertMaterial map={tex} />
    </instancedMesh>
  );
}

// ------------------------------------------------------------------ effects

const MAX_PUFF = 600;
const MAX_SPARK = 160;
const MAX_SKID = 900;
const MAX_WRECK = 8;

class Pool {
  n: number;
  pos: Float32Array; vel: Float32Array; life: Float32Array; max: Float32Array; size: Float32Array; grow: Float32Array; grav: Float32Array;
  col: THREE.Color[];
  next = 0;
  constructor(n: number) {
    this.n = n;
    this.pos = new Float32Array(n * 3); this.vel = new Float32Array(n * 3);
    this.life = new Float32Array(n); this.max = new Float32Array(n); this.size = new Float32Array(n); this.grow = new Float32Array(n); this.grav = new Float32Array(n);
    this.col = Array.from({ length: n }, () => new THREE.Color());
  }
  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, color: THREE.ColorRepresentation, grav = 0, grow = 1) {
    const i = this.next;
    this.next = (this.next + 1) % this.n;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.max[i] = life; this.size[i] = size; this.grav[i] = grav; this.grow[i] = grow;
    this.col[i].set(color);
  }
}

const rand = (a: number) => (Math.random() * 2 - 1) * a;
const FIRE = ["#ffd23f", "#ff9b3d", "#ffb703", "#ff7b00"];

interface Wreck { mesh: THREE.Group; vel: THREE.Vector3; spin: THREE.Vector3; life: number }

/** Explosions, smoke, sparkles, skid marks, rocket trails and tumbling wrecks. Drains client.fx. */
export function Effects({ particleScale }: { particleScale: number }) {
  const puffMesh = useRef<THREE.InstancedMesh>(null);
  const sparkMesh = useRef<THREE.InstancedMesh>(null);
  const skidMesh = useRef<THREE.InstancedMesh>(null);
  const wreckRoot = useRef<THREE.Group>(null);
  const puffs = useMemo(() => new Pool(MAX_PUFF), []);
  const sparks = useMemo(() => new Pool(MAX_SPARK), []);
  const skidNext = useRef(0);
  const skidTimer = useRef(new Map<number, number>());
  const skidLast = useRef(new Map<number, number[]>());
  const trailTimer = useRef(0);
  const wrecks = useRef<Wreck[]>([]);
  const wreckIdx = useRef(0);
  const muzzleSide = useRef(1);
  // loose wheels from wrecks: position, velocity, spin, life
  const wheelMesh = useRef<THREE.InstancedMesh>(null);
  const wheels = useMemo(() => ({ p: new Float32Array(32 * 3), v: new Float32Array(32 * 3), r: new Float32Array(32 * 3), w: new Float32Array(32 * 3), life: new Float32Array(32), next: 0 }), []);
  const dizzy = useRef<{ x: number; y: number; z: number; t: number }[]>([]);
  const scorch = useRef<THREE.InstancedMesh>(null);
  const scorchNext = useRef(0);
  const sparkTex = useMemo(() => sparkleTexture(), []);
  const scorchTex = useMemo(() => scorchTexture(), []);

  useEffect(() => {
    const white = new THREE.Color("#ffffff");
    for (const m of [puffMesh.current, sparkMesh.current]) {
      if (!m) continue;
      for (let i = 0; i < m.count; i++) { m.setColorAt(i, white); m.setMatrixAt(i, HIDDEN); }
      m.instanceColor!.needsUpdate = true;
      (m.material as THREE.Material).needsUpdate = true;
    }
    const s = skidMesh.current;
    if (s) { for (let i = 0; i < MAX_SKID; i++) s.setMatrixAt(i, HIDDEN); s.instanceMatrix.needsUpdate = true; }
    // tumbling wreck carcasses (pooled)
    const root = wreckRoot.current!;
    const wreckGeo = merge([
      roundedBlock(0, 0, 1.5, 0.45, 2.3, "#3a3444", 0, 0.15),
      roundedBlock(0, -0.9, 0.9, 0.4, 0.5, "#57506a", 0.4, 0.1),
      ...[[0.95, 0.82], [-0.95, 0.82], [1, -0.86], [-1, -0.86]].map(([x, z]) => {
        const g = new THREE.CylinderGeometry(0.4, 0.4, 0.4, 12); g.rotateZ(Math.PI / 2); g.translate(x, 0.2, z);
        return tint(ni(g), "#1f1d28");
      }),
    ].map((g) => { if (g.attributes.uv) g.deleteAttribute("uv"); return g; }));
    for (let i = 0; i < MAX_WRECK; i++) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(wreckGeo, litMat));
      g.visible = false;
      root.add(g);
      wrecks.current.push({ mesh: g, vel: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0 });
    }
  }, []);

  const burst = (n: number, f: () => void) => { const c = Math.ceil(n * particleScale); for (let i = 0; i < c; i++) f(); };

  const explode = (x: number, y: number, z: number, rIn: number, big: boolean) => {
    // kart wrecks happen right in front of the camera, so keep their fireball compact
    const r = big ? Math.min(rIn, 2.2) : rIn;
    // fat cartoon fireball puffs that swell then shrink, then lingering grey smoke
    burst(big ? 12 : 10 + r * 2, () => puffs.spawn(x + rand(r * 0.4), y + Math.random() * r * 0.4, z + rand(r * 0.4), rand(r * 1.6), 2 + Math.random() * r * 1.4, rand(r * 1.6), 0.45 + Math.random() * 0.35, (0.8 + Math.random() * 0.7) * (0.5 + r * 0.22), FIRE[(Math.random() * 4) | 0], -2, 2.2));
    burst(big ? 12 : 7, () => puffs.spawn(x + rand(r * 0.6), y + 0.5, z + rand(r * 0.6), rand(1.5), 2.5 + Math.random() * 2.5, rand(1.5), 1.1 + Math.random() * 0.7, 0.7 + Math.random() * 0.6, Math.random() < 0.5 ? "#b8b3c9" : "#9d97b3", -1, 1.6));
    burst(big ? 14 : 8, () => sparks.spawn(x, y + 0.5, z, rand(9), 4 + Math.random() * 9, rand(9), 0.5 + Math.random() * 0.4, 0.6 + Math.random() * 0.5, "#fff6c2", 14));
    // bright flash + a scorch mark left on the ground
    sparks.spawn(x, y + 0.4, z, 0, 0, 0, 0.12, r * 2.4, "#ffffff", 0);
    sparks.spawn(x, y + 0.4, z, 0, 0.5, 0, 0.22, r * 1.6, "#ffcf6b", 0);
    const sm = scorch.current;
    if (sm) {
      const gy = groundAt(client.arena, x, z, y + 0.5);
      if (y - gy < 2.5) {
        dummy.position.set(x, gy + 0.03 + (scorchNext.current % 9) * 0.0008, z);
        dummy.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI * 2);
        dummy.scale.setScalar(r * 0.75);
        dummy.updateMatrix();
        sm.setMatrixAt(scorchNext.current, dummy.matrix);
        scorchNext.current = (scorchNext.current + 1) % 48;
        sm.instanceMatrix.needsUpdate = true;
      }
    }
  };

  const spawnWreck = (x: number, y: number, z: number, yaw: number) => {
    // the four wheels pop off and bounce away on their own
    for (let i = 0; i < 4; i++) {
      const j = wheels.next; wheels.next = (wheels.next + 1) % 32;
      const a = yaw + (i < 2 ? 0.6 : 2.5) * (i % 2 ? 1 : -1);
      wheels.p.set([x + Math.sin(a) * 1.1, y + 0.5, z + Math.cos(a) * 1.1], j * 3);
      wheels.v.set([Math.sin(a) * (5 + Math.random() * 4), 7 + Math.random() * 5, Math.cos(a) * (5 + Math.random() * 4)], j * 3);
      wheels.r.set([0, yaw, 0], j * 3);
      wheels.w.set([rand(14), rand(6), rand(14)], j * 3);
      wheels.life[j] = 2.2;
    }
    dizzy.current.push({ x, y, z, t: 1.6 });
    const w = wrecks.current[wreckIdx.current++ % MAX_WRECK];
    if (!w) return;
    w.mesh.position.set(x, y + 0.4, z);
    w.mesh.rotation.set(0, yaw, 0);
    w.vel.set(rand(3), 10 + Math.random() * 4, rand(3));
    w.spin.set(rand(8), rand(5), rand(8));
    w.life = 1.7;
    w.mesh.visible = true;
  };

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const arena = client.arena;
    for (const e of client.fx.splice(0)) {
      switch (e.e) {
        case "boom":
          if (e.kind === Proj.Bolt) burst(4, () => sparks.spawn(e.x, e.y, e.z, rand(4), Math.random() * 4, rand(4), 0.2, 0.35, "#ffe066", 8));
          else explode(e.x, e.y, e.z, e.r, e.kind === 0);
          break;
        case "hit":
          burst(e.dmg > 0 ? 5 : 4, () => sparks.spawn(e.x, e.y, e.z, rand(5), Math.random() * 5, rand(5), 0.25, 0.4, e.dmg > 0 ? "#ffffff" : "#74c0fc", 10));
          break;
        case "kill": {
          const k = client.karts.get(e.id);
          if (k) spawnWreck(k.x, k.y, k.z, k.yaw);
          break;
        }
        case "celebrate": {
          // confetti + gold stars where your victim was wrecked
          const k = client.karts.get(e.id);
          if (k) {
            const cols = ["#ff5d5d", "#ffd23f", "#4fd67a", "#3fa7ff", "#c77dff", "#ff9b3d"];
            burst(26, () => sparks.spawn(k.x, k.y + 2, k.z, rand(7), 6 + Math.random() * 7, rand(7), 0.9 + Math.random() * 0.4, 0.35 + Math.random() * 0.3, cols[(Math.random() * cols.length) | 0], 9));
            burst(8, () => sparks.spawn(k.x + rand(1.5), k.y + 2.5, k.z + rand(1.5), rand(3), 4 + Math.random() * 3, rand(3), 0.8, 0.9, "#ffe066", 4));
          }
          break;
        }
        case "pickup": {
          const c = arena.crates[e.crate];
          if (c) {
            const gy = groundAt(arena, c[0], c[1], 50) + 1.3;
            burst(10, () => sparks.spawn(c[0], gy, c[1], rand(6), Math.random() * 6, rand(6), 0.5, 0.55, Math.random() < 0.5 ? "#ffd23f" : "#3fa7ff", 8));
            burst(5, () => puffs.spawn(c[0] + rand(0.6), gy, c[1] + rand(0.6), rand(2), 1 + Math.random() * 2, rand(2), 0.4, 0.5, "#ffffff", 0, 1.5));
          }
          break;
        }
        case "spawn": {
          const k = client.karts.get(e.id);
          if (k) burst(14, () => sparks.spawn(k.x + rand(1.6), k.y + 0.3, k.z + rand(1.6), 0, 3 + Math.random() * 5, 0, 0.8, 0.5, "#bfe8ff", 0));
          break;
        }
        case "muzzle": {
          const k = client.karts.get(e.id);
          const mount = MOUNTS[e.item];
          if (k && mount) {
            const fx = Math.sin(k.yaw), fz = Math.cos(k.yaw), rx = -fz, rz = fx;
            const sides = e.item === 1 ? [(muzzleSide.current = -muzzleSide.current)] : [-1, 1];
            for (const side of sides) {
              const along = MOUNT_POS.z + mount.muzzle * MOUNT_POS.scale;
              const mx = k.x + rx * side * MOUNT_POS.x + fx * along, mz = k.z + rz * side * MOUNT_POS.x + fz * along, my = k.y + MOUNT_POS.y;
              sparks.spawn(mx, my, mz, fx * 3, 0.3, fz * 3, e.item === 1 ? 0.05 : 0.09, e.item === 1 ? 0.9 : 1.6, "#fff1a8", 0);
              sparks.spawn(mx + fx * 0.3, my, mz + fz * 0.3, fx * 6, 0, fz * 6, 0.05, e.item === 1 ? 0.6 : 1.1, "#ffb347", 0);
              if (e.item === 1) {
                // brass casings flicked out of the side
                puffs.spawn(k.x + rx * side * 1.1, my - 0.1, k.z + rz * side * 1.1, rx * side * (2 + Math.random() * 2) + rand(0.5), 2.5 + Math.random() * 2, rz * side * (2 + Math.random() * 2) + rand(0.5), 0.55, 0.06, "#e2b544", 18, 1);
              } else if (e.item !== 4) {
                // small puff of launch smoke blown back past the pod (kept small so it never hides the kart)
                burst(2, () => puffs.spawn(mx + rand(0.15), my + 0.1 + rand(0.1), mz + rand(0.15), rand(0.6) - fx * 2.5, 0.4 + Math.random() * 0.4, rand(0.6) - fz * 2.5, 0.3, 0.14, "#f4f2f8", -0.2, 1.7));
              }
            }
          }
          break;
        }
        case "kev":
        case "localkev": {
          const k = client.karts.get(e.e === "kev" ? e.id : client.ui.get().you);
          if (!k) break;
          const bits = e.bits;
          if (bits & 1) burst(8, () => puffs.spawn(k.x + rand(1.2), k.y + 0.15, k.z + rand(1.2), rand(3), 0.8 + Math.random(), rand(3), 0.5, 0.4, "#e8e4ef", 0, 1.3));
          if (bits & 2) burst(5, () => sparks.spawn(k.x, k.y + 0.6, k.z, rand(4), Math.random() * 4, rand(4), 0.3, 0.35, "#ffd166", 10));
          if (bits & (4 | 8 | 16)) {
            const bx = k.x - Math.sin(k.yaw) * 1.6, bz = k.z - Math.cos(k.yaw) * 1.6;
            burst(bits & 8 ? 12 : 7, () => sparks.spawn(bx, k.y + 0.6, bz, rand(2) - Math.sin(k.yaw) * 6, Math.random() * 2, rand(2) - Math.cos(k.yaw) * 6, 0.35, 0.5, bits & 8 ? "#ff7bff" : "#ffb703", 0));
          }
          break;
        }
      }
    }

    // continuous emitters: skid marks + dust for sliding karts, boost flames, rocket smoke trails
    const skid = skidMesh.current;
    for (const k of client.karts.values()) {
      if (!k.visible) continue;
      const grounded = (k.flags & KFlag.Grounded) !== 0;
      const sliding = grounded && (Math.abs(k.slip) > 3.2 || (k.flags & KFlag.Drift) !== 0 || (Math.abs(k.speed) > 4 && Math.abs(k.accel) > 14));
      const fx = Math.sin(k.yaw), fz = Math.cos(k.yaw), rx = -fz, rz = fx;
      const last = skidLast.current.get(k.id);
      if (sliding && skid) {
        const tm = (skidTimer.current.get(k.id) ?? 0) - dt;
        if (tm <= 0) {
          // lay a streak per rear wheel from its previous mark to here so the trail is continuous
          const wheels: [number, number][] = [-1, 1].map((side) => [k.x - fx * 0.86 + rx * side * 1.0, k.z - fz * 0.86 + rz * side * 1.0]);
          wheels.forEach(([wx, wz], wi) => {
            const lx = last ? last[wi * 2] : wx, lz = last ? last[wi * 2 + 1] : wz;
            const dx = wx - lx, dz = wz - lz, len = Math.hypot(dx, dz);
            if (len > 3) return;
            dummy.position.set((wx + lx) / 2, k.groundY + 0.025 + (skidNext.current % 7) * 0.0006, (wz + lz) / 2);
            dummy.rotation.set(0, len > 0.01 ? Math.atan2(dx, dz) : k.yaw, 0);
            dummy.scale.set(1, 1, Math.max(0.35, len + 0.08));
            dummy.updateMatrix();
            skid.setMatrixAt(skidNext.current, dummy.matrix);
            skidNext.current = (skidNext.current + 1) % MAX_SKID;
          });
          skid.instanceMatrix.needsUpdate = true;
          skidLast.current.set(k.id, [wheels[0][0], wheels[0][1], wheels[1][0], wheels[1][1]]);
          if (Math.random() < 0.45 * particleScale) puffs.spawn(k.x - fx * 1.1 + rx * (Math.random() < 0.5 ? -1 : 1), k.groundY + 0.2, k.z - fz * 1.1, rand(0.8) - fx, 0.5 + Math.random() * 0.6, rand(0.8) - fz, 0.45, 0.2, "#eceaf2", -0.4, 1.7);
          skidTimer.current.set(k.id, 0.04);
        } else skidTimer.current.set(k.id, tm);
      } else if (last) skidLast.current.delete(k.id);
      if (k.flags & KFlag.Boost && Math.random() < 0.7 * particleScale) {
        sparks.spawn(k.x - fx * 1.9 + rand(0.2), k.y + 0.95, k.z - fz * 1.9 + rand(0.2), -fx * 3 + rand(0.5), 0.5, -fz * 3 + rand(0.5), 0.22, 0.5, Math.random() < 0.5 ? "#ffb703" : "#ff5d3d", 0);
      }
    }
    if ((trailTimer.current -= dt) <= 0) {
      trailTimer.current = 0.03;
      for (const p of client.projs) {
        if (p.kind === Proj.Rocket || p.kind === Proj.Hornet) puffs.spawn(p.x + rand(0.25), p.y + rand(0.2), p.z + rand(0.25), rand(0.6), 0.5 + Math.random() * 0.5, rand(0.6), 0.35 + Math.random() * 0.3, 0.12 + Math.random() * 0.1, Math.random() < 0.3 ? "#ffd9a8" : "#f4f2f8", -0.3, 2.6);
        else if (p.kind === Proj.Lob && Math.random() < 0.6) sparks.spawn(p.x, p.y + 0.7, p.z, rand(1), 1, rand(1), 0.25, 0.35, "#ffd23f", 0);
        else if (p.kind === Proj.Ball) puffs.spawn(p.x + rand(0.2), p.y + rand(0.2), p.z + rand(0.2), rand(0.3), 0.3, rand(0.3), 0.5, 0.35, "#8e89a3", -0.2, 2);
      }
    }

    // integrate puffs (lit spheres that swell then shrink) and sparkles (additive quads)
    const upd = (pool: Pool, m: THREE.InstancedMesh | null, puffy: boolean) => {
      if (!m) return;
      for (let i = 0; i < pool.n; i++) {
        if (pool.life[i] <= 0) { if (pool.max[i] > 0) { m.setMatrixAt(i, HIDDEN); pool.max[i] = 0; } continue; }
        pool.life[i] -= dt;
        const j = i * 3;
        pool.vel[j + 1] -= pool.grav[i] * dt;
        const drag = puffy ? Math.exp(-2.5 * dt) : 1;
        pool.vel[j] *= drag; pool.vel[j + 2] *= drag; if (puffy) pool.vel[j + 1] *= drag;
        pool.pos[j] += pool.vel[j] * dt; pool.pos[j + 1] += pool.vel[j + 1] * dt; pool.pos[j + 2] += pool.vel[j + 2] * dt;
        if (pool.pos[j + 1] < 0.05) { pool.pos[j + 1] = 0.05; pool.vel[j + 1] *= -0.3; }
        const f = Math.max(0, pool.life[i] / pool.max[i]);
        const age = 1 - f;
        const s = puffy ? pool.size[i] * (1 + (pool.grow[i] - 1) * Math.min(1, age * 3)) * Math.min(1, f * 2.2) : pool.size[i] * (0.4 + 0.6 * f);
        dummy.position.set(pool.pos[j], pool.pos[j + 1], pool.pos[j + 2]);
        dummy.rotation.set(0, 0, 0);
        if (!puffy) dummy.quaternion.copy(cameraQuat);
        dummy.scale.setScalar(Math.max(0.0001, s));
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
        m.setColorAt(i, pool.col[i]);
      }
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    };
    upd(puffs, puffMesh.current, true);
    upd(sparks, sparkMesh.current, false);

    // loose wheels: bounce, spin, shrink away
    const wm = wheelMesh.current;
    if (wm) {
      for (let i = 0; i < 32; i++) {
        if (wheels.life[i] <= 0) { wm.setMatrixAt(i, HIDDEN); continue; }
        wheels.life[i] -= dt;
        const j = i * 3;
        wheels.v[j + 1] -= 26 * dt;
        for (let a = 0; a < 3; a++) { wheels.p[j + a] += wheels.v[j + a] * dt; wheels.r[j + a] += wheels.w[j + a] * dt; }
        const gy = groundAt(arena, wheels.p[j], wheels.p[j + 2], wheels.p[j + 1]) + 0.4;
        if (wheels.p[j + 1] < gy) { wheels.p[j + 1] = gy; wheels.v[j + 1] *= -0.45; wheels.v[j] *= 0.7; wheels.v[j + 2] *= 0.7; wheels.w[j] *= 0.7; wheels.w[j + 2] *= 0.7; }
        dummy.position.set(wheels.p[j], wheels.p[j + 1], wheels.p[j + 2]);
        dummy.rotation.set(wheels.r[j], wheels.r[j + 1], wheels.r[j + 2]);
        dummy.scale.setScalar(Math.min(1, wheels.life[i] * 1.5));
        dummy.updateMatrix();
        wm.setMatrixAt(i, dummy.matrix);
      }
      wm.instanceMatrix.needsUpdate = true;
    }
    // cartoon dizzy stars circling above fresh wrecks
    for (let i = dizzy.current.length - 1; i >= 0; i--) {
      const d = dizzy.current[i];
      d.t -= dt;
      if (d.t <= 0) { dizzy.current.splice(i, 1); continue; }
      if (Math.random() < 0.7) {
        const a = performance.now() / 160 + Math.random() * 0.4;
        sparks.spawn(d.x + Math.cos(a) * 1.4, d.y + 2.4, d.z + Math.sin(a) * 1.4, -Math.sin(a) * 2, 0, Math.cos(a) * 2, 0.25, 0.55, "#ffe066", 0);
      }
    }

    for (const w of wrecks.current) {
      if (w.life <= 0) continue;
      w.life -= dt;
      w.vel.y -= 26 * dt;
      w.mesh.position.addScaledVector(w.vel, dt);
      const gy = groundAt(arena, w.mesh.position.x, w.mesh.position.z, w.mesh.position.y);
      if (w.mesh.position.y < gy) { w.mesh.position.y = gy; w.vel.y *= -0.35; w.vel.x *= 0.6; w.vel.z *= 0.6; w.spin.multiplyScalar(0.6); }
      w.mesh.rotation.x += w.spin.x * dt; w.mesh.rotation.y += w.spin.y * dt; w.mesh.rotation.z += w.spin.z * dt;
      w.mesh.scale.setScalar(Math.min(1, w.life * 2));
      if (w.life <= 0) w.mesh.visible = false;
      else if (Math.random() < 0.4) puffs.spawn(w.mesh.position.x, w.mesh.position.y + 0.5, w.mesh.position.z, rand(0.5), 1.5, rand(0.5), 0.8, 0.5, "#6f6a80", -0.5, 1.8);
    }
  });

  return (
    <group>
      <CameraQuat />
      <instancedMesh ref={puffMesh} args={[undefined, undefined, MAX_PUFF]} frustumCulled={false}>
        <icosahedronGeometry args={[1, 1]} />
        <meshLambertMaterial />
      </instancedMesh>
      <instancedMesh ref={sparkMesh} args={[undefined, undefined, MAX_SPARK]} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial map={sparkTex} transparent blending={THREE.AdditiveBlending} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={skidMesh} args={[undefined, undefined, MAX_SKID]} frustumCulled={false} renderOrder={1}>
        <planeGeometry args={[0.3, 1]} onUpdate={(g) => g.rotateX(-Math.PI / 2)} />
        <meshBasicMaterial color="#3a3550" transparent opacity={0.3} depthWrite={false} polygonOffset polygonOffsetFactor={-4} />
      </instancedMesh>
      <group ref={wreckRoot} />
      <instancedMesh ref={wheelMesh} args={[undefined, litMat, 32]} frustumCulled={false} castShadow onUpdate={(m) => { for (let i = 0; i < 32; i++) m.setMatrixAt(i, HIDDEN); m.instanceMatrix.needsUpdate = true; }}>
        <primitive object={looseWheelGeo} attach="geometry" />
      </instancedMesh>
      <instancedMesh ref={scorch} args={[undefined, undefined, 48]} frustumCulled={false} renderOrder={1} onUpdate={(m) => { for (let i = 0; i < 48; i++) m.setMatrixAt(i, HIDDEN); m.instanceMatrix.needsUpdate = true; }}>
        <circleGeometry args={[1, 20]} />
        <meshBasicMaterial map={scorchTex} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-3} />
      </instancedMesh>
    </group>
  );
}

// sparkles face the camera; share its orientation without allocating per particle
const cameraQuat = new THREE.Quaternion();
function CameraQuat() {
  useFrame((state) => { cameraQuat.copy(state.camera.quaternion); });
  return null;
}
