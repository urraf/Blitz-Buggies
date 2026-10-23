// Cosmetics: who drives, what they wear, what colour the kart is. Purely visual; travels as a
// compact "driver.hat.paint" string so every client renders everyone's chosen look.

export const DRIVERS = [
  { id: "bunny", name: "Bun", unlockLevel: 1 },
  { id: "bear", name: "Bruno", unlockLevel: 1 },
  { id: "fox", name: "Foxy", unlockLevel: 1 },
  { id: "frog", name: "Hopps", unlockLevel: 1 },
  { id: "cat", name: "Whiskers", unlockLevel: 2 },
  { id: "panda", name: "Bamboo", unlockLevel: 3 },
  { id: "penguin", name: "Pebble", unlockLevel: 5 },
  { id: "duck", name: "Quackers", unlockLevel: 7 },
] as const;
export type DriverId = (typeof DRIVERS)[number]["id"];

export const HATS = [
  { id: "none", name: "No hat", cost: 0 },
  { id: "cap", name: "Racing Cap", cost: 50 },
  { id: "beanie", name: "Bobble Beanie", cost: 80 },
  { id: "party", name: "Party Cone", cost: 120 },
  { id: "cowboy", name: "Cowpoke", cost: 200 },
  { id: "helmet", name: "Retro Helmet", cost: 250 },
  { id: "tophat", name: "Top Hat", cost: 350 },
  { id: "crown", name: "Royal Crown", cost: 500 },
] as const;
export type HatId = (typeof HATS)[number]["id"];

export const PAINTS = [
  { color: "#ff5d5d", unlockLevel: 1 }, { color: "#3fa7ff", unlockLevel: 1 }, { color: "#ffd23f", unlockLevel: 1 },
  { color: "#4fd67a", unlockLevel: 1 }, { color: "#c77dff", unlockLevel: 1 }, { color: "#ff9b3d", unlockLevel: 1 },
  { color: "#2ee6d6", unlockLevel: 4 }, { color: "#ff6fb5", unlockLevel: 4 }, { color: "#f4f4f8", unlockLevel: 6 }, { color: "#3a3550", unlockLevel: 8 },
];

export interface Look { driver: DriverId; hat: HatId; paint: number }

export const DEFAULT_LOOK = "frog.none.0";

export function parseLook(s: unknown): Look {
  const [d, h, p] = (typeof s === "string" ? s : DEFAULT_LOOK).split(".");
  const driver = (DRIVERS.find((x) => x.id === d)?.id ?? "frog") as DriverId;
  const hat = (HATS.find((x) => x.id === h)?.id ?? "none") as HatId;
  const paint = Math.max(0, Math.min(PAINTS.length - 1, Number.isFinite(+p) ? Math.floor(+p) : 0));
  return { driver, hat, paint };
}
export const lookString = (l: Look) => `${l.driver}.${l.hat}.${l.paint}`;
/** Normalise untrusted input from the network. */
export const sanitizeLook = (s: unknown) => lookString(parseLook(s));

/** Deterministic varied looks for bots. */
export function botLook(i: number): string {
  const d = DRIVERS[(i * 3) % DRIVERS.length].id;
  const h = HATS[(i * 5 + 1) % HATS.length].id;
  return `${d}.${h}.${(i * 7) % PAINTS.length}`;
}

export const paintColor = (look: string) => PAINTS[parseLook(look).paint].color;
