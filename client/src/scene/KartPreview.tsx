import { Canvas, useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type * as THREE from "three";
import { KartModel } from "./Kart.tsx";

function Turntable({ kart, look }: { kart: string; look: string }) {
  const g = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (!g.current) return;
    g.current.rotation.y += dt * 0.8;
    g.current.position.y = Math.sin(performance.now() / 600) * 0.08;
  });
  return (
    <group ref={g}>
      <KartModel kart={kart} look={look} />
    </group>
  );
}

/** Spinning 3D kart for the menus (lazy-loaded with the rest of three.js). */
export default function KartPreview({ kart, look }: { kart: string; look: string }) {
  return (
    // offsetSize: measure the unscaled layout box (the home screen may be CSS-scaled to fit small frames)
    <Canvas dpr={[1, 2]} resize={{ offsetSize: true }} camera={{ position: [4.2, 2.6, 4.2], fov: 38 }} onCreated={({ camera }) => camera.lookAt(0, 0.7, 0)} gl={{ alpha: true, antialias: true }}>
      <hemisphereLight args={["#ffffff", "#5a189a", 1.3]} />
      <directionalLight position={[3, 6, 4]} intensity={2.2} />
      <Turntable key={kart + look} kart={kart} look={look} />
      <mesh rotation-x={-Math.PI / 2} position-y={0.001}>
        <circleGeometry args={[2.4, 40]} />
        <meshBasicMaterial color="#000" transparent opacity={0.25} />
      </mesh>
    </Canvas>
  );
}
