# Architecture

```
Client (browser)
  ↓
Input (keyboard / gamepad → 7 button bits per tick)
  ↓
Prediction (own kart: shared stepKart() replayed on unacknowledged inputs)
  ↓
Game Simulation view (interpolated remote karts + projectiles, 100 ms behind)
  ↓
Renderer / UI (React Three Fiber scene · React DOM HUD and menus · WebAudio synth)
  ↕
WebSocket (JSON: inputs up at 30 Hz, snapshots down at 20 Hz)
  ↕
Authoritative Server (Node, 60 Hz fixed tick, one Room per lobby)
  ↓
Match State (shared/src/match.ts)
  ↓
Players / Weapons / Pickups / Physics / Bots
```

The key design choice is that **the entire game simulation lives in `shared/`** as plain,
dependency-free TypeScript:

- The **server** runs it authoritatively for online rooms.
- The **client** runs `stepKart()` from it to predict the local kart.
- **Solo mode** runs a whole `Room` inside the browser (`LocalTransport`), with the same code,
  protocol and rules and no server.

## Repository layout

```
shared/src/            simulation core (runs in Node and in the browser)
  constants.ts         tick rate, timings, limits
  math.ts              angle helpers, quantisation, seeded RNG
  arena.ts             level geometry types + queries (ground height, collision, line of sight)
  arenas.ts            the three original arenas + automatic spawn aiming
  karts.ts             four kart stat profiles + slot colours
  cosmetics.ts         drivers, hats, paints; the "driver.hat.paint" look string
  items.ts             weapons, power-ups, weighted crate roll
  physics.ts           stepKart(): deterministic arcade kart physics
  match.ts             Match: karts, input queues, combat, projectiles, pickups, scoring, snapshots
  bot.ts               BotBrain: server-side AI producing ordinary button bits
  room.ts              Room: lobby → countdown → playing → results lifecycle, drop-in, reconnect
  protocol.ts          wire message types
server/src/index.ts    HTTP static server + WebSocket gateway + 60 Hz loop + matchmaking
client/src/
  net/transport.ts     WsTransport (auto-reconnect) and LocalTransport (in-browser Room)
  game/client.ts       GameClient: message handling, prediction/reconciliation, interpolation, UI store
  game/input.ts        keyboard + gamepad sampling
  game/settings.ts     persisted settings (localStorage, failure-tolerant)
  audio/sfx.ts         CC0 sample playback (lazy-loaded), synthesised engine, procedural music
  game/progress.ts     level / XP / coins / hats / daily reward (localStorage)
  scene/               React Three Fiber scene: arena + environment (sky, sea, clouds), karts with
                       animal drivers, projectiles, pickups, effects (puffs, skid marks, wrecks), camera
  ui/                  menus, lobby, HUD, touch controls, pause, results
tests/                 node:test suites (simulation, room lifecycle, real WebSocket multiplayer)
```

## Simulation (shared)

- **Fixed timestep:** 60 Hz (`DT = 1/60`). Server and client both step `stepKart()` with identical
  inputs, so prediction normally matches the server exactly. The exceptions are kart-to-kart bumps
  and explosions, which only the server knows about; reconciliation corrects those.
- **Physics:** custom arcade model, no physics engine.
  - **Driving:** forward/lateral velocity decomposition with grip-based slip, and a drift mode that
    holds a fixed slip angle.
  - **Height:** ground height from boxes and wedge ramps. Vertical speed gained while climbing
    launches karts off ramp edges.
  - **Collisions:** circle-vs-AABB walls, plus mass-weighted circle-vs-circle kart bumps.
  - **Bounds:** a clamp to the arena edges.
- **Combat:** projectiles are simulated on the server with sub-stepping for fast bolts. Splash
  damage falls off with distance and applies knockback and a short stun. Spawn shield and Bubble
  Shield block damage.
- **Bots:** `BotBrain` emits button bits, so bots obey exactly the same rules as players.
  - **Targeting:** seeks crates when unarmed and picks targets with hysteresis.
  - **Steering:** wall feelers via `segmentClear()`, plus an unstick manoeuvre when blocked.
  - **Skill:** three profiles controlling aim error, reaction time, throttle discipline,
    drift/boost use and fire discipline.
- **Rooms:** host migration, quick-match autostart, drop-in (replacing a bot when full), arena
  rotation, rematch votes, a 30 s reconnect grace during which a bot drives the absent player's
  kart, and input-starvation release (a stalled tab stops "holding" its last keys after 250 ms).

## Rendering (client)

- **Look:** bright, toy-like and matte:
  - Lambert materials, no tone mapping (to keep colours saturated), soft PCF shadows and a strong
    hemisphere fill;
  - a gradient sky dome and fog;
  - surroundings per style: an animated cartoon sea and beach, a floating candy slab over a cloud
    sea, or a snowy shore.
- **Arena:** rounded boxes, with lighter top lips and raised grass islands, are merged into **one
  vertex-coloured mesh**. Textured tops (checker grass, zig-zag frosting), ramps and floor decals
  (zebra crossings, dashed lane lines, kerbs) add a few more draw calls. Boost pads have animated
  chevrons. Scenery (palms, cake towers, clouds, pines, icebergs, balloons) is a single merged mesh.
- **Karts:** procedural chunky go-karts with original cartoon drivers (bunny, bear, fox, frog).
  Each kart's static parts are merged into one mesh plus 4 wheel meshes (steering front wheels,
  rolling tyres). The body rolls into slides and pitches in the air. There are boost flames, a
  shield bubble, a contact-shadow blob, and camera-facing name tags with health bars.
- **Pooled effects:** each type is a single `InstancedMesh`, with no per-frame allocation:
  - lit puffs for fireballs, smoke and dust;
  - additive sparkles;
  - continuous skid-mark streaks (a 900-segment ring buffer) laid behind sliding karts;
  - rocket smoke trails;
  - tumbling wreck carcasses.
- **Camera:** about 11.5 m back, 7.6 m up, looking 7.5 m ahead,
  58° FOV. It smooths heading, widens the FOV with speed and swoops in during the countdown. It
  pulls in and up when a wall blocks the view, and spectates your killer while you respawn.
- **Post-processing (High quality):** bloom with a high luminance threshold, so only flames,
  sparkles, lava and tracers glow, plus SMAA anti-aliasing and a soft vignette, via
  `@react-three/postprocessing`.
- **Mounted weapons:** the held item is rendered as twin pods on the kart from shared merged
  geometry. Minigun barrels spin and launchers recoil, driven by fire events.
- **Touch:** on coarse-pointer devices the HUD adds a drag stick and FIRE / DRIFT buttons that feed
  the same input bits as the keyboard.
- **Code splitting:** three.js and the scene load lazily, so the menu appears before the ~180 kB
  (gzip) three.js chunk arrives.

## Performance (measured in headless Chrome, 1366×768, High quality)

| Metric | Value |
|---|---|
| Frame rate | 60 FPS (vsync-capped) on all three arenas with 8 karts |
| Draw calls | about 64 to 91 per frame |
| Triangles | about 190k to 235k (rounded geometry + instanced pools) |
| JS heap | about 35 to 78 MB |
| Server cost | 8-kart bot match simulated far faster than real time (120 s match in under 100 ms in tests) |

The quality setting (Low/Medium/High) toggles shadows, pixel ratio, antialiasing and particle
density.
