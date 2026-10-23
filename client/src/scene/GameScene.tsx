import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, SMAA, Vignette } from "@react-three/postprocessing";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { KFlag, lerpAngle, segmentClear } from "../../../shared/src/index.ts";
import { sfx } from "../audio/sfx.ts";
import { client } from "../game/client.ts";
import { useSettings, useUi } from "../game/useStore.ts";
import { ArenaView } from "./Arena.tsx";
import { Effects, Pickups, Projectiles } from "./Entities.tsx";
import { KartView } from "./Kart.tsx";
import { HintArrow, Popups } from "./Overlays3D.tsx";

/** Soft studio reflections for metallic parts (weapons, projectiles). Lambert surfaces ignore it. */
function EnvMap() {
  const { gl, scene } = useThree();
  useMemo(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    pmrem.dispose();
  }, [gl, scene]);
  return null;
}

/** Runs the client simulation before anything else renders this frame. */
function FrameDriver() {
  useFrame((_, dt) => client.frame(dt), -2);
  return null;
}

const tmpTarget = new THREE.Vector3();
const tmpLook = new THREE.Vector3();

// Chase-camera framing: kart ≈ 8 % of screen width, horizon in the top fifth, pitched ≈ 25° down.
const CAM_BACK = 11.5;
const CAM_UP = 7.6;
const LOOK_AHEAD = 7.5;
const BASE_FOV = 58;

function CameraRig() {
  const { camera } = useThree();
  const look = useRef(new THREE.Vector3());
  const yaw = useRef(0);
  const init = useRef(false);
  const orbit = useRef(0);
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    const ui = client.ui.get();
    const cam = camera as THREE.PerspectiveCamera;
    let k = client.karts.get(ui.you);
    const ownAlive = !!k && k.visible;
    if (!ownAlive && client.spectate >= 0) {
      const s = client.karts.get(client.spectate);
      if (s?.visible) k = s;
    }
    if (!k) return;
    if (!init.current) yaw.current = k.yaw;
    // heading follows with a little lag so slides and turns read on screen
    yaw.current = lerpAngle(yaw.current, k.yaw, 1 - Math.exp(-dt * 5.5));
    const boosting = (k.flags & KFlag.Boost) !== 0;
    const fx = Math.sin(yaw.current), fz = Math.cos(yaw.current);
    const cd = ui.hud.countdown;
    let dist = CAM_BACK + (boosting ? 1 : 0) + (k.id === ui.you ? client.recoil * 0.9 : 0);
    let height = CAM_UP;
    if (cd > 0) { dist += cd * 4; height += cd * 3.5; }
    if (!ownAlive && k.id === ui.you) {
      orbit.current += dt * 0.6;
      tmpTarget.set(k.x + Math.sin(orbit.current) * 12, k.y + 9, k.z + Math.cos(orbit.current) * 12);
    } else {
      tmpTarget.set(k.x - fx * dist, k.y + height, k.z - fz * dist);
    }
    // pull the camera in (and up) when a pillar or wall sits between it and the kart
    const clear = segmentClear(client.arena, k.x, k.z, tmpTarget.x, tmpTarget.z, tmpTarget.y - 0.6);
    if (clear < 1) {
      const f = Math.max(0.25, clear - 0.08);
      tmpTarget.x = k.x + (tmpTarget.x - k.x) * f;
      tmpTarget.z = k.z + (tmpTarget.z - k.z) * f;
      tmpTarget.y += (1 - f) * 2.5;
    }
    tmpLook.set(k.x + fx * LOOK_AHEAD, k.y + 1.0, k.z + fz * LOOK_AHEAD);
    if (!init.current) { cam.position.copy(tmpTarget); look.current.copy(tmpLook); init.current = true; }
    const a = 1 - Math.exp(-dt * (cd > 0 ? 2.5 : 9));
    cam.position.lerp(tmpTarget, a);
    if (cam.position.y < k.y + 1.5) cam.position.y = k.y + 1.5;
    look.current.lerp(tmpLook, 1 - Math.exp(-dt * 14));
    const sh = client.shake * 0.4;
    cam.lookAt(look.current.x + (Math.random() - 0.5) * sh, look.current.y + (Math.random() - 0.5) * sh, look.current.z + (Math.random() - 0.5) * sh);
    const fov = BASE_FOV + Math.min(6, Math.abs(k.speed) * 0.18) + (boosting ? 4 : 0) + (k.id === ui.you ? client.recoil * 3 : 0);
    if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = THREE.MathUtils.lerp(cam.fov, fov, 1 - Math.exp(-dt * 4)); cam.updateProjectionMatrix(); }
    const me = client.karts.get(ui.you);
    sfx.engine(me ? me.speed / 28 : 0, !!me && (me.flags & KFlag.Boost) !== 0, ownAlive && ui.screen === "game" && !ui.paused);
  });
  return null;
}

export default function GameScene() {
  const arenaId = useUi((s) => s.arena);
  const roster = useUi((s) => s.roster);
  const you = useUi((s) => s.you);
  const quality = useSettings().quality;
  const arena = useMemo(() => client.arena, [arenaId]); // eslint-disable-line react-hooks/exhaustive-deps
  const shadows = quality !== "low";
  const dpr: [number, number] = quality === "high" ? [1, 2] : quality === "medium" ? [1, 1.25] : [0.75, 1];

  return (
    <Canvas
      shadows={shadows ? "soft" : false}
      dpr={dpr}
      flat
      gl={{ antialias: quality !== "low", powerPreference: "high-performance" }}
      camera={{ fov: BASE_FOV, near: 0.3, far: 1400, position: [0, 30, -60] }}
      onCreated={({ gl }) => {
        (window as unknown as { __gl: THREE.WebGLRenderer }).__gl = gl; // perf inspection hook
      }}
    >
      <FrameDriver />
      <EnvMap />
      <ArenaView key={arena.id} arena={arena} shadows={shadows} />
      {[...roster.values()].map((r) => <KartView key={`${r.id}:${r.kart}`} entry={r} isYou={r.id === you} />)}
      <Projectiles />
      <Pickups key={`p-${arena.id}`} arena={arena} />
      <Effects particleScale={quality === "low" ? 0.4 : quality === "medium" ? 0.7 : 1} />
      <CameraRig />
      <Popups />
      <HintArrow />
      {quality === "high" && (
        // glow only on genuinely bright things (flames, sparkles, lava, tracers): lit surfaces stay below the threshold
        <EffectComposer multisampling={0} enableNormalPass={false}>
          <Bloom luminanceThreshold={0.92} luminanceSmoothing={0.12} intensity={0.75} mipmapBlur />
          <SMAA />
          <Vignette offset={0.32} darkness={0.32} />
        </EffectComposer>
      )}
    </Canvas>
  );
}
