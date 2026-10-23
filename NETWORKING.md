# Networking

## Model: authoritative server with client prediction

| Responsibility | Server (`shared/src/room.ts`, `match.ts`, `server/src/index.ts`) | Client (`client/src/game/client.ts`) |
|---|---|---|
| Connections, rooms, matchmaking | ✔ quick-match pooling, private codes, host migration | sends intents |
| Player state & movement | ✔ applies queued inputs with `stepKart()` at 60 Hz | predicts own kart with the same function |
| Movement validation | ✔ inputs are only button bits, so speed, collisions and bounds are always the server's physics | n/a |
| Weapons / projectiles / damage | ✔ fire cooldowns, ammo, projectile sim, splash, knockback | plays own fire SFX instantly, renders server projectiles |
| Pickups | ✔ arbitrated (first kart in range wins) | renders crate/nitro availability |
| Respawn, scoring, match lifecycle, win | ✔ | displays |
| Disconnect handling | ✔ bot drives the kart for 30 s; token-based re-attach | auto-reconnect with backoff, resume after page reload |

Clients never send positions, hits or scores; the server derives everything from button presses.
That makes speed hacks, teleports and fake hits structurally impossible.

## Timing

| Item | Rate |
|---|---|
| Server simulation | 60 Hz fixed step; the loop catches up at most 8 ticks, then drops the backlog |
| Client input | sampled every 60 Hz tick, **batched 2 per message → 30 msgs/s** |
| Snapshots | every 3 ticks → **20 Hz** |
| Remote interpolation delay | 6 ticks = **100 ms** |
| Ping | every 2 s (RTT shown in the HUD) |

## Client prediction and reconciliation

1. **Sample and predict.** Each local tick: sample input bits, assign `seq++`, store
   `{seq, bits}` in `pending`, and step the predicted kart immediately.
2. **Reconcile.** Each snapshot carries `a`, the last input sequence the server applied, plus `me`,
   your full 14-field physics state, HP, item, ammo, timers and alive flag. The client:
   1. resets the predicted state to `me`;
   2. drops `pending` entries `≤ a`;
   3. replays the rest.
3. **Smooth.** The difference between the old and new predicted position is added to a visual
   offset that decays at about e^(−12t), so corrections from bumps and explosions blend in. Jumps
   larger than 5 m (respawn) snap instead.
4. **Freeze when not driving.** While wrecked or during the countdown, the client doesn't predict.
5. **Sequence handling.** Sequences increase monotonically for the whole session, so stale inputs
   can't poison a new match. On reconnect the server resets that kart's sequence tracking, because a
   reloaded page restarts at 1 (there's a regression test for this).

## Interpolation (remote karts, projectiles)

- **Snapshot buffer:** the client keeps the last 40 snapshots and a smoothed estimate of the
  current server tick.
- **Rendering:** remote entities are drawn at `estTick − 6` by lerping position and yaw between the
  two bracketing snapshots, matched by entity id.
- **Projectiles:** they only appear once they exist at render time, which prevents pop-in
  artefacts.

## Server input handling

- **Queueing:** each kart has a queue, capped at 8; one input is consumed per tick and duplicates
  (`seq ≤ lastSeq`) are ignored.
- **Empty queue:** the last input is reused. After 15 starved ticks (250 ms, e.g. a backgrounded
  tab) the controls are released, so the kart doesn't drive off on its own.
- **Abuse limits:** 120 msgs/s per client, 8 KB max frame, malformed JSON ignored, names sanitised,
  settings clamped to valid values. Snapshots are dropped when a socket has more than 256 KB
  buffered (the next one supersedes it), but reliable messages are never dropped.

## Bandwidth optimisation

- **Compact rows:** positional arrays instead of objects for karts
  `[id,x,y,z,yaw,hp,flags,item,drift]` and projectiles `[id,kind,x,y,z,owner]`. Values are quantised
  to 0.01 m / 0.001 rad, and kart state flags are packed into a bitfield.
- **Own state only:** only the receiving player gets the full physics block (`me`).
- **On change only:** crate and nitro availability are sent as bit-strings when they change (or once
  for a new or reconnecting client). Scoreboard rows go in a separate `score` message only when a
  score changes. Lobby info is sent only on change.
- **Event-driven effects:** gameplay events (fire, hit, boom, kill, pickup, spawn, landing/turbo FX)
  ride inside the next snapshot instead of separate messages.

**Measured** (`tests/net.test.ts`, 4-kart room on loopback): **19.9 snapshots/s** and **about
5.3 KiB/s downstream per client**. Upstream is about 30 small messages per second, roughly 1 KiB/s.

## Protocol summary

Client → server:
- `hello {name, kart, token?}`
- `quick`
- `create {settings}`
- `join {code}`
- `leave`
- `start`
- `settings`
- `kart`
- `rematch`
- `i {s, b[]}`
- `ping {c}`

Server → client:
- `welcome {id, token}`
- `room {room, you}`
- `match {arena, seconds, countdown, tick, you, roster}`
- `s` (snapshot: `k` tick, `a` ack, `tl` time left, `cd` countdown, `p` karts, `j` projectiles,
  `me`, `cr`/`nt` pickup bits, `ev` events)
- `score {rows}`
- `results {rows, next}`
- `pong`
- `left`
- `err`

Types live in `shared/src/protocol.ts`.

## Why an authoritative server

Many browser kart games relay each client's own kart state to the others. Blitz Buggies runs the
whole match on the server instead. That trades a little server CPU for cheat resistance and
consistent hit resolution.

**Known limitation:** there's no lag compensation (server-side rewind) for hit checks. Projectiles
are simulated in server time, so at high latency you should lead your targets slightly.
