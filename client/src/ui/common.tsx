import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { ARENA_DEFS, Item, KARTS, kartById } from "../../../shared/src/index.ts";
import { sfx } from "../audio/sfx.ts";
import { settings } from "../game/settings.ts";
import { useSettings } from "../game/useStore.ts";

/**
 * Style for a full-screen layout that fits a w x h design into a smaller landscape window (portal
 * frames such as 640x360, phones held sideways) by laying out at design size and scaling down.
 * Portrait windows get no scaling and use the stacked CSS layout instead.
 */
export function useFit(w: number, h: number): CSSProperties | undefined {
  const get = () => (innerWidth > innerHeight ? Math.min(1, innerWidth / w, innerHeight / h) : 1);
  const [k, setK] = useState(get);
  useEffect(() => {
    const on = () => setK(get());
    addEventListener("resize", on);
    return () => removeEventListener("resize", on);
  }, []);
  return k < 1 ? { width: `${100 / k}%`, height: `${100 / k}%`, transform: `scale(${k})`, transformOrigin: "0 0" } : undefined;
}

export function Button({ children, onClick, variant = "primary", disabled, big, title }: {
  children: ReactNode; onClick?: () => void; variant?: "primary" | "secondary" | "ghost" | "danger"; disabled?: boolean; big?: boolean; title?: string;
}) {
  return (
    <button className={`btn btn-${variant}${big ? " btn-big" : ""}`} disabled={disabled} title={title}
      onClick={() => { sfx.unlock(); sfx.click(); onClick?.(); }}>
      {children}
    </button>
  );
}

