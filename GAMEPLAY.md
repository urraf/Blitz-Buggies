# Gameplay

All characters, art, names and maps are original.

## Goal

Free-for-all arena battle. Every wreck you cause is **+1 point**. When the round timer (1 to
5 minutes, default 3) hits zero, the most points wins, with fewer deaths breaking ties. Up to 8
karts per room; bots fill empty slots.

## Controls

| Input | Action |
|---|---|
| W / ↑ | Accelerate |
| S / ↓ | Brake, then reverse (reverse is nearly as fast as forward) |
| A D / ← → | Steer. Turning hard at speed makes the kart slide, leaving skid marks and smoke |
| Space | Fire your item (the Buzz Gun keeps firing while held) |
| Shift | Optional: hop-drift; release after the sparks change colour for a turbo |
| Esc | Pause |
| Touch | Drag anywhere on the left half to drive and steer (pull down to brake); FIRE and DRIFT buttons on the right |
| Gamepad | RT accelerate · LT brake · RB fire · LB drift |

## Driving feel

- **Engine:** spools up instead of snapping to full power. 0 → top speed takes about 2.5 s
  (12% at 0.5 s, 40% at 1 s, 63% at 1.5 s, 81% at 2 s).
- **Coasting:** releasing the throttle bleeds speed fast, about half of top speed per second.
- **Reverse:** reaches 92% of forward top speed.
- **Steering:** ramps in over about 0.3 s. The peak turn rate is about 155–175°/s, slightly lower
  at full speed.
- **Sliding:** above about 13 m/s, hard steering loosens grip and the kart slides.
- **Speed:** top speed is about 28 m/s. An arena takes about 5 to 5.5 s to cross.
- **Extras:** chevron **boost pads** give 1 s of +40% speed. Ramps launch you into the air;
  steering is reduced in the air.
- **Ice:** Frosty Bay has half the grip, so expect long slides.

## Karts (drivers)

Differences are deliberately small, so fights are won with items and aim. Every kart has 100 HP.

| Kart | Driver | Top speed | Accel | Turn | Weight |
|---|---|---|---|---|---|
| Hopper | Bunny | 27.5 | 18.5 | 2.95 | light |
| Grizzle | Bear | 27.5 | 16 | 2.7 | heavy (wins shoves) |
| Blaze | Fox | 29 | 16.5 | 2.75 | medium |
| Ribbit | Frog | 28 | 17 | 3.05 | medium |

## Items

Drive through a **? box** to roll a random item. You hold one weapon at a time, and boxes are
ignored while you hold one. Boxes respawn **5 s** after pickup.

| Item | Behaviour |
|---|---|
| **Buzz Gun** | 120 rounds at 14/s, 5 damage each, slight spread. Hold Space |
| **Boom Rocket** | One rocket fired straight ahead (50 m/s plus your speed), with a smoke trail. Wrecks in one hit (3.8 m blast) |
| **Homing Hornet** | Locks onto the nearest kart in front of you and turns to follow it. One-hit wreck (3.4 m blast) |
| **Triple Hornets** | Three homing missiles in a fan, each tracking a different nearby kart. One-hit wreck (2.8 m blast) |
| **Big Cannon** | Two heavy cannonballs on a slight arc, aim-assisted. One-hit wreck (4.6 m blast) |
| **Lob Bomb** | An arcing bomb that clears walls, about 18–38 m depending on your speed. One-hit wreck (6.5 m blast) |
| **Spike Mine** | Two mines dropped behind you. They arm after 0.7 s and trigger within 2.5 m. One-hit wreck |
| **Bubble Shield** | 6 s invulnerable. Ramming a kart above 6 m/s deals 25 damage |
| **Turbo** | 4 s of boost |
| **Patch Kit** | +50 HP. It's more likely to roll when you're hurt |

Roll weights: Buzz Gun 20, Rocket 17, Hornet 11, Triple Hornets 8, Lob Bomb 11, Cannon 9,
Mine 11, Shield 7, Turbo 7, Patch 3 (12 when below 60% HP).

- **Your weapon shows on your kart.** The held weapon appears as twin pods behind the driver
  (minigun barrels, rocket tubes, mortar, cannon, mine box). Barrels spin and launchers recoil
  when you fire.
- **Aim assist.** Straight-firing weapons bend slightly toward a kart that's almost in your
  sights, within about 11°.

Explosions knock surviving karts back and stun them briefly. You can't damage yourself.

## Wrecks and respawn

- **Wreck:** at 0 HP your kart bursts into a puff cloud and the wreck tumbles away. The screen shows
  **"You were wrecked by NAME's WEAPON"**, and the camera follows that kart.
- **Respawn:** after a **3-2-1** countdown, at the spawn point furthest from enemies, with a
  **2 s spawn shield** (blue bubble).
- **Callouts:** streaks at 3, 5, 7 and 10 wrecks, and **REVENGE!** for wrecking your last killer.

## Arenas

