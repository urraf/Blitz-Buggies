import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import type { Arena, Block, Decor, Paint } from "../../../shared/src/index.ts";
import { flatQuad, merge, rampGeometry, roundedBlock, tint } from "./geometry.ts";
import { chevronTexture, grassTexture, lavaTexture, paintTexture, surfaceTexture, waterTexture, zigzagTexture } from "./textures.ts";

const lighten = (c: string, amt: number) => "#" + new THREE.Color(c).lerp(new THREE.Color("#ffffff"), amt).getHexString();

/**
 * Static arena in a bright toy style. Solids are merged into one vertex-coloured mesh, decals and
 * textured tops into a few more, so the level is a handful of draw calls.
 */
export function ArenaView({ arena, shadows }: { arena: Arena; shadows: boolean }) {
  const t = arena.theme;
  const built = useMemo(() => {
    const solids: THREE.BufferGeometry[] = [];
    const grassTops: THREE.BufferGeometry[] = [];
    const cakeTops: THREE.BufferGeometry[] = [];
    for (const b of arena.solids) addBlock(b, arena, solids, grassTops, cakeTops);
    const paint = new Map<Paint["kind"], THREE.BufferGeometry[]>();
    for (const p of arena.paint) {
      const list = paint.get(p.kind) ?? [];
      const scale = p.kind === "zebra" || p.kind === "kerb" ? 0.5 : 0.25;
      list.push(flatQuad(p.x, p.z, p.w, p.d, 0.015 + list.length * 0.0001, scale, p.rot === 1));
      paint.set(p.kind, list);
    }
    const kind = arena.style === "sky" ? "track" : arena.style === "ice" ? "ice" : "road";
    const floorTex = surfaceTexture(t.floor, t.floorAlt, kind).clone();
    floorTex.repeat.set(arena.size[0] / 10, arena.size[1] / 10);
    floorTex.needsUpdate = true;
    const rampTex = arena.style === "sky" ? zigzagTexture(t.ramp, "#ffd1e6") : arena.style === "ice" ? zigzagTexture(t.ramp, "#ffffff") : zigzagTexture("#ff8fb8", "#ffe3ef");
    return {
      solids: merge(solids),
      grass: merge(grassTops),
      cake: merge(cakeTops),
      ramps: merge(arena.ramps.map(rampGeometry)),
      paint: [...paint.entries()].map(([k, g]) => ({ kind: k, geo: merge(g) })),
      floorTex,
      rampTex,
    };
  }, [arena, t]);

  const half = Math.max(arena.size[0], arena.size[1]) / 2 + 10;

  return (
    <>
      <fog attach="fog" args={[t.fog, 150, 560]} />
      <hemisphereLight args={[t.ambient, t.floor, 1.35]} />
      <directionalLight
        position={[-60, 110, -40]}
        intensity={1.55}
        color={t.sun}
        castShadow={shadows}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-half}
        shadow-camera-right={half}
        shadow-camera-top={half}
        shadow-camera-bottom={-half}
        shadow-camera-near={20}
        shadow-camera-far={300}
        shadow-bias={-0.0004}
        shadow-radius={4}
      />
      <Environment arena={arena} />

      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[arena.size[0] + 6, arena.size[1] + 6]} />
        <meshLambertMaterial map={built.floorTex} />
      </mesh>
      {built.paint.map((p) => (
        <mesh key={p.kind} geometry={p.geo} receiveShadow>
          <meshLambertMaterial map={paintTexture(p.kind)} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
        </mesh>
      ))}
      <mesh geometry={built.solids} castShadow receiveShadow>
        <meshLambertMaterial vertexColors />
      </mesh>
      <mesh geometry={built.grass} receiveShadow>
        <meshLambertMaterial map={grassTexture()} polygonOffset polygonOffsetFactor={-1} />
      </mesh>
      <mesh geometry={built.cake} receiveShadow>
        <meshLambertMaterial map={zigzagTexture("#ffb3d1", "#fff0f6")} polygonOffset polygonOffsetFactor={-1} />
      </mesh>
      <mesh geometry={built.ramps} castShadow receiveShadow>
        <meshLambertMaterial map={built.rampTex} />
      </mesh>
      {arena.pads.map((p, i) => <BoostPad key={i} {...p} y={padY(arena, p.x, p.z)} />)}
      {arena.hazards.length > 0 && <LavaPools arena={arena} />}
    </>
  );
}