export function Modal({ title, children, onClose, wide }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal${wide ? " modal-wide" : ""}`} role="dialog" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const statBar = (v: number, lo: number, hi: number) => Math.round(((v - lo) / (hi - lo)) * 80 + 20);

export function KartPicker({ value, onChange, columns = 4 }: { value: string; onChange: (k: string) => void; columns?: number }) {
  return (
    <div className="kart-grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {KARTS.map((k) => (
        <button key={k.id} className={`kart-card${value === k.id ? " selected" : ""}`} onClick={() => { sfx.click(); onChange(k.id); }} style={{ ["--kc" as string]: k.color }}>
          <div className="kart-swatch" />
          <div className="kart-name">{k.name}</div>
          <div className="kart-tag">{k.tagline}</div>
          <Stat label="Speed" v={statBar(k.maxSpeed, 26.8, 29.2)} />
          <Stat label="Accel" v={statBar(k.accel, 15.2, 19)} />
          <Stat label="Handling" v={statBar(k.turnRate, 2.6, 3.1)} />
          <Stat label="Weight" v={statBar(k.mass, 0.8, 1.4)} />
        </button>
      ))}
    </div>
  );
}

function Stat({ label, v }: { label: string; v: number }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <div className="stat-bar"><div style={{ width: `${v}%` }} /></div>
    </div>
  );
}

export function ArenaPicker({ value, onChange, disabled }: { value: string; onChange: (a: string) => void; disabled?: boolean }) {
  return (
    <div className="arena-grid">
      {ARENA_DEFS.map((a) => (
        <button key={a.id} disabled={disabled} className={`arena-card${value === a.id ? " selected" : ""}`} onClick={() => { sfx.click(); onChange(a.id); }}
          style={{ background: `linear-gradient(160deg, ${a.theme.sky}, ${a.theme.floor} 70%)` }}>
          <div className="arena-name">{a.name}</div>
          <div className="arena-blurb">{a.blurb}</div>
          {a.grip < 1 && <span className="chip">Slippery</span>}
        </button>
      ))}
    </div>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, disabled }: { value: T; options: { v: T; label: string }[]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={String(o.v)} disabled={disabled} className={o.v === value ? "on" : ""} onClick={() => { sfx.click(); onChange(o.v); }}>{o.label}</button>
      ))}
    </div>
  );
}

export function SettingsPanel() {
  const s = useSettings();
  const slider = (key: "volume" | "fxVolume" | "engineVolume", label: string) => (
    <label className="field">
      <span>{label}</span>
      <input type="range" min={0} max={1} step={0.05} value={s[key]} onChange={(e) => settings.update({ [key]: +e.target.value })} />
    </label>
  );
  return (
    <div className="settings">
      {slider("volume", "Master volume")}
      {slider("fxVolume", "Effects")}
      {slider("engineVolume", "Engine")}
      <div className="field"><span>Graphics</span>
        <Segmented value={s.quality} onChange={(quality) => settings.update({ quality })} options={[{ v: "low", label: "Low" }, { v: "medium", label: "Medium" }, { v: "high", label: "High" }]} />
      </div>
      <div className="field"><span>Camera shake</span>
        <Segmented value={s.shake ? "on" : "off"} onChange={(v) => settings.update({ shake: v === "on" })} options={[{ v: "on", label: "On" }, { v: "off", label: "Off" }]} />
      </div>
      <div className="field"><span>Show FPS / ping</span>
        <Segmented value={s.showStats ? "on" : "off"} onChange={(v) => settings.update({ showStats: v === "on" })} options={[{ v: "on", label: "On" }, { v: "off", label: "Off" }]} />
      </div>
    </div>
  );
}

export function Controls() {
  const rows: [string, string][] = [
    ["W / ↑", "Accelerate"], ["S / ↓", "Brake / reverse"], ["A D / ← →", "Steer (turn hard at speed to slide)"], ["Space", "Fire your item (Buzz Gun fires while held)"],
    ["Shift", "Optional: hop-drift, release for a turbo"], ["Esc", "Pause"], ["Touch", "Drag on the left to drive, tap FIRE on the right"], ["Gamepad", "RT accel · LT brake · RB fire · LB drift"],
  ];
  return (
    <div className="controls">
      {rows.map(([k, v]) => <div key={k} className="control-row"><kbd>{k}</kbd><span>{v}</span></div>)}
      <h3>Items</h3>
      <div className="item-legend">
        {[Item.Blaster, Item.Rocket, Item.Hornet, Item.Triple, Item.Lobber, Item.Cannon, Item.Mine, Item.Shield, Item.Overdrive, Item.Patch].map((i) => (
          <div key={i} className="legend-row"><ItemIcon item={i} size={30} /><span><b>{ITEM_INFO[i][0]}</b> {ITEM_INFO[i][1]}</span></div>
        ))}
      </div>
      <p className="hint">Drive through <b>?</b> boxes for a random item and chevron pads for a burst of speed. Explosives wreck a kart in one hit. Wreck karts for points; most points when the timer hits zero wins.</p>
    </div>
  );
}

export const ITEM_INFO: Record<number, [string, string]> = {
  [Item.Blaster]: ["Buzz Gun", "120 rapid rounds, hold Space"],
  [Item.Rocket]: ["Boom Rocket", "fires straight ahead, one-hit wreck"],
  [Item.Hornet]: ["Homing Hornet", "locks onto the kart ahead"],
  [Item.Triple]: ["Triple Hornets", "three homing missiles at once"],
  [Item.Lobber]: ["Lob Bomb", "arcs over walls, huge blast"],
  [Item.Cannon]: ["Big Cannon", "2 heavy cannonballs, aim-assisted"],
  [Item.Mine]: ["Spike Mine", "2 mines dropped behind you"],
  [Item.Shield]: ["Bubble Shield", "6 s invulnerable, ram for damage"],
  [Item.Overdrive]: ["Turbo", "4 s of speed boost"],
  [Item.Patch]: ["Patch Kit", "+50 health"],
};

/** Original vector icons for each item: drawn as little weapon illustrations. */
export function ItemIcon({ item, size = 44 }: { item: number; size?: number }) {
  const steel = "#dfe5ef", dark = "#2b2d42", yellow = "#ffc933", red = "#ff4b4b", brass = "#e2b544";
  const c: Record<number, [string, string, ReactNode]> = {
    [Item.Blaster]: ["#ffb02e", "#e07800", <g>
      <rect x="20" y="17" width="22" height="3.2" rx="1.6" fill={steel} /><rect x="20" y="21.5" width="22" height="3.2" rx="1.6" fill={steel} /><rect x="20" y="26" width="22" height="3.2" rx="1.6" fill={steel} />
      <rect x="38" y="15.5" width="4" height="15" rx="1.5" fill={dark} />
      <rect x="9" y="15" width="14" height="16" rx="4" fill={dark} /><rect x="11" y="18" width="10" height="3" rx="1.5" fill="#5a5f74" />
      <rect x="10" y="30" width="9" height="9" rx="2" fill={yellow} stroke={dark} strokeWidth="1.6" /><path d="M24 31l3 7h-5z" fill={dark} />
    </g>],
    [Item.Rocket]: ["#ff6b6b", "#d93636", <g>
      <path d="M6 30l8-4h8l-4 8H8z" fill="#ffb347" /><path d="M8 29l5-2h6l-3 5H9z" fill="#fff1a8" />
      <rect x="15" y="21" width="20" height="10" rx="3" fill={steel} /><path d="M35 21h4l5 5-5 5h-4z" fill={red} />
      <rect x="20" y="20" width="3" height="12" fill={red} /><path d="M15 21l-4-5h6l3 5zM15 31l-4 5h6l3-5z" fill={yellow} />
    </g>],
    [Item.Hornet]: ["#7d8da3", "#4c5b70", <g>
      <circle cx="24" cy="24" r="15" fill="none" stroke="#fff" strokeWidth="2" strokeDasharray="5 4" opacity="0.8" />
      <path d="M9 24h6M33 24h6M24 9v6M24 33v6" stroke={red} strokeWidth="3" strokeLinecap="round" />
      <rect x="17" y="21" width="15" height="6" rx="3" fill={steel} /><path d="M32 21c3 0 5 1.5 5 3s-2 3-5 3z" fill="#1f2a44" /><path d="M17 21l-4-3v12l4-3z" fill={yellow} />
    </g>],
    [Item.Triple]: ["#ffa94d", "#e8590c", <g>
      {[14, 24, 34].map((y, i) => <g key={i} transform={`translate(${i === 1 ? 4 : 0} ${y - 24})`}><rect x="12" y="21.5" width="18" height="5" rx="2.5" fill={steel} /><path d="M30 21.5c3 0 5 1.2 5 2.5s-2 2.5-5 2.5z" fill={red} /><path d="M12 21.5l-3-2.5v10l3-2.5z" fill={yellow} /></g>)}
    </g>],
    [Item.Lobber]: ["#a678ff", "#6f3fd6", <g>
      <circle cx="21" cy="28" r="11" fill={dark} /><circle cx="17" cy="24" r="3.5" fill="#6f6787" />
      <rect x="27" y="14" width="6" height="6" rx="1.5" fill={steel} transform="rotate(35 30 17)" />
      <path d="M32 13c3-3 5-2 7-5" stroke="#c9b38a" strokeWidth="2" fill="none" /><circle cx="39" cy="8" r="3" fill={yellow} /><circle cx="39" cy="8" r="1.4" fill="#fff" />
    </g>],
    [Item.Cannon]: ["#6c6385", "#3f3854", <g>
      <path d="M10 22l22-8 4 10-22 8z" fill={dark} /><rect x="32" y="13" width="5" height="12" rx="2" fill="#4a4460" transform="rotate(-20 34 19)" />
      <rect x="17" y="18" width="3" height="11" fill={brass} transform="rotate(-20 18 23)" />
      <circle cx="16" cy="32" r="7" fill="#8a5a3c" /><circle cx="16" cy="32" r="2.5" fill={brass} />
    </g>],
    [Item.Mine]: ["#ff5c7a", "#c81e4a", <g>
      {Array.from({ length: 10 }, (_, i) => { const a = (i / 10) * Math.PI * 2; return <path key={i} d={`M${24 + Math.cos(a) * 8} ${25 + Math.sin(a) * 8}L${24 + Math.cos(a) * 16} ${25 + Math.sin(a) * 16}`} stroke={steel} strokeWidth="3.4" strokeLinecap="round" />; })}
      <circle cx="24" cy="25" r="10" fill={dark} /><path d="M14.5 25h19" stroke={red} strokeWidth="3" /><circle cx="24" cy="18.5" r="2.4" fill={red} /><circle cx="24" cy="18.5" r="1" fill="#fff" />
    </g>],
    [Item.Shield]: ["#5fb3ff", "#2f7bff", <path d="M24 6l15 6v10c0 10-7 17-15 20-8-3-15-10-15-20V12z" fill="#fff" />],
    [Item.Overdrive]: ["#ffd23f", "#f59f00", <path d="M27 5L13 27h9l-3 16 16-23h-9z" fill="#fff" />],
    [Item.Patch]: ["#51cf66", "#2b9a3e", <path d="M19 9h10v10h10v10H29v10H19V29H9V19h10z" fill="#fff" />],
    [Item.Lava]: ["#ff7b00", "#d9480f", <path d="M24 8c6 8 12 13 12 21a12 12 0 0 1-24 0c0-8 6-13 12-21z" fill="#ffd43b" />],
  };
  const entry = c[item];
  const id = `ig${item}`;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className="item-icon" aria-hidden>
      <defs><radialGradient id={id} cx="35%" cy="30%" r="75%"><stop offset="0" stopColor={entry ? entry[0] : "#5a6b8c"} /><stop offset="1" stopColor={entry ? entry[1] : "#3a4a6c"} /></radialGradient></defs>
      <circle cx="24" cy="24" r="23" fill={`url(#${id})`} />
      <circle cx="24" cy="24" r="21.5" fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="1.5" />
      {entry ? entry[2] : <circle cx="24" cy="24" r="4" fill="#fff" opacity={0.5} />}
    </svg>
  );
}

export const kartColor = (id: string) => kartById(id).color;
