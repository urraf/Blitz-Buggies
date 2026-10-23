import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { EMOTES } from "../../../shared/src/index.ts";
import { client } from "../game/client.ts";
import { settings } from "../game/settings.ts";

// World-space UI: floating damage numbers / "+1", emote bubbles and the new-player item arrow.

const texCache = new Map<string, THREE.CanvasTexture>();
function textTexture(text: string, color: string, big: boolean) {
  const key = `${text}|${color}|${big}`;
  let t = texCache.get(key);
  if (t) return t;
  const c = document.createElement("canvas");
  c.width = 256; c.height = 128;
  const g = c.getContext("2d")!;
  g.font = `900 ${big ? 92 : 64}px 'Baloo 2', sans-serif`;
  g.textAlign = "center"; g.textBaseline = "middle";
  g.lineJoin = "round";
  g.lineWidth = big ? 16 : 12; g.strokeStyle = "#1d2a6b";
  g.strokeText(text, 128, 68);
  g.fillStyle = color; g.fillText(text, 128, 68);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}

export function emoteTexture(i: number) {
  const key = `emote:${i}`;
  let t = texCache.get(key);
  if (t) return t;
  const c = document.createElement("canvas");
  c.width = 128; c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = "#ffffff";
  g.beginPath(); g.arc(64, 58, 50, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(50, 100); g.lineTo(64, 124); g.lineTo(78, 100); g.fill();
  g.strokeStyle = "#3b7cf0"; g.lineWidth = 6; g.beginPath(); g.arc(64, 58, 50, 0, Math.PI * 2); g.stroke();
  g.font = "64px 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif";
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText(EMOTES[i] ?? "🙂", 64, 62);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}

const POOL = 24;
const LIFE = 1.1;

export function Popups() {
  const sprites = useRef<(THREE.Sprite | null)[]>([]);
  const mats = useMemo(() => Array.from({ length: POOL }, () => new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false })), []);
  useFrame(() => {
    const now = performance.now();
    while (client.popups.length && (now - client.popups[0].t0) / 1000 > LIFE) client.popups.shift();
    for (let i = 0; i < POOL; i++) {
      const s = sprites.current[i];
      if (!s) continue;
      const p = client.popups[i];
      if (!p) { s.visible = false; continue; }
      const age = (now - p.t0) / 1000;
      const k = age / LIFE;
      s.visible = true;
      const mat = mats[i];
      const tex = textTexture(p.text, p.color, p.big);
      if (mat.map !== tex) { mat.map = tex; mat.needsUpdate = true; }
      mat.opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      // pop in with overshoot, then float up
      const pop = age < 0.15 ? 0.4 + (age / 0.15) * 0.9 : 1.3 - Math.min(0.3, (age - 0.15) * 1.2);
      const base = p.big ? 3.4 : 2.0;
      s.scale.set(base * 2 * pop, base * pop, 1);
      s.position.set(p.x, p.y + age * 1.8, p.z);
    }
  });
  return <>{mats.map((m, i) => <sprite key={i} ref={(s) => { sprites.current[i] = s; }} material={m} visible={false} renderOrder={10} />)}</>;
}

/** Floating arrow over your kart pointing at the nearest item box (first few matches, while unarmed). */
export function HintArrow() {
  const g = useRef<THREE.Group>(null);
  useFrame(() => {
    const ui = client.ui.get();
    const grp = g.current;
    if (!grp) return;
    const me = client.karts.get(ui.you);
    const show = !!me && me.visible && settings.get().tutorialSeen < 3 && !ui.hud.item && ui.hud.countdown <= 0;
    grp.visible = show;
    if (!show || !me) return;
    let best = -1, bd = Infinity;
    client.arena.crates.forEach(([x, z], i) => {
      if (client.crates[i] === false) return;
      const d = (x - me.x) ** 2 + (z - me.z) ** 2;
      if (d < bd) { bd = d; best = i; }
    });
    if (best < 0) { grp.visible = false; return; }
    const [cx, cz] = client.arena.crates[best];
    const t = performance.now() / 1000;
    grp.position.set(me.x, me.y + 3.6 + Math.sin(t * 5) * 0.15, me.z);
    grp.rotation.y = Math.atan2(cx - me.x, cz - me.z);
  });
  return (
    <group ref={g} visible={false}>
      <mesh position={[0, 0, 0.9]} rotation-x={Math.PI / 2}>
        <coneGeometry args={[0.55, 1.1, 4]} />
        <meshBasicMaterial color={[2, 1.6, 0.3]} />
      </mesh>
      <mesh position={[0, 0, -0.1]} rotation-x={Math.PI / 2}>
        <cylinderGeometry args={[0.2, 0.2, 1.1, 8]} />
        <meshBasicMaterial color={[2, 1.6, 0.3]} />
      </mesh>
    </group>
  );
}
