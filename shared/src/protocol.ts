// Wire protocol. JSON with short keys; hot-path messages (inputs, snapshots) use positional arrays.

export type Phase = "lobby" | "countdown" | "playing" | "results";

export interface RoomSettings {
  arena: string;
  /** Fill the room with bots up to this many karts. */
  botFill: number;
  botSkill: 0 | 1 | 2;
  seconds: number;
}

export interface LobbyPlayer {
  id: number;
  name: string;
  kart: string;
  bot: boolean;
  host: boolean;
  connected: boolean;
  rematch: boolean;
  slot: number;
  look: string;
}

export interface RoomInfo {
  code: string;
  isPrivate: boolean;
  phase: Phase;
  settings: RoomSettings;
  players: LobbyPlayer[];
  /** Seconds until quick-match auto start, -1 when waiting for host. */
  autoStart: number;
}

export interface ResultRow { id: number; name: string; kart: string; bot: boolean; score: number; kills: number; deaths: number; bestStreak: number; look: string }

// ---- client -> server
export type ClientMsg =
  | { t: "hello"; name: string; kart: string; look?: string; token?: string }
  | { t: "quick" }
  | { t: "create"; settings: Partial<RoomSettings> }
  | { t: "join"; code: string }
  | { t: "leave" }
  | { t: "start" }
  | { t: "settings"; settings: Partial<RoomSettings> }
  | { t: "kart"; kart: string; look?: string }
  | { t: "rematch" }
  /** inputs: s = sequence of first entry, b = button bytes (oldest first, may overlap previous batch). */
  | { t: "i"; s: number; b: number[] }
  | { t: "ping"; c: number }
  | { t: "emote"; i: number };

// ---- server -> client
/** Remote kart row: [id, x, y, z, yaw, hp, flags, item, driftDir] */
export type KartRow = [number, number, number, number, number, number, number, number, number];
/** Projectile row: [id, kind, x, y, z, ownerId] */
export type ProjRow = [number, number, number, number, number, number];

export const KFlag = { Alive: 1, Shield: 2, SpawnShield: 4, Boost: 8, Drift: 16, Grounded: 32, Stun: 64, Overdrive: 128, Bot: 256, Disconnected: 512 } as const;

export type GameEvent =
  | { e: "fire"; id: number; item: number }
  | { e: "hit"; id: number; by: number; dmg: number; x: number; y: number; z: number }
  | { e: "boom"; x: number; y: number; z: number; r: number; kind: number }
  | { e: "kill"; id: number; by: number; item: number; streak: number; revenge: boolean; shutdown?: boolean; first?: boolean }
  | { e: "emote"; id: number; i: number }
  | { e: "spawn"; id: number }
  | { e: "pickup"; id: number; item: number; crate: number }
  | { e: "nitro"; id: number; idx: number }
  | { e: "kev"; id: number; bits: number }
  | { e: "msg"; text: string };

export interface Snapshot {
  t: "s";
  /** server tick */
  k: number;
  /** last input sequence processed for the receiving player */
  a: number;
  /** seconds left in the round */
  tl: number;
  /** countdown seconds remaining before karts may move (0 once racing) */
  cd: number;
  p: KartRow[];
  j: ProjRow[];
  /** own full physics state (see packPhys) + [hp, item, ammo, shieldTime, respawnIn] */
  me?: number[];
  /** crate availability bitstring, only present when changed */
  cr?: string;
  /** nitro availability bitstring, only present when changed */
  nt?: string;
  ev?: GameEvent[];
}

export type ServerMsg =
  | { t: "welcome"; id: number; token: string }
  | { t: "room"; room: RoomInfo; you: number }
  | { t: "left" }
  | { t: "match"; arena: string; seconds: number; countdown: number; tick: number; you: number; roster: { id: number; name: string; kart: string; slot: number; bot: boolean; look: string }[] }
  | Snapshot
  | { t: "score"; rows: [number, number, number, number][] }
  | { t: "results"; rows: ResultRow[]; next: number }
  | { t: "pong"; c: number; k: number }
  | { t: "err"; msg: string };