function addBlock(b: Block, arena: Arena, solids: THREE.BufferGeometry[], grass: THREE.BufferGeometry[], cake: THREE.BufferGeometry[]) {
  const t = arena.theme;
  switch (b.style ?? "block") {
    case "wall":
      solids.push(roundedBlock(b.x, b.z, b.w, b.h, b.d, t.wall));
      solids.push(roundedBlock(b.x, b.z, b.w + 0.1, 0.26, b.d + 0.1, lighten(t.accent, 0.1), b.h - 0.18, 0.12));
      break;
    case "grass":
      // raised flower-bed: coloured rim with a checkered grass top
      solids.push(roundedBlock(b.x, b.z, b.w, b.h, b.d, t.wall));
      solids.push(roundedBlock(b.x, b.z, b.w + 0.12, 0.22, b.d + 0.12, lighten(t.accent, 0.15), b.h - 0.16, 0.1));
      grass.push(flatQuad(b.x, b.z, b.w - 1.3, b.d - 1.3, b.h + 0.04, 0.25));
      break;
    case "cake":
      solids.push(roundedBlock(b.x, b.z, b.w, b.h, b.d, t.platform));
      solids.push(roundedBlock(b.x, b.z, b.w + 0.35, 0.5, b.d + 0.35, "#fff3e8", b.h - 0.38, 0.22));
      for (let i = 0; i < Math.floor((b.w + b.d) / 3); i++) {
        // frosting drips around the rim
        const side = i % 4, f = ((i * 0.37) % 1) * 0.9 + 0.05;
        const x = side < 2 ? b.x - b.w / 2 + f * b.w : b.x + (side === 2 ? 1 : -1) * (b.w / 2 + 0.1);
        const z = side < 2 ? b.z + (side === 0 ? 1 : -1) * (b.d / 2 + 0.1) : b.z - b.d / 2 + f * b.d;
        solids.push(roundedBlock(x, z, 0.7, 0.8 + (i % 3) * 0.3, 0.7, "#fff3e8", b.h - 1.2 - (i % 3) * 0.3, 0.3));
      }
      cake.push(flatQuad(b.x, b.z, b.w - 0.6, b.d - 0.6, b.h + 0.14, 0.2));
      break;
    case "pillar":
      solids.push(roundedBlock(b.x, b.z, b.w, b.h, b.d, t.block, 0, b.w * 0.42));
      solids.push(roundedBlock(b.x, b.z, b.w + 0.15, 0.45, b.d + 0.15, lighten(t.accent, 0.1), b.h * 0.55, 0.2));
      solids.push(roundedBlock(b.x, b.z, b.w + 0.15, 0.45, b.d + 0.15, lighten(t.accent, 0.1), b.h - 0.5, 0.2));
      break;
    case "platform":
      solids.push(roundedBlock(b.x, b.z, b.w, b.h, b.d, t.platform));
      solids.push(roundedBlock(b.x, b.z, b.w + 0.12, 0.24, b.d + 0.12, t.accent, b.h - 0.16, 0.1));
      break;
    default: {
      const c = b.color ?? t.block;
      solids.push(roundedBlock(b.x, b.z, b.w, b.h, b.d, c));
      solids.push(roundedBlock(b.x, b.z, b.w + 0.1, 0.24, b.d + 0.1, lighten(c, 0.45), b.h - 0.17, 0.1));
    }
  }
}

/** Hazard floors: animated molten lava (one merged mesh) with a soft orange glow light. */
function LavaPools({ arena }: { arena: Arena }) {
  const { geo, tex } = useMemo(() => {
    const t = lavaTexture().clone();
    t.needsUpdate = true;
    return { geo: merge(arena.hazards.map((h) => flatQuad(h.x, h.z, h.w, h.d, 0.04, 0.12))), tex: t };
  }, [arena]);
  useFrame((_, dt) => { tex.offset.x += dt * 0.03; tex.offset.y += dt * 0.017; });
  return (
    <>
      <mesh geometry={geo}>
        <meshBasicMaterial map={tex} color={[1.7, 1.25, 1]} />
      </mesh>
      {arena.hazards.slice(0, 4).map((h, i) => <pointLight key={i} position={[h.x, 2.5, h.z]} color="#ff7b00" intensity={18} distance={22} decay={2} />)}
    </>
  );
}

