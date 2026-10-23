// Simulation timing. Server and client both step physics at TICK_RATE.
export const TICK_RATE = 60;
export const DT = 1 / TICK_RATE;
/** Server sends a snapshot every N ticks (60 / 3 = 20 Hz). */
export const SNAPSHOT_INTERVAL = 3;
/** Client batches inputs and sends every N ticks (30 Hz). */
export const INPUT_SEND_INTERVAL = 2;
/** Remote entities are rendered this many ticks in the past (100 ms). */
export const INTERP_DELAY_TICKS = 6;

export const MAX_PLAYERS = 8;
export const DEFAULT_BOT_FILL = 6;
export const DEFAULT_MATCH_SECONDS = 180;
export const COUNTDOWN_SECONDS = 3;
export const RESULTS_SECONDS = 15;
export const QUICK_LOBBY_SECONDS = 6;
export const RECONNECT_GRACE_SECONDS = 30;

export const RESPAWN_SECONDS = 3;
export const SPAWN_SHIELD_SECONDS = 2;
export const MAX_HP = 100;
export const BOOST_MAX = 100;

export const KART_RADIUS = 1.15;
export const GRAVITY = 32;
/** Max height a kart can step up onto a box top without a ramp. */
export const STEP_HEIGHT = 0.45;

export const CRATE_RESPAWN_SECONDS = 5;
export const NITRO_RESPAWN_SECONDS = 10;
export const PICKUP_RADIUS = 1.9;
