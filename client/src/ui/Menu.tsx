import { lazy, Suspense, useEffect, useState } from "react";
import { ARENA_DEFS, kartById, parseLook, DRIVERS, randomName, type RoomSettings } from "../../../shared/src/index.ts";
import { sfx } from "../audio/sfx.ts";
import { client } from "../game/client.ts";
import { progress, xpForLevel } from "../game/progress.ts";
import { settings } from "../game/settings.ts";
import { useProgress, useSettings, useUi } from "../game/useStore.ts";
import { ArenaPicker, Button, Controls, Modal, Segmented, SettingsPanel, useFit } from "./common.tsx";
import { Customize } from "./Customize.tsx";

const KartPreview = lazy(() => import("../scene/KartPreview.tsx"));

type Dialog = null | "solo" | "create" | "join" | "settings" | "help" | "customize";


const NEWS = [
  { tag: "NEW", title: "Lava Pit & Skate Park", body: "Two new arenas! Jump the lava river or catch big air off the quarter-pipes." },
  { tag: "NEW", title: "Triple Hornets & Big Cannon", body: "Three homing missiles at once, or one huge cannonball. Both wreck in one hit." },
  { tag: "TIP", title: "Weapons on your kart", body: "Your current weapon shows on your kart. Keep an eye on rivals' pods!" },
  { tag: "TIP", title: "Level up", body: "Every match earns XP and coins. New drivers unlock at levels 2, 3, 5 and 7." },
  { tag: "TIP", title: "Lava = instant wreck", body: "Knock rivals into the lava to steal the point." },
];

