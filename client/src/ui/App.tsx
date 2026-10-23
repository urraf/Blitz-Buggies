import { lazy, Suspense, useEffect } from "react";
import { sfx } from "../audio/sfx.ts";
import { client } from "../game/client.ts";
import { useUi } from "../game/useStore.ts";
import { ErrorBoundary } from "./ErrorBoundary.tsx";
import { Hud, PauseMenu } from "./Hud.tsx";
import { Lobby } from "./Lobby.tsx";
import { Menu } from "./Menu.tsx";
import { Results } from "./Results.tsx";

// three.js + the game scene are split into their own chunk so the menu appears instantly
const GameScene = lazy(() => import("../scene/GameScene.tsx"));

export function App() {
  const screen = useUi((s) => s.screen);
  const paused = useUi((s) => s.paused);
  const status = useUi((s) => s.status);
  const mode = useUi((s) => s.mode);
  const dead = useUi((s) => s.screen === "game" && !s.hud.alive && s.hud.countdown <= 0 && !s.hud.loading);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape" && client.ui.get().screen === "game") client.setPaused(!client.ui.get().paused);
      const em = ["Digit1", "Digit2", "Digit3", "Digit4"].indexOf(e.code);
      if (em >= 0 && client.ui.get().screen === "game" && (e.target as HTMLElement)?.tagName !== "INPUT") client.emote(em);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // background music follows the screen (starts on the first click: browsers block autoplay)
  useEffect(() => { sfx.music(screen === "game" ? "race" : "menu"); }, [screen]);

  const inMatch = screen === "game" || screen === "results";
  return (
    <ErrorBoundary>
    <div className="app">
      {inMatch && (
        <div className={`scene${dead ? " wrecked" : ""}`}>
          <Suspense fallback={<div className="loading-screen"><div className="spinner" /><h2>Warming up engines…</h2></div>}>
            <GameScene />
          </Suspense>
        </div>
      )}
      {screen === "menu" && <Menu />}
      {screen === "lobby" && <Lobby />}
      {screen === "game" && <Hud />}
      {screen === "game" && paused && <PauseMenu />}
      {screen === "results" && <Results />}
      {mode === "online" && status === "reconnecting" && screen !== "menu" && <div className="net-banner">Connection lost, reconnecting…</div>}
    </div>
    </ErrorBoundary>
  );
}
