import { useEffect, useRef, useState } from "react";
import { DRIVERS, EMOTES, getArena, Item, itemName, kartById, parseLook, POWERS } from "../../../shared/src/index.ts";
import { client } from "../game/client.ts";
import { settings } from "../game/settings.ts";
import { useSettings, useUi } from "../game/useStore.ts";
import { Button, Controls, ItemIcon, Modal, SettingsPanel } from "./common.tsx";
import { isTouchDevice, TouchControls } from "./Touch.tsx";

const DRIVER_EMOJI: Record<string, string> = { bunny: "🐰", bear: "🐻", fox: "🦊", frog: "🐸", cat: "🐱", panda: "🐼", penguin: "🐧", duck: "🐤" };

const fmtTime = (t: number) => {
  const s = Math.max(0, Math.ceil(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th"}`;

const TIPS = [
  "Drive through ? boxes to grab a random item. Space fires it.",
  "Boom Rockets and Lob Bombs wreck a kart in one hit. Dodge!",
  "Spike Mines drop behind you, perfect for anyone tailgating.",
  "Homing Hornets chase the kart in front of you.",
  "Bubble Shield blocks everything, and ramming deals damage!",
  "Turn hard at speed to slide through corners.",
];

export function Hud() {
  const hud = useUi((s) => s.hud);
  const scores = useUi((s) => s.scores);
  const feed = useUi((s) => s.feed);
  const banner = useUi((s) => s.banner);
  const toast = useUi((s) => s.toast);
  const paused = useUi((s) => s.paused);
  const arena = useUi((s) => s.arena);
  const { showStats, volume, tutorialSeen } = useSettings();
  const [tip] = useState(() => TIPS[Math.floor(Math.random() * TIPS.length)]);
  const [touch] = useState(isTouchDevice);

  const [hurtFx, setHurtFx] = useState(false);
  const [hitFx, setHitFx] = useState(false);
  const lastHurt = useRef(hud.hurt);
  const lastHit = useRef(hud.hitmark);
  useEffect(() => {
    if (hud.hurt !== lastHurt.current) { lastHurt.current = hud.hurt; setHurtFx(true); const t = setTimeout(() => setHurtFx(false), 260); return () => clearTimeout(t); }
  }, [hud.hurt]);
  useEffect(() => {
    if (hud.hitmark !== lastHit.current) { lastHit.current = hud.hitmark; setHitFx(true); const t = setTimeout(() => setHitFx(false), 160); return () => clearTimeout(t); }
  }, [hud.hitmark]);

  if (hud.loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <h2>Loading {getArena(arena).name}…</h2>
        <p className="tip">{tip}</p>
      </div>
    );
  }

  const hpFrac = Math.max(0, hud.hp / hud.maxHp);
  const top = scores.slice(0, 3);
  const meRow = scores.find((r) => r.you);
  const showMe = meRow && !top.includes(meRow);
  const power = hud.shield > 0 ? { id: Item.Shield, t: hud.shield, max: POWERS[Item.Shield]!.seconds } : hud.overdrive > 0 ? { id: Item.Overdrive, t: hud.overdrive, max: POWERS[Item.Overdrive]!.seconds } : null;
  const respawnN = Math.max(1, Math.ceil(hud.respawnIn));

  return (
    <div className={`hud${paused ? " dim" : ""}`}>
      {hurtFx && <div className="hurt-vignette" />}
      {hitFx && <div className="hitmarker">✕</div>}

      <div className="hud-tl">
        <div className="rank-pill"><span className="rank-ico">★</span><b>{ordinal(hud.rank)}</b><span>/ {hud.players}</span></div>
        <div className="hud-board">
          {top.map((r) => (
            <div key={r.id} className={`board-row${r.you ? " you" : ""}`}><span className="dot" style={{ background: r.color }} /><span className="nm">{r.name}</span><b>{r.score}</b></div>
          ))}
          {showMe && meRow && <><div className="board-sep">• • • • •</div><div className="board-row you"><span className="dot" style={{ background: meRow.color }} /><span className="nm">{meRow.name}</span><b>{meRow.score}</b></div></>}
        </div>
      </div>

      <div className="hud-top">
        <div className="hp-pill">
          <span className={`heart${hpFrac < 0.3 ? " low" : ""}`}>♥</span>
          <div className="hp-track"><div style={{ width: `${hpFrac * 100}%` }} /></div>
        </div>
        <div className={`time-pill${hud.timeLeft <= 10 && hud.countdown <= 0 ? " urgent" : ""}`}><span className="clock">◷</span>{fmtTime(hud.timeLeft)}</div>
      </div>

      <div className="hud-tr">
        <button className="round-btn" aria-label="Pause" onClick={() => client.setPaused(true)}>❚❚</button>
        <button className="round-btn" aria-label="Sound" onClick={() => settings.update({ volume: volume > 0 ? 0 : 0.7 })}>{volume > 0 ? "♪" : "✕"}</button>
      </div>

      <div className="killfeed">
        {feed.map((f) => (
          <div key={f.id} className={`feed-row${f.you ? " you" : ""}`}>
            {f.killer && <span style={{ color: f.killerColor }}>{f.killer}</span>}
            <ItemIcon item={f.item} size={20} />
            <span style={{ color: f.victimColor }}>{f.victim}</span>
          </div>
        ))}
      </div>

      {banner && banner.tone === "stamp" ? (
        <div key={banner.id} className="stamp-wrap"><div className="stamp">{banner.text}</div>{banner.sub && <div className="stamp-sub">{banner.sub}</div>}</div>
      ) : banner && <div key={banner.id} className={`banner ${banner.tone}`}><div>{banner.text}</div>{banner.sub && <small>{banner.sub}</small>}</div>}
      {toast && <div key={toast.id} className="toast">{toast.text}</div>}

      {hud.countdown > 0 && <div key={Math.ceil(hud.countdown)} className="countdown">{Math.ceil(hud.countdown)}</div>}
      {tutorialSeen < 3 && !banner && hud.timeLeft > (client.ui.get().room?.settings.seconds ?? 180) - 8 && (
        <div className="tutorial-card">
          <div className="tut-col"><div className="keys"><kbd>W</kbd></div><div className="keys"><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></div><span>Drive</span></div>
          <div className="tut-col"><div className="keys"><kbd className="wide">Space</kbd></div><span>Fire item</span></div>
          <div className="tut-col"><div className="keys"><kbd>↑</kbd></div><div className="keys"><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd></div><span>or arrows</span></div>
          <div className="tut-tip">Grab <b>?</b> boxes for weapons · wreck karts for points</div>
        </div>
      )}

      {!hud.alive && hud.countdown <= 0 && (
        <div className="death">
          <div className="death-title">WRECKED!</div>
          {hud.killerInfo && (
            <div className="killer-card">
              {hud.killerInfo.item === Item.Lava && !hud.killerInfo.name ? (
                <div className="kc-body"><ItemIcon item={Item.Lava} size={54} /><div><b>Too hot!</b><span>You drove into the lava</span></div></div>
              ) : (
                <div className="kc-body">
                  <div className="kc-avatar" style={{ background: hud.killerInfo.color }}>{DRIVER_EMOJI[parseLook(hud.killerInfo.look).driver] ?? "🏎️"}</div>
                  <div className="kc-text">
                    <span className="kc-label">Wrecked by</span>
                    <b style={{ color: hud.killerInfo.color }}>{hud.killerInfo.name}</b>
                    <span>{DRIVERS.find((d) => d.id === parseLook(hud.killerInfo!.look).driver)?.name} · {kartById(hud.killerInfo.kart).name}</span>
                  </div>
                  <div className="kc-weapon"><ItemIcon item={hud.killerInfo.item} size={54} /><span>{itemName(hud.killerInfo.item)}</span></div>
                </div>
              )}
            </div>
          )}
          <div key={respawnN} className="respawn-count">{respawnN}</div>
          <div className="respawn-hint">Get ready to smash back!</div>
        </div>
      )}

      {hud.spawnShield > 0 && hud.alive && hud.countdown <= 0 && <div className="spawn-shield">Spawn shield</div>}
      {tutorialSeen < 3 && hud.item > 0 && !hud.firedThisMatch && hud.alive && <div className="fire-hint">Press <kbd>SPACE</kbd> to fire!</div>}
      {!touch && (
        <div className="emote-bar">
          {EMOTES.map((e, i) => <button key={i} onClick={() => client.emote(i)} title={`Emote (${i + 1})`}><span>{e}</span><small>{i + 1}</small></button>)}
        </div>
      )}

      <button className={`item-btn${hud.item ? " has" : ""}`} aria-label="Fire" onPointerDown={() => { if (touch) return; }}>
        <ItemIcon item={hud.item} size={86} />
        {hud.item ? <span className="ammo">{hud.ammo}</span> : null}
        {hud.item ? <span className="item-name">{itemName(hud.item)}</span> : null}
      </button>
      {power && (
        <div className="power-slot">
          <ItemIcon item={power.id} size={42} />
          <div className="power-ring"><div style={{ width: `${(power.t / power.max) * 100}%` }} /></div>
        </div>
      )}

      {showStats && <div className="stats">{hud.fps} FPS{client.ui.get().mode === "online" ? ` · ${hud.ping} ms` : " · offline"}</div>}
      {touch && !paused && <TouchControls />}
    </div>
  );
}

export function PauseMenu() {
  const mode = useUi((s) => s.mode);
  const [panel, setPanel] = useState<null | "settings" | "help">(null);
  return (
    <div className="pause">
      <div className="pause-card">
        <h2>Paused</h2>
        {mode === "online" && <p className="hint">The match keeps running online, so get back soon!</p>}
        <Button big onClick={() => client.setPaused(false)}>Resume</Button>
        <Button variant="secondary" onClick={() => setPanel("settings")}>Settings</Button>
        <Button variant="secondary" onClick={() => setPanel("help")}>Controls</Button>
        <Button variant="danger" onClick={() => client.leave()}>Leave Match</Button>
      </div>
      {panel === "settings" && <Modal title="Settings" onClose={() => setPanel(null)}><SettingsPanel /></Modal>}
      {panel === "help" && <Modal title="Controls" onClose={() => setPanel(null)} wide><Controls /></Modal>}
    </div>
  );
}