export function Menu() {
  const s = useSettings();
  const p = useProgress();
  const error = useUi((u) => u.error);
  const status = useUi((u) => u.status);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);
  const [newsTab, setNewsTab] = useState<"news" | "tips">("news");
  const [daily, setDaily] = useState<number | null>(null);
  const kart = kartById(s.kart);
  const look = parseLook(s.look);
  const driverName = DRIVERS.find((d) => d.id === look.driver)?.name ?? "";
  const need = xpForLevel(p.level);
  const next = progress.nextUnlock();
  const missions = progress.missions();

  // free hosting sleeps when nobody plays; after a few seconds of waiting, explain and offer bots instead
  const waiting = status === "connecting" || status === "reconnecting";
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!waiting) { setSlow(false); return; }
    const t = setTimeout(() => setSlow(true), 3000);
    return () => clearTimeout(t);
  }, [waiting]);

  const fit = useFit(1180, 680);

  const quick = () => { setBusy(true); client.quickPlay(); setTimeout(() => setBusy(false), 4000); };
  const claim = () => { const amt = progress.claimDaily(); if (amt) { sfx.unlock(); sfx.coins(); setDaily(amt); setTimeout(() => setDaily(null), 2500); } };
  const fullscreen = () => { const d = document.documentElement; if (document.fullscreenElement) void document.exitFullscreen(); else void d.requestFullscreen?.(); };

  return (
    <div className="home" style={fit}>
      <div className="menu-bg" aria-hidden>
        <div className="checker" />
        {Array.from({ length: 10 }, (_, i) => <span key={i} className={`cloud c${i % 3}`} style={{ top: `${8 + ((i * 23) % 70)}%`, animationDelay: `${-i * 7}s` }} />)}
      </div>

      <header className="home-top">
        <div className="level-pill" title={`${p.xp} / ${need} XP`}>
          <div className="level-badge"><span>{p.level}</span></div>
          <div className="xp-track"><div style={{ width: `${Math.min(100, (p.xp / need) * 100)}%` }} /><span>{p.xp} / {need} XP</span></div>
        </div>
        {next && <div className="next-unlock">Next: <b>{next.name}</b> at Lv {next.level}</div>}
        <div className="coin-pill"><span className="coin">●</span>{p.coins}</div>
        <div className="spacer" />
        <button className="pill-btn" onClick={() => { sfx.unlock(); sfx.open(); setDialog("customize"); }}>🎨 Customize</button>
      </header>

      <aside className="home-left">
        <div className="card player-card">
          <label className="name-field">
            <span>Driver name</span>
            <div className="name-row">
              <input maxLength={16} placeholder="Racer" value={s.name} onChange={(e) => settings.update({ name: e.target.value })} />
              <button className="dice" title="Random fun name" onClick={() => { sfx.unlock(); sfx.click(); settings.update({ name: randomName() }); }}>🎲</button>
            </div>
          </label>
          <div className="stat-row"><div><b>{p.matches}</b><span>Matches</span></div><div><b>{p.wins}</b><span>Wins</span></div><div><b>{p.kills}</b><span>Wrecks</span></div></div>
        </div>
        <div className="card news-card">
          <div className="tabs">
            <button className={newsTab === "news" ? "on" : ""} onClick={() => setNewsTab("news")}>News</button>
            <button className={newsTab === "tips" ? "on" : ""} onClick={() => setNewsTab("tips")}>Tips</button>
          </div>
          <div className="news-list">
            {NEWS.filter((n) => (newsTab === "news" ? n.tag === "NEW" : n.tag === "TIP")).map((n) => (
              <div key={n.title} className="news-item"><span className={`tag ${n.tag.toLowerCase()}`}>{n.tag}</span><b>{n.title}</b><p>{n.body}</p></div>
            ))}
          </div>
        </div>
      </aside>

      <main className="home-center">
        <h1 className="logo"><span>BLITZ</span><span>BUGGIES</span></h1>
        <div className="showcase">
          <Suspense fallback={<div className="preview-fallback" />}>
            <KartPreview kart={kart.id} look={s.look} />
          </Suspense>
          <div className="showcase-label"><b>{driverName}</b><span>in the {kart.name}</span></div>
        </div>
        <div className="play-row">
          <button className="play-btn" disabled={busy} onClick={() => { sfx.unlock(); sfx.confirm(); quick(); }}>
            <span className="play-ico">▶</span>{busy ? "FINDING…" : "PLAY"}
          </button>
        </div>
        <div className="sub-row">
          <Button variant="secondary" onClick={() => setDialog("create")}>Create</Button>
          <Button variant="secondary" onClick={() => setDialog("join")}>Join</Button>
        </div>
        {error && <div className="error">{error}</div>}
        {slow && (
          <div className="error waking">
            <div>⏳ Waking up the game server… This can take up to a minute when nobody has played for a while.</div>
            <Button variant="secondary" onClick={() => client.startSolo({})}>Play vs bots now</Button>
          </div>
        )}
      </main>

      <aside className="home-right">
        <div className="card missions-card">
          <div className="card-title">🎯 Daily Missions</div>
          {missions.map((m) => (
            <div key={m.id} className={`mission${m.done ? " done" : ""}`}>
              <div className="m-text">{m.done ? "✔ " : ""}{m.text}</div>
              <div className="m-bar"><div style={{ width: `${(m.progress / m.goal) * 100}%` }} /><span>{m.progress}/{m.goal}</span></div>
              <div className="m-reward">● {m.coins}</div>
            </div>
          ))}
        </div>
        <div className="card daily-card">
          <div className="card-title">🎁 Daily Reward</div>
          {daily ? <div className="daily-claimed">+{daily} coins!</div> : progress.dailyAvailable()
            ? <Button onClick={claim}>Claim</Button>
            : <div className="muted small">Come back tomorrow for more coins</div>}
        </div>
        <div className="card solo-card" onClick={() => { sfx.unlock(); sfx.open(); setDialog("solo"); }}>
          <div className="card-title">🤖 Solo vs Bots</div>
          <p className="small">Practice offline against bots on any arena.</p>
          <Button variant="primary">Start Solo</Button>
        </div>

      </aside>

      <footer className="home-bottom">
        <span className="version">Blitz Buggies 2.0 · sounds by Kenney (CC0)</span>
        <div className="spacer" />
        <button className="round-btn" aria-label="Settings" onClick={() => { sfx.unlock(); sfx.open(); setDialog("settings"); }}>⚙</button>
        <button className="round-btn" aria-label="How to play" onClick={() => { sfx.unlock(); sfx.open(); setDialog("help"); }}>?</button>
        <button className="round-btn" aria-label="Fullscreen" onClick={fullscreen}>⛶</button>
        <button className="round-btn" aria-label="Sound" onClick={() => { sfx.unlock(); settings.update({ volume: s.volume > 0 ? 0 : 0.7 }); }}>{s.volume > 0 ? "♪" : "✕"}</button>
      </footer>

      {dialog === "solo" && <MatchSetup title="Solo vs Bots" cta="Start" onClose={() => setDialog(null)} onGo={(cfg) => { setDialog(null); client.startSolo(cfg); }} />}
      {dialog === "create" && <MatchSetup title="Create Private Room" cta="Create Room" onClose={() => setDialog(null)} onGo={(cfg) => { setDialog(null); client.createRoom(cfg); }} />}
      {dialog === "join" && <JoinDialog onClose={() => setDialog(null)} />}
      {dialog === "settings" && <Modal title="Settings" onClose={() => setDialog(null)}><SettingsPanel /></Modal>}
      {dialog === "help" && <Modal title="How to Play" onClose={() => setDialog(null)} wide><Controls /></Modal>}
      {dialog === "customize" && <Customize onClose={() => setDialog(null)} />}
    </div>
  );
}

