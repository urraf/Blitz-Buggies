import { useEffect, useRef, useState } from "react";
import { Btn } from "../../../shared/src/index.ts";
import { sfx } from "../audio/sfx.ts";
import { input } from "../game/input.ts";

export const isTouchDevice = () => typeof window !== "undefined" && (navigator.maxTouchPoints > 0 || "ontouchstart" in window) && matchMedia("(pointer: coarse)").matches;

/**
 * On-screen controls for tablets/phones. Left: drag stick (any touch drives forward, drag sideways
 * to steer, pull down to brake/reverse). Right: fire button. Drift button for advanced players.
 */
export function TouchControls() {
  const [stick, setStick] = useState<{ ox: number; oy: number; dx: number; dy: number } | null>(null);
  const stickId = useRef<number | null>(null);
  const fire = useRef(false);
  const drift = useRef(false);

  useEffect(() => () => { input.touch = 0; }, []);

  const apply = (s: typeof stick) => {
    let bits = 0;
    if (s) {
      if (s.dx < -16) bits |= Btn.Left;
      if (s.dx > 16) bits |= Btn.Right;
      bits |= s.dy > 34 ? Btn.Down : Btn.Up;
    }
    if (fire.current) bits |= Btn.Fire;
    if (drift.current) bits |= Btn.Drift;
    input.touch = bits;
  };

  const onDown = (e: React.PointerEvent) => {
    sfx.unlock();
    if (stickId.current !== null) return;
    stickId.current = e.pointerId;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const s = { ox: e.clientX, oy: e.clientY, dx: 0, dy: 0 };
    setStick(s); apply(s);
  };
  const onMove = (e: React.PointerEvent) => {
    if (e.pointerId !== stickId.current || !stick) return;
    const dx = Math.max(-60, Math.min(60, e.clientX - stick.ox));
    const dy = Math.max(-60, Math.min(60, e.clientY - stick.oy));
    const s = { ...stick, dx, dy };
    setStick(s); apply(s);
  };
  const onUp = (e: React.PointerEvent) => {
    if (e.pointerId !== stickId.current) return;
    stickId.current = null;
    setStick(null); apply(null);
  };
  const hold = (ref: React.RefObject<boolean>, v: boolean) => (e: React.PointerEvent) => { e.stopPropagation(); sfx.unlock(); ref.current = v; apply(stick); };

  return (
    <div className="touch-layer">
      <div className="touch-stick-zone" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        {stick ? (
          <div className="touch-stick" style={{ left: stick.ox, top: stick.oy }}>
            <div className="touch-knob" style={{ transform: `translate(${stick.dx}px, ${stick.dy}px)` }} />
          </div>
        ) : (
          <div className="touch-hint">Touch & drag to drive</div>
        )}
      </div>
      <button className="touch-btn touch-fire" onPointerDown={hold(fire, true)} onPointerUp={hold(fire, false)} onPointerCancel={hold(fire, false)} onPointerLeave={hold(fire, false)}>FIRE</button>
      <button className="touch-btn touch-drift" onPointerDown={hold(drift, true)} onPointerUp={hold(drift, false)} onPointerCancel={hold(drift, false)} onPointerLeave={hold(drift, false)}>DRIFT</button>
    </div>
  );
}