| Arena | Size | Look and layout |
|---|---|---|
| **Sunny Isle** | 150 × 150 m | Seaside street circuit: light-grey roads with lane dashes and zebra crossings, raised grass islands with coloured rims, a central plaza with four ramps, coast-road jump ramps, palm-lined beach and sea |
| **Sky Bakery** | 160 × 130 m | A floating candy court above the clouds: frosted cake plateaus with zig-zag ramps, a central chute with a boost pad, layered cake towers and balloons on the horizon |
| **Lava Pit** | 150 × 150 m | Volcanic crater split by a lava river with three bridges, plus jump ramps that vault it and corner lava pools. **Touching lava wrecks you**, and the point goes to whoever knocked you in within the last 4 s |
| **Skate Park** | 140 × 120 m | Concrete park with a funbox, kickers, a spine, quarter-pipes, ledges and planters, surrounded by a city park |
| **Frosty Bay** | 140 × 140 m, ice | Slippery rink on the bay: a walled inner ring with gaps, jump ramps that vault the ring, snowy pines and icebergs |

Each spawn is automatically aimed down its longest open lane toward the centre, and a test checks
for 22 m of clearance ahead of every spawn.

## Match flow

**Menu → Lobby → Countdown (3-2-1-GO, camera swoop) → Round → Results (podium + stats)**. Then:
- **Quick rooms:** the next round starts automatically on the next arena after 15 s.
- **Private rooms:** everyone returns to the lobby, unless every connected human presses
  **Rematch** first.

You can drop into a quick round in progress if more than 40 s remain.

## Drivers, customisation and progression

- **Customize** (home screen or lobby):
  - **Driver:** 8 cartoon animals. Bun the bunny, Bruno the bear, Foxy and Hopps the frog are free;
    Whiskers the cat, Bamboo the panda, Pebble the penguin and Quackers the duck unlock at
    levels 2, 3, 5 and 7.
  - **Kart:** Zoomer, Brickhouse, Comet or Sprocket.
  - **Paint:** 10 colours, some level-gated.
  - **Hat:** 8 hats bought with coins (cap, beanie, party cone, cowboy, helmet, top hat, crown).
- **Visible to everyone:** your look is sent to the server, so other players see your kart as you
  customised it.
- **XP and coins:** every match gives XP (40 + 15 per wreck + a placement bonus) and coins. Levels
  need 100 XP, then 60 more for each level after.
- **Daily reward:** a coin bonus once per day.
- **Storage:** progress is saved in your browser.

## Sound

Effects and jingles are CC0 samples by Kenney (see `client/public/sfx/CREDITS.txt`):
- gunfire, rocket launches, explosions, hits, pickups, shields, boosts;
- the countdown, wreck and kill stings;
- victory, defeat and level-up jingles;
- UI clicks.

The engine is synthesised and follows your speed. The background music is original and generated
procedurally: an upbeat menu loop and a faster race track. Volumes for master, effects, engine
and music are in Settings.

## Wreck moments (feedback)

- **When you wreck someone:**
  - A **SMASHED!** stamp slams onto the screen. It is replaced by **FIRST BLOOD!**, **SHUTDOWN!**
    (ending someone's 3+ streak), **REVENGE!**, **DOUBLE / TRIPLE / QUAD SMASH!** (wrecks within
    4 s) or streak titles (**ON FIRE!**, **UNSTOPPABLE!**) when one applies.
  - A gold **+1** pops over the victim, followed by a confetti burst.
  - The wreck bursts apart: the chassis tumbles while all four wheels fly off and bounce away, and
    cartoon stars circle overhead.
- **Every hit you land:** floating damage numbers, and the target kart flashes white.
- **When you're wrecked:**
  - The screen fades to grey and **WRECKED!** appears.
  - A **killer card** shows who got you, their driver, kart and weapon.
  - There's a big 3-2-1 respawn count while the camera follows them.

## Kid-friendly by design

- **No chat:** players talk with **emotes** only (keys 1–4, or the emote buttons): 👋 😄 😎 🎉.
  They are rate-limited to one per second.
- **Name filter:** names pass a filter (including disguised spellings like `sh1t` or `F.U.C.K`).
  Blocked or empty names become a fun random name such as "Turbo Panda 42"; the 🎲 button makes one
  too.
- **No real money:** no purchases, ads or loot boxes. Coins are earned only by playing, and hats are
  bought from a fixed price list.

## Missions and progression

- **3 daily missions** are drawn from a pool: wreck 5 or 12 karts, win a match, finish top 3,
  rocket / Buzz Gun / bomb / mine wrecks, grab 15 boxes, a 3-wreck streak, knock a kart into lava.
  Each completed mission pays coins and XP, shown on the results screen.
- **Next unlock:** the home screen shows the next driver you're working toward.
- **Level-up:** a full-screen celebration with confetti and the newly unlocked drivers.
- **First-match help:** a controls card, a floating arrow to the nearest item box, and a
  "Press SPACE to fire!" hint for the first few matches.
