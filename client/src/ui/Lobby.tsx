import { useState } from "react";
import { getArena, kartById, MAX_PLAYERS, paintColor } from "../../../shared/src/index.ts";
import { client } from "../game/client.ts";
import { useSettings, useUi } from "../game/useStore.ts";
import { Button, useFit } from "./common.tsx";
import { Customize } from "./Customize.tsx";
import { RoomSettingsForm } from "./Menu.tsx";

export function Lobby() {
  const room = useUi((s) => s.room);
  const you = useUi((s) => s.you);
  const mode = useUi((s) => s.mode);
  const s = useSettings();
  const [copied, setCopied] = useState(false);
  const [kartOpen, setKartOpen] = useState(false);
  const fit = useFit(1180, 680);
  if (!room) return <div className="center-screen"><div className="spinner" /><p>Connecting…</p></div>;
  const me = room.players.find((p) => p.id === you);
  const host = !!me?.host;
  const humans = room.players.filter((p) => !p.bot);
  const arena = getArena(room.settings.arena);

  const copy = () => {
    navigator.clipboard?.writeText(room.code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }, () => {});
  };

  return (
    <div className="lobby" style={fit}>
      <div className="lobby-head">
        <div>
          <div className="eyebrow">{room.isPrivate ? (mode === "local" ? "Solo session" : "Private room") : "Quick match"}</div>
          <h1>{arena.name}</h1>
        </div>
        {room.isPrivate && mode === "online" && (
          <button className="room-code" onClick={copy} title="Copy room code">
            <span>Room code</span><b>{room.code}</b><small>{copied ? "Copied!" : "Click to copy"}</small>
          </button>
        )}
      </div>

      <div className="lobby-body">
        <div className="panel">
          <h3>Drivers <span className="muted">{humans.length}/{MAX_PLAYERS}</span></h3>
          <div className="player-list">
            {room.players.map((p) => (
              <div key={p.id} className={`player-row${p.id === you ? " you" : ""}${p.connected ? "" : " away"}`}>
                <span className="dot" style={{ background: paintColor(p.look) }} />
                <span className="pname">{p.name}{p.id === you && " (you)"}</span>
                <span className="pkart">{kartById(p.kart).name}</span>
                {p.host && <span className="chip gold">Host</span>}
                {p.bot && <span className="chip">Bot</span>}
                {!p.connected && <span className="chip red">Reconnecting</span>}
              </div>
            ))}
            {room.settings.botFill > room.players.length && <div className="player-row ghost">+ {room.settings.botFill - room.players.length} bots will join at start</div>}
          </div>
          <div className="row">
            <Button variant="secondary" onClick={() => setKartOpen(true)}>🎨 Customize ({kartById(s.kart).name})</Button>
          </div>
        </div>

        <div className="panel grow">
          <h3>Match settings {!host && <span className="muted">(host controls)</span>}</h3>
          <RoomSettingsForm cfg={room.settings} disabled={!host || !room.isPrivate} onChange={(p) => client.updateRoomSettings(p)} />
        </div>
      </div>

      <div className="lobby-foot">
        <Button variant="ghost" onClick={() => client.leave()}>Leave</Button>
        {room.autoStart >= 0 ? (
          <div className="autostart">Starting in <b>{room.autoStart}</b>…</div>
        ) : host ? (
          <Button big onClick={() => client.startMatch()}>Start Match</Button>
        ) : (
          <div className="autostart">Waiting for the host to start…</div>
        )}
      </div>

      {kartOpen && <Customize onClose={() => setKartOpen(false)} />}
    </div>
  );
}
