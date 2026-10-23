import type { Rng } from "./math.ts";

// Item ids are small integers so they pack into snapshots.
export const Item = {
  None: 0,
  Blaster: 1,
  Hornet: 2,
  Lobber: 3,
  Mine: 4,
  Shield: 5,
  Overdrive: 6,
  Patch: 7,
  Rocket: 8,
  Triple: 9,
  Cannon: 10,
  /** pseudo-item used in kill events for lava wrecks */
  Lava: 99,
} as const;
export type ItemId = (typeof Item)[keyof typeof Item];

export interface WeaponDef {
  name: string;
  short: string;
  ammo: number;
  /** Seconds between shots. Buzz Gun is automatic while fire is held. */
  interval: number;
  auto: boolean;
  damage: number;
  splash: number;
  color: string;
}

// Combat pacing: explosives wreck a kart in one hit, the rapid-fire gun carries a big magazine of
// weak rounds.
export const WEAPONS: Partial<Record<ItemId, WeaponDef>> = {
  [Item.Blaster]: { name: "Buzz Gun", short: "BUZZ", ammo: 120, interval: 1 / 14, auto: true, damage: 5, splash: 0, color: "#ffd23f" },
  [Item.Rocket]: { name: "Boom Rocket", short: "ROCKET", ammo: 1, interval: 0.4, auto: false, damage: 100, splash: 3.8, color: "#ff5d5d" },
  [Item.Hornet]: { name: "Homing Hornet", short: "HORNET", ammo: 1, interval: 0.4, auto: false, damage: 100, splash: 3.4, color: "#ff9b3d" },
  [Item.Lobber]: { name: "Lob Bomb", short: "LOB", ammo: 1, interval: 0.4, auto: false, damage: 100, splash: 6.5, color: "#c77dff" },
  [Item.Mine]: { name: "Spike Mine", short: "MINE", ammo: 2, interval: 0.3, auto: false, damage: 100, splash: 4.2, color: "#ff4d6d" },
  [Item.Triple]: { name: "Triple Hornets", short: "TRIPLE", ammo: 1, interval: 0.4, auto: false, damage: 100, splash: 2.8, color: "#ffb03d" },
  [Item.Cannon]: { name: "Big Cannon", short: "CANNON", ammo: 2, interval: 0.6, auto: false, damage: 100, splash: 4.6, color: "#5c5470" },
};

export interface PowerDef { name: string; seconds: number; color: string }
export const POWERS: Partial<Record<ItemId, PowerDef>> = {
  [Item.Shield]: { name: "Bubble Shield", seconds: 6, color: "#74c0fc" },
  [Item.Overdrive]: { name: "Turbo", seconds: 4, color: "#ffd43b" },
  [Item.Patch]: { name: "Patch Kit", seconds: 0, color: "#69db7c" },
};

export const isWeapon = (id: number) => (id >= Item.Blaster && id <= Item.Mine) || (id >= Item.Rocket && id <= Item.Cannon);

export const itemName = (id: number) => (id === Item.Lava ? "Lava" : WEAPONS[id as ItemId]?.name ?? POWERS[id as ItemId]?.name ?? "");

/** Weighted crate roll; low health raises the chance of a Patch Kit. */
export function rollCrate(rng: Rng, hpFrac: number): ItemId {
  const table: [ItemId, number][] = [
    [Item.Blaster, 20],
    [Item.Rocket, 17],
    [Item.Hornet, 11],
    [Item.Triple, 8],
    [Item.Lobber, 11],
    [Item.Cannon, 9],
    [Item.Mine, 11],
    [Item.Shield, 7],
    [Item.Overdrive, 7],
    [Item.Patch, hpFrac < 0.6 ? 12 : 3],
  ];
  const total = table.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [id, w] of table) {
    if ((r -= w) <= 0) return id;
  }
  return Item.Blaster;
}

// Projectile kinds (separate from items: a mine item spawns a mine projectile, etc.)
export const Proj = { Bolt: 1, Hornet: 2, Lob: 3, Mine: 4, Rocket: 5, Ball: 6 } as const;
export type ProjKind = (typeof Proj)[keyof typeof Proj];