function padY(arena: Arena, x: number, z: number) {
  let y = 0;
  for (const b of arena.solids) if (Math.abs(x - b.x) < b.w / 2 && Math.abs(z - b.z) < b.d / 2) y = Math.max(y, b.h);
  return y;
}

function BoostPad({ x, z, w, d, yaw, y }: { x: number; z: number; w: number; d: number; yaw: number; y: number }) {
  const tex = useMemo(() => {
    const tt = chevronTexture("#ffd23f").clone();
    tt.needsUpdate = true;
    return tt;
  }, []);
  const along = Math.abs(Math.sin(yaw)) > 0.5 ? w : d;
  const across = Math.abs(Math.sin(yaw)) > 0.5 ? d : w;
  tex.repeat.set(1, along / 5);
  return (
    <mesh position={[x, y + 0.03, z]} rotation={[-Math.PI / 2, 0, yaw + Math.PI]} onBeforeRender={() => { tex.offset.y = (performance.now() / 500) % 1; }}>
      <planeGeometry args={[across, along]} />
      <meshBasicMaterial map={tex} />
    </mesh>
  );
}

// ------------------------------------------------------------------ surroundings

const skyVert = `varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const skyFrag = `uniform vec3 top; uniform vec3 horizon; varying vec3 vPos;
void main(){ float h = normalize(vPos).y; float t = smoothstep(-0.05, 0.55, h); gl_FragColor = vec4(mix(horizon, top, t), 1.0); }`;

function SkyDome({ top, horizon }: { top: string; horizon: string }) {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { top: { value: new THREE.Color(top) }, horizon: { value: new THREE.Color(horizon) } },
    vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false, fog: false,
  }), [top, horizon]);
  return <mesh material={mat} renderOrder={-1}><sphereGeometry args={[700, 24, 12]} /></mesh>;
}

function Environment({ arena }: { arena: Arena }) {
  const t = arena.theme;
  const [w, d] = arena.size;
  const water = useMemo(() => {
    const tex = (arena.style === "lava" ? lavaTexture() : waterTexture(arena.style === "ice" ? "#5ab8e8" : "#2fb8ee", arena.style === "ice" ? "#bfe9ff" : "#7fdcff")).clone();
    tex.repeat.set(arena.style === "lava" ? 120 : 60, arena.style === "lava" ? 120 : 60);
    tex.needsUpdate = true;
    return tex;
  }, [arena.style]);
  useFrame((_, dt) => { water.offset.x += dt * 0.01; water.offset.y += dt * 0.006; });
  const props = useMemo(() => buildDecor(arena.decor, arena), [arena]);

  return (
    <group>
      <SkyDome top={arena.style === "sky" ? "#6ec6ff" : "#5fb8ff"} horizon={t.fog} />
      {(arena.style === "island" || arena.style === "ice" || arena.style === "lava") && (
        <mesh rotation-x={-Math.PI / 2} position-y={-0.9}>
          <planeGeometry args={[1600, 1600]} />
          {arena.style === "lava" ? <meshBasicMaterial map={water} /> : <meshLambertMaterial map={water} />}
        </mesh>
      )}
      {arena.style === "lava" && (
        <mesh rotation-x={-Math.PI / 2} position-y={-0.12} receiveShadow>
          <planeGeometry args={[w + 50, d + 50]} />
          <meshLambertMaterial color="#4a3a52" />
        </mesh>
      )}
      {arena.style === "park" && (
        <>
          <mesh rotation-x={-Math.PI / 2} position-y={-0.12} receiveShadow>
            <planeGeometry args={[1600, 1600]} />
            <meshLambertMaterial map={grassTexture()} onUpdate={(m) => { const mt = m as THREE.MeshLambertMaterial; if (mt.map) { mt.map = mt.map.clone(); mt.map.repeat.set(300, 300); mt.map.needsUpdate = true; } }} />
          </mesh>
          <mesh rotation-x={-Math.PI / 2} position-y={-0.08} receiveShadow>
            <planeGeometry args={[w + 24, d + 24]} />
            <meshLambertMaterial color="#e6e1d6" />
          </mesh>
        </>
      )}
      {arena.style === "island" && (
        <mesh rotation-x={-Math.PI / 2} position-y={-0.12} receiveShadow>
          <planeGeometry args={[w + 46, d + 46]} />
          <meshLambertMaterial color="#ffe2a3" />
        </mesh>
      )}
      {arena.style === "ice" && (
        <mesh rotation-x={-Math.PI / 2} position-y={-0.12} receiveShadow>
          <planeGeometry args={[w + 70, d + 70]} />
          <meshLambertMaterial color="#ffffff" />
        </mesh>
      )}
      {arena.style === "sky" && (
        <>
          {/* the arena floats: a thick candy slab under the court and a sea of clouds far below */}
          <mesh position={[0, -4.4, 0]} receiveShadow>
            <boxGeometry args={[w + 10, 8, d + 10]} />
            <meshLambertMaterial color="#ffad5a" />
          </mesh>
          <mesh position={[0, -0.6, 0]}>
            <boxGeometry args={[w + 11, 0.5, d + 11]} />
            <meshLambertMaterial color="#fff3e8" />
          </mesh>
          <mesh rotation-x={-Math.PI / 2} position-y={-60}>
            <planeGeometry args={[2000, 2000]} />
            <meshLambertMaterial color="#ffffff" />
          </mesh>
        </>
      )}
      <mesh geometry={props} castShadow>
        <meshLambertMaterial vertexColors />
      </mesh>
    </group>
  );
}

const ni = (g: THREE.BufferGeometry) => (g.index ? g.toNonIndexed() : g);
const part = (g: THREE.BufferGeometry, x: number, y: number, z: number, color: string) => {
  g.translate(x, y, z);
  const n = ni(g);
  if (n.attributes.uv) n.deleteAttribute("uv");
  return tint(n, color);
};

function buildDecor(decor: Decor[], arena: Arena) {
  const out: THREE.BufferGeometry[] = [];
  const accent = arena.theme.accent;
  const cakeColors = ["#ffd1dc", "#ffe9a8", "#c8f0ff", "#d9c8ff", "#c9f5d0"];
  decor.forEach((dc, i) => {
    const s = dc.s, x = dc.x, z = dc.z;
    switch (dc.kind) {
      case "palm": {
        for (let k = 0; k < 5; k++) out.push(part(new THREE.CylinderGeometry(0.28 * s, 0.36 * s, 1.6 * s, 7), x + k * 0.18 * s, (0.8 + k * 1.5) * s, z, "#b07a4a"));
        const top = 7.8 * s;
        for (let k = 0; k < 7; k++) {
          const a = (k / 7) * Math.PI * 2;
          const leaf = new THREE.ConeGeometry(0.55 * s, 4 * s, 4);
          leaf.rotateZ(Math.PI / 2 + 0.5);
          leaf.rotateY(a);
          out.push(part(leaf, x + 0.9 * s + Math.cos(a) * 1.6 * s, top - 0.4 * s, z - Math.sin(a) * 1.6 * s, k % 2 ? "#3fbf5a" : "#4fd36a"));
        }
        out.push(part(new THREE.SphereGeometry(0.35 * s, 8, 6), x + 0.9 * s, top - 0.6 * s, z + 0.3 * s, "#7a4b2a"));
        break;
      }
      case "rock":
        out.push(part(new THREE.DodecahedronGeometry(2 * s, 0), x, 0.8 * s, z, arena.style === "lava" ? "#5b4a63" : "#b9bfcc"));
        break;
      case "volcano": {
        out.push(part(new THREE.CylinderGeometry(6 * s, 22 * s, 26 * s, 12, 1, true), x * 1.6, 12 * s, z * 1.6, "#4a3a52"));
        out.push(part(new THREE.CylinderGeometry(5.5 * s, 6 * s, 1.5 * s, 12), x * 1.6, 25 * s, z * 1.6, "#ff7b00"));
        for (let k = 0; k < 4; k++) out.push(part(new THREE.BoxGeometry(1.4 * s, 10 * s, 0.6 * s), x * 1.6 + Math.sin(k * 1.6) * 7 * s, 18 * s, z * 1.6 + Math.cos(k * 1.6) * 7 * s, "#ff9b3d"));
        break;
      }
      case "building": {
        const h = (14 + ((i * 7) % 5) * 6) * s, bw = 10 * s;
        const colors = ["#ffd1dc", "#c8f0ff", "#ffe9a8", "#d9c8ff", "#c9f5d0"];
        out.push(part(new THREE.BoxGeometry(bw, h, bw), x * 1.3, h / 2, z * 1.3, colors[i % colors.length]));
        out.push(part(new THREE.BoxGeometry(bw + 0.6, 0.8, bw + 0.6), x * 1.3, h, z * 1.3, "#ffffff"));
        for (let row = 0; row < Math.floor(h / 4); row++) out.push(part(new THREE.BoxGeometry(bw + 0.1, 0.9, bw * 0.75), x * 1.3, 2.5 + row * 4, z * 1.3, "#7fb8e8"));
        break;
      }
      case "cloud": {
        const y = arena.style === "sky" ? -18 + (i % 5) * 12 : 45 + (i % 4) * 10;
        for (let k = 0; k < 6; k++) out.push(part(new THREE.SphereGeometry((5 + (k % 3) * 2) * s, 10, 8), x + (k - 2.5) * 5 * s, y + (k % 2) * 2 * s, z + ((k * 7) % 5) * s, "#ffffff"));
        break;
      }
      case "cake": {
        let y = arena.style === "sky" ? -30 : 0;
        for (let tier = 0; tier < 4; tier++) {
          const r = (9 - tier * 1.8) * s, h = (6 + tier) * s;
          out.push(part(new THREE.CylinderGeometry(r, r, h, 20), x, y + h / 2, z, cakeColors[(i + tier) % cakeColors.length]));
          out.push(part(new THREE.CylinderGeometry(r * 1.04, r * 1.04, 0.9 * s, 20), x, y + h, z, "#ffffff"));
          y += h;
        }
        out.push(part(new THREE.SphereGeometry(1.4 * s, 10, 8), x, y + 1.2 * s, z, "#ff4d6d"));
        break;
      }
      case "balloon": {
        const y = 18 + (i % 4) * 6;
        out.push(part(new THREE.SphereGeometry(2.4 * s, 12, 10), x, y, z, ["#ff5d5d", "#ffd23f", "#3fa7ff", "#c77dff"][i % 4]));
        out.push(part(new THREE.CylinderGeometry(0.05, 0.05, 8, 4), x, y - 6, z, "#ffffff"));
        break;
      }
      case "pine":
        out.push(part(new THREE.CylinderGeometry(0.35 * s, 0.45 * s, 2 * s, 6), x, 1 * s, z, "#8a5a3c"));
        for (let k = 0; k < 3; k++) {
          out.push(part(new THREE.ConeGeometry((2.6 - k * 0.6) * s, 2.6 * s, 8), x, (2.4 + k * 1.5) * s, z, "#2f9e5b"));
          out.push(part(new THREE.ConeGeometry((1.6 - k * 0.35) * s, 1.1 * s, 8), x, (3.2 + k * 1.5) * s, z, "#ffffff"));
        }
        break;
      case "iceberg":
        out.push(part(new THREE.DodecahedronGeometry(3.5 * s, 0), x, 0.6 * s, z, "#e9f8ff"));
        out.push(part(new THREE.OctahedronGeometry(2.2 * s, 0), x + 1.5 * s, 3 * s, z, "#c7ecff"));
        break;
      case "crystal":
        out.push(part(new THREE.OctahedronGeometry(1.6 * s, 0), x, 3.4 * s, z, accent));
        break;
      case "tree":
        out.push(part(new THREE.CylinderGeometry(0.4 * s, 0.5 * s, 2.5 * s, 6), x, 1.25 * s, z, "#8a5a3c"));
        out.push(part(new THREE.SphereGeometry(2.4 * s, 10, 8), x, 4 * s, z, "#4fd36a"));
        break;
      default:
        out.push(part(new THREE.CylinderGeometry(0.2, 0.25, 7, 6), x, 3.5, z, "#ffffff"));
        out.push(part(new THREE.SphereGeometry(0.8, 8, 6), x, 7.4, z, accent));
    }
  });
  return merge(out);
}
