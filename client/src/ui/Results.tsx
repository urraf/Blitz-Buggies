import { useEffect, useState } from "react";
import { kartById, paintColor, SLOT_COLORS } from "../../../shared/src/index.ts";
import { client } from "../game/client.ts";
import { useUi } from "../game/useStore.ts";
import { Button, useFit } from "./common.tsx";

export function Results() {
  const rows = useUi((s) => s.results) ?? [];
  const you = useUi((s) => s.you);
  const room = useUi((s) => s.room);
  const roster = useUi((s) => s.roster);
  const at = useUi((s) => s.resultsAt);
  const reward = useUi((s) => s.reward);
  const next = useUi((s) => s.resultsNext);
  const [now, setNow] = useState(performance.now());
  const [celebrate, setCelebrate] = useState(false);
  const fit = useFit(1000, 680);
  useEffect(() => { if (reward?.levelUp) { const t = setTimeout(() => setCelebrate(true), 900); return () => clearTimeout(t); } }, [reward]);
  useEffect(() => { const t = setInterval(() => setNow(performance.now()), 250); return () => clearInterval(t); }, []);

  const rank = rows.findIndex((r) => r.id === you) + 1;
  const left = Math.max(0, Math.ceil(next - (now - at) / 1000));
  const humans = room?.players.filter((p) => !p.bot && p.connected) ?? [];
  const votes = humans.filter((p) => p.rematch).length;
  const voted = !!room?.players.find((p) => p.id === you)?.rematch;
  const color = (id: number) => { const r = roster.get(id); const row = rows.find((x) => x.id === id); return r ? r.color : row?.look ? paintColor(row.look) : SLOT_COLORS[id % SLOT_COLORS.length]; };
  const podium = [rows[1], rows[0], rows[2]];

  return (
    <div className="results" style={fit}>
      <div className={`results-title${rank === 1 ? " win" : ""}`}>{rank === 1 ? "VICTORY!" : rank > 0 ? `${rank}${["st", "nd", "rd"][rank - 1] ?? "th"} PLACE` : "ROUND OVER"}</div>
      <div className="podium">
        {podium.map((r, i) => r && (
          <div key={r.id} className={`podium-col p${i}`}>
            <div className="podium-name" style={{ color: color(r.id) }}>{r.name}</div>
            <div className="podium-kart">{kartById(r.kart).name}</div>
            <div className="podium-block" style={{ background: color(r.id) }}><b>{i === 1 ? 1 : i === 0 ? 2 : 3}</b><span>{r.score} pts</span></div>
          </div>
        ))}
      </div>
      {reward && (
        <div className="reward-row">
          <div className="reward"><b>+{reward.xp}</b><span>XP</span></div>
          <div className="reward coins"><b>+{reward.coins}</b><span>coins</span></div>
          {reward.levelUp && <div className="reward level"><b>LEVEL {reward.newLevel}!</b><span>{reward.unlocked.length ? `Unlocked ${reward.unlocked.join(", ")}` : "Level up!"}</span></div>}
          {reward.missions.map((m) => <div key={m.id} className="reward mission"><b>✔ {m.text}</b><span>+{m.coins} coins · +{m.xp} XP</span></div>)}
        </div>
      )}
      {celebrate && reward && (
        <div className="levelup" onClick={() => setCelebrate(false)}>
          <div className="confetti" aria-hidden>{Array.from({ length: 40 }, (_, i) => <i key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 10) * 0.12}s`, background: ["#ff5d5d", "#ffd23f", "#4fd67a", "#3fa7ff", "#c77dff"][i % 5] }} />)}</div>
          <div className="levelup-card">
            <div className="lu-small">LEVEL UP!</div>
            <div className="lu-badge"><span>{reward.newLevel}</span></div>
            {reward.unlocked.length > 0 ? <div className="lu-unlock">New driver unlocked: <b>{reward.unlocked.join(", ")}</b></div> : <div className="lu-unlock">Keep smashing to unlock more!</div>}
            <Button big onClick={() => setCelebrate(false)}>Awesome!</Button>
          </div>
        </div>
      )}
      <table className="results-table">
        <thead><tr><th>#</th><th>Driver</th><th>Kart</th><th>Points</th><th>Wrecks</th><th>Deaths</th><th>Best streak</th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} className={r.id === you ? "you" : ""}>
              <td>{i + 1}</td>
              <td><span className="dot" style={{ background: color(r.id) }} /> {r.name}{r.bot && <span className="chip">Bot</span>}</td>
              <td>{kartById(r.kart).name}</td><td><b>{r.score}</b></td><td>{r.kills}</td><td>{r.deaths}</td><td>{r.bestStreak}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="results-foot">
        <Button variant="ghost" onClick={() => client.leave()}>Main Menu</Button>
        <div className="autostart">{room?.isPrivate ? `Back to lobby in ${left}s` : `Next round in ${left}s`}</div>
        <Button big onClick={() => client.rematch()} disabled={voted}>{voted ? `Ready! (${votes}/${humans.length})` : `Rematch${humans.length > 1 ? ` (${votes}/${humans.length})` : ""}`}</Button>
      </div>
    </div>
  );
}
