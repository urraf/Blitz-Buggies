import { lazy, Suspense, useState } from "react";
import { DRIVERS, HATS, KARTS, lookString, PAINTS, parseLook } from "../../../shared/src/index.ts";
import { sfx } from "../audio/sfx.ts";
import { client } from "../game/client.ts";
import { progress } from "../game/progress.ts";
import { useProgress, useSettings } from "../game/useStore.ts";
import { KartPicker } from "./common.tsx";

const KartPreview = lazy(() => import("../scene/KartPreview.tsx"));

const DRIVER_EMOJI: Record<string, string> = { bunny: "🐰", bear: "🐻", fox: "🦊", frog: "🐸", cat: "🐱", panda: "🐼", penguin: "🐧", duck: "🐤" };
const HAT_EMOJI: Record<string, string> = { none: "🚫", cap: "🧢", beanie: "🧶", party: "🥳", cowboy: "🤠", helmet: "⛑️", tophat: "🎩", crown: "👑" };

type Tab = "driver" | "kart" | "paint" | "hat";

/** Garage: pick driver, kart body, paint and hat. Locked items show their level / price. */
export function Customize({ onClose }: { onClose: () => void }) {
  const s = useSettings();
  const p = useProgress();
  const [tab, setTab] = useState<Tab>("driver");
  const look = parseLook(s.look);
  const set = (patch: Partial<typeof look>) => { sfx.click(); client.setLook(lookString({ ...look, ...patch })); };

  return (
    <div className="garage" role="dialog" aria-label="Customize">
      <div className="garage-preview">
        <Suspense fallback={<div className="preview-fallback" />}>
          <KartPreview kart={s.kart} look={s.look} />
        </Suspense>
      </div>
      <div className="garage-panel">
        <div className="garage-head">
          <h2>Customize</h2>
          <div className="coin-pill"><span className="coin">●</span>{p.coins}</div>
          <button className="icon-btn" aria-label="Close" onClick={() => { sfx.back(); onClose(); }}>✕</button>
        </div>
        <div className="tabs big">
          {(["driver", "kart", "paint", "hat"] as Tab[]).map((t) => <button key={t} className={tab === t ? "on" : ""} onClick={() => { sfx.click(); setTab(t); }}>{t === "driver" ? "Driver" : t === "kart" ? "Kart" : t === "paint" ? "Paint" : "Hat"}</button>)}
        </div>

        {tab === "driver" && (
          <div className="item-grid">
            {DRIVERS.map((d) => {
              const unlocked = progress.driverUnlocked(d.id);
              return (
                <button key={d.id} className={`grid-item${look.driver === d.id ? " selected" : ""}${unlocked ? "" : " locked"}`} disabled={!unlocked} onClick={() => set({ driver: d.id })}>
                  <span className="emoji">{DRIVER_EMOJI[d.id]}</span><b>{d.name}</b>
                  {!unlocked && <span className="lock">🔒 Level {d.unlockLevel}</span>}
                </button>
              );
            })}
          </div>
        )}
        {tab === "kart" && <KartPicker value={s.kart} onChange={(k) => { client.setKart(k); }} columns={2} />}
        {tab === "paint" && (
          <div className="item-grid paints">
            {PAINTS.map((c, i) => {
              const unlocked = progress.paintUnlocked(i);
              return (
                <button key={i} className={`grid-item paint${look.paint === i ? " selected" : ""}${unlocked ? "" : " locked"}`} disabled={!unlocked} onClick={() => set({ paint: i })}>
                  <span className="swatch" style={{ background: c.color }} />
                  {!unlocked && <span className="lock">🔒 Lv {c.unlockLevel}</span>}
                </button>
              );
            })}
          </div>
        )}
        {tab === "hat" && (
          <div className="item-grid">
            {HATS.map((h) => {
              const owned = progress.hatOwned(h.id);
              const afford = p.coins >= h.cost;
              return (
                <button key={h.id} className={`grid-item${look.hat === h.id ? " selected" : ""}${owned ? "" : " locked"}`}
                  onClick={() => {
                    if (owned) set({ hat: h.id });
                    else if (progress.buyHat(h.id)) { sfx.coins(); client.setLook(lookString({ ...look, hat: h.id })); }
                    else sfx.back();
                  }}>
                  <span className="emoji">{HAT_EMOJI[h.id]}</span><b>{h.name}</b>
                  {!owned && <span className={`price${afford ? "" : " poor"}`}>● {h.cost}</span>}
                </button>
              );
            })}
          </div>
        )}
        <p className="hint">Level {p.level}. Play matches to earn XP and coins. More drivers and paints unlock as you level up.</p>
      </div>
    </div>
  );
}

export const KART_COUNT = KARTS.length;
