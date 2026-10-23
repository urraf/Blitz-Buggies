import { sfx } from "../audio/sfx.ts";

export interface Settings {
  name: string;
  kart: string;
  /** cosmetic look "driver.hat.paint" (see shared/cosmetics.ts) */
  look: string;
  musicVolume: number;
  /** matches played: the controls card shows for the first few */
  tutorialSeen: number;
  volume: number;
  fxVolume: number;
  engineVolume: number;
  quality: "low" | "medium" | "high";
  shake: boolean;
  showStats: boolean;
}

const KEY = "bb.settings";
const defaults: Settings = { name: "", kart: "sprocket", look: "frog.none.0", musicVolume: 0.45, tutorialSeen: 0, volume: 0.7, fxVolume: 0.9, engineVolume: 0.5, quality: "high", shake: true, showStats: true };

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch { /* storage unavailable: use defaults */ }
  return { ...defaults };
}

let current = load();
const listeners = new Set<() => void>();

export const settings = {
  get: () => current,
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },
  update(patch: Partial<Settings>) {
    current = { ...current, ...patch };
    try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* ignore */ }
    sfx.volume = current.volume;
    sfx.fxVolume = current.fxVolume;
    sfx.engineVolume = current.engineVolume;
    sfx.musicVolume = current.musicVolume;
    sfx.applyVolumes();
    for (const l of listeners) l();
  },
};
settings.update({});
