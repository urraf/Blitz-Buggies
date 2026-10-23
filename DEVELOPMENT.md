# Development

## Setup

```bash
npm install
npm run dev          # server on :3000 (node --watch) + Vite on :5173 (proxies /ws to :3000)
```

- Node **23.6+** is required, because `server/src/*.ts`, `shared/src/*.ts` and the tests run with
  Node's built-in TypeScript type-stripping.
- Every TypeScript config sets `erasableSyntaxOnly`. Don't use enums, namespaces or constructor
  parameter properties; use `as const` objects and plain fields instead.
- Imports use explicit `.ts` extensions so the same files run in Node and bundle in Vite.

## Build and run

```bash
npm run build        # client → client/dist (Vite), server → server/dist/index.js (esbuild bundle)
npm start            # serves client/dist and the WebSocket endpoint /ws on PORT (default 3000)
```

`GET /health` returns `{ ok, rooms, players }`.

## Tests

```bash
npm test             # all suites (about 15 s; the network suite starts its own server on :3999)
npm run typecheck    # strict tsc for shared, server and client
```

| Suite | Covers |
|---|---|
| `tests/sim.test.ts` | acceleration and top speed, steering direction, reverse, drift turbo, ramp climb and jump launch, wall containment, spawn validity and clear lanes, full 6-bot matches on every arena (kills, hits, pickups, respawns, all weapons used, score = kills) |
| `tests/room.test.ts` | host start, bot fill, input pipeline and ack, snapshot rate, results, rematch votes, quick autostart, drop-in replacing a bot, arena rotation, disconnect → bot takeover → reconnect, grace-period removal, host migration, input sanitising, reload-reconnect sequence reset |
| `tests/net.test.ts` | real WebSocket clients against a real server: private room create/join, inputs move the kart as seen by the other client, 20 Hz snapshot rate, bandwidth, disconnect + token reconnect, quick-play pairing, bad room code |

## Browser debugging hooks

The hooks exist in dev builds (`npm run dev`), or in any build when the URL ends with `?debug`.
Production players don't get them, because portals reject shipped debug code. Open the devtools
console while playing:

| Hook | Use |
|---|---|
| `__bb.debugState()` | screen, prediction state, pending inputs, snapshot buffer, HUD values |
| `__bb.setAutopilot(true)` | solo only: a server-side bot drives your kart (useful for watching pickups and weapons) |
| `__bb.debugGive(itemId)` | solo only: put any item in your slot (1 Buzz Gun, 2 Hornet, 3 Lob Bomb, 4 Mine, 8 Rocket, 9 Triple, 10 Cannon) |
| `__bb.simulateDrop()` | online: closes the WebSocket to exercise auto-reconnect |
| `__gl.info.render` | three.js draw calls and triangles for the current frame |

The settings panel can show FPS and ping in the HUD.

To test the tablet UI on a desktop, open Chrome DevTools' device toolbar (pick a tablet with
touch). The HUD switches to the drag stick and FIRE / DRIFT buttons when the page reports a coarse
pointer.

## Adding content

- **New arena:**
  1. Add an `ArenaDef` in `shared/src/arenas.ts` with boxes (`blocks`), wedge `ramps`, boost
     `pads`, `crates`, `nitros`, `spawns` and a colour `theme`. Spawn headings are computed
     automatically.
  2. Run `npm test`: the arena tests check spawns aren't inside geometry and have clear lanes.
- **New kart:** add a `KartStats` entry in `shared/src/karts.ts` and a silhouette branch in
  `client/src/scene/Kart.tsx` (it falls back to the shared driver and exhaust parts).
- **New weapon:**
  1. Add an id in `Item`.
  2. Add a `WeaponDef` and a crate weight in `shared/src/items.ts`.
  3. Add fire logic in `Match.handleFire` and projectile behaviour in `Match.stepProjectiles`.
  4. Add an instanced mesh in `client/src/scene/Entities.tsx`, an icon in `client/src/ui/common.tsx`
     and an SFX in `client/src/audio/sfx.ts`.
  5. Add a firing rule in `BotBrain.think`.

## Deploying

- **Docker:**
  ```bash
  docker build -t blitz-buggies .
  docker run -p 3000:3000 blitz-buggies
  ```
  The image runs as a non-root user, has a built-in healthcheck, and shuts down cleanly on
  SIGTERM: players are told the server is restarting and reconnect automatically.
- **What the server does:**
  - serves Brotli/gzip-compressed assets (three.js drops from 696 KB to 159 KB) with immutable
    caching for hashed files;
  - sets `nosniff` and `Referrer-Policy` headers;
  - doesn't block iframes, so the game can be embedded on web game portals.
- **Installable:** `manifest.webmanifest` plus app icons let players add the game to their home
  screen. Share tags (Open Graph) give links a title, description and image.
- **Single process:** `npm run build && PORT=8080 npm start`. Put it behind any HTTPS reverse proxy
  that forwards WebSocket upgrades for `/ws`; the client automatically uses `wss://` on HTTPS pages.
- **Room state:** kept in memory, so restarting the server ends running matches. Clients detect
  this and return to the menu with a message.

## Deploying for free

The client and the server can live in different places. Online play needs the Node server
running somewhere public over HTTPS. Solo vs bots works with no server at all.

- **Server on Render (free):** push this folder to a GitHub repo, then in Render choose
  **New → Blueprint** and pick the repo. `render.yaml` creates one free Docker web service, so the
  whole game is live at `https://<name>.onrender.com`.
  - **Sleep:** free services sleep after 15 minutes with no traffic and take up to a minute to
    wake. Portal builds ping `/health` on page load to start the wake-up early. If the server is
    still waking when the player presses PLAY, the home screen explains the wait and offers
    **Play vs bots now**.
  - **Cost of a match:** about 0.01 ms of CPU per server tick for a 6-kart match, and about
    8 KB/s of traffic per online player.
- **Portals and static hosts** (Poki, CrazyGames, itch.io, GitHub Pages, ...): they host the client
  files. Build a zip that connects to your server:
  ```bash
  npm run package:portal -- https://<name>.onrender.com
  ```
  This writes `release/blitz-buggies-web.zip` and leaves `client/dist` alone. Add `--poki` to get
  `release/blitz-buggies-poki.zip` with the Poki SDK built in (see `client/src/game/portal.ts`):
  - **Gameplay events:** `gameplayStart` fires on the first input of a match or after unpausing.
    `gameplayStop` fires on pause, results and leaving.
  - **Ads:** a `commercialBreak` is offered before Play, Solo, Create, Join and Rematch. While an ad
    plays, audio is muted, input is off and solo games pause.
  - **Ad blockers:** if the SDK is blocked, the game plays on without ads.

  The build:
  - uses relative paths, so it works from a portal's sub-folder;
  - bundles its fonts and makes no third-party requests;
  - fits small 16:9 frames (640×360 and up) by scaling the menus;
  - includes the privacy policy (`client/public/privacy.html`). It opens from the home footer and is
    also served at `/privacy.html` on the game server, for the portals' submission forms.
- **Server address in code:** `VITE_SERVER_URL` sets the server at build time. When it isn't set,
  the client uses the page's own origin, which is how the Docker image and `npm start` work.