export function MatchSetup({ title, cta, onGo, onClose }: { title: string; cta: string; onGo: (s: Partial<RoomSettings>) => void; onClose: () => void }) {
  const [cfg, setCfg] = useState<RoomSettings>({ arena: ARENA_DEFS[0].id, botFill: 8, botSkill: 1, seconds: 180 });
  return (
    <Modal title={title} onClose={onClose} wide>
      <RoomSettingsForm cfg={cfg} onChange={(p) => setCfg({ ...cfg, ...p })} />
      <div className="modal-actions">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={() => onGo(cfg)}>{cta}</Button>
      </div>
    </Modal>
  );
}

export function RoomSettingsForm({ cfg, onChange, disabled }: { cfg: RoomSettings; onChange: (p: Partial<RoomSettings>) => void; disabled?: boolean }) {
  return (
    <div className="room-form">
      <h3>Arena</h3>
      <ArenaPicker value={cfg.arena} onChange={(arena) => onChange({ arena })} disabled={disabled} />
      <div className="form-row">
        <div className="field"><span>Karts (bots fill)</span>
          <Segmented disabled={disabled} value={cfg.botFill} onChange={(botFill) => onChange({ botFill })} options={[2, 4, 6, 8].map((v) => ({ v, label: String(v) }))} />
        </div>
        <div className="field"><span>Bot skill</span>
          <Segmented disabled={disabled} value={cfg.botSkill} onChange={(botSkill) => onChange({ botSkill })} options={[{ v: 0, label: "Rookie" }, { v: 1, label: "Pro" }, { v: 2, label: "Ace" }] as { v: 0 | 1 | 2; label: string }[]} />
        </div>
        <div className="field"><span>Round length</span>
          <Segmented disabled={disabled} value={cfg.seconds} onChange={(seconds) => onChange({ seconds })} options={[60, 120, 180, 300].map((v) => ({ v, label: `${v / 60}m` }))} />
        </div>
      </div>
    </div>
  );
}

function JoinDialog({ onClose }: { onClose: () => void }) {
  const [code, setCode] = useState("");
  const go = () => { if (code.trim().length >= 4) { client.joinRoom(code); onClose(); } };
  return (
    <Modal title="Join a Room" onClose={onClose}>
      <p className="hint">Ask the host for the 5-letter room code.</p>
      <input className="code-input" autoFocus maxLength={5} value={code} placeholder="ABCDE" onChange={(e) => setCode(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === "Enter" && go()} />
      <div className="modal-actions">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={go} disabled={code.trim().length < 4}>Join</Button>
      </div>
    </Modal>
  );
}
