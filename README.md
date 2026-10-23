# Blitz Buggies

An original, browser-based multiplayer **kart-battle arena game**: drive, drift, grab item crates
and wreck the other karts before the clock runs out.

- React 19, TypeScript and Three.js (React Three Fiber) on the client.
- Node.js WebSocket server running an authoritative 60 Hz simulation.
- Solo mode against bots works fully offline.

- **Content:** 5 arenas, 7 weapons + 3 power-ups, 8 unlockable cartoon drivers, hats and paints,
  levels, coins and a daily reward.
- **Look and sound:** bright toy-style graphics with bloom, and CC0 sound effects with original
  procedural music.
- **Big moments:** stamps, combos, kill confetti, karts that burst apart, and a killer card when
  you're wrecked.
- **Goals:** daily missions, level-up celebrations, and new-player hints.
- **Kid-safe:** emotes instead of chat, a name filter, and no real-money purchases.
- **Production-ready:** compressed assets, installable as an app, Docker image, graceful restarts,
  and a crash-recovery screen.

All models, textures, maps, names and UI are procedurally generated or original. Sound effects are
CC0 (public domain) samples by Kenney, credited in `client/public/sfx/CREDITS.txt`. No assets from
any other game are used.

## Quick start

Requires **Node.js 23.6 or newer** (the server and tests run TypeScript directly). Node 26 was used
for development.

```bash
npm install
npm run build      # builds client (Vite) + server (esbuild)
npm start          # http://localhost:3000
```

Open **http://localhost:3000**. To play multiplayer, open a second browser window (or another
machine on your LAN using `http://<your-ip>:3000`).

Development with hot reload:

```bash
npm run dev        # game server on :3000 (auto-restart) + Vite on http://localhost:5173
```

Set `PORT=4000 npm start` to change the port.

## Ways to play

| Mode | What happens |
|---|---|
| **Play Online** | Quick match: joins an open public room (or creates one). It starts after 6 s, bots fill the empty slots, and arenas rotate every round. |
| **Solo vs Bots** | Runs the same game rules in your browser, with no server needed. Pause actually pauses. |
| **Create Room / Join Code** | A private room with a 5-letter code. The host picks the arena, kart count, bot skill and round length. |

## Controls

| Input | Action |
|---|---|
| W / ↑ | Accelerate |
| S / ↓ | Brake / reverse |
| A D / ← → | Steer (turn hard at speed to slide) |
| Space | Fire your item |
| Shift | Optional hop-drift with a turbo on release |
| Esc | Pause / settings |
| Touch (tablets/phones) | Drag on the left half to drive, FIRE / DRIFT buttons on the right |
| Gamepad | RT accelerate · LT brake · RB fire · LB drift |

The game is also reachable from other devices on your Wi-Fi: the server prints
`on your network: http://<ip>:3000` at startup.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Dev servers (game server + Vite) |
| `npm run build` | Production build |
| `npm start` | Serve the built game plus the WebSocket server |
| `npm test` | Physics, arena, full-match, room-lifecycle and real-WebSocket multiplayer tests |
| `npm run typecheck` | Strict TypeScript across shared, server and client |

## Documentation

- [GAMEPLAY.md](GAMEPLAY.md): karts, weapons, power-ups, arenas, scoring.
- [ARCHITECTURE.md](ARCHITECTURE.md): code layout, simulation, rendering, performance.
- [NETWORKING.md](NETWORKING.md): authoritative server, prediction, interpolation, protocol, bandwidth.
- [DEVELOPMENT.md](DEVELOPMENT.md): setup, testing, debugging hooks, how to add content, deploying.

## Originality

All code, models, characters, names and maps are original. Sound effects are CC0 samples by Kenney
(see `client/public/sfx/CREDITS.txt`) and the fonts are under the SIL Open Font License
(`client/public/licenses/`). Gameplay uses common arena kart-battle genre mechanics.
