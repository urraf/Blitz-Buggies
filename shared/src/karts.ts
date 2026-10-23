export type Driver = "bunny" | "bear" | "fox" | "frog";

export interface KartStats {
  id: string;
  name: string;
  tagline: string;
  /** Cartoon animal that drives this kart (original characters). */
  driver: Driver;
  /** Primary / secondary body colours used by the procedural model. */
  color: string;
  trim: string;
  maxSpeed: number;
  accel: number;
  turnRate: number;
  grip: number;
  maxHp: number;
  /** Mass factor for kart-to-kart bumps. */
  mass: number;
}

// Top speed ≈ 28 m/s and accel ≈ 17 m/s². Differences between karts are deliberately small:
// combat is decided by items and aim, not by stats.
export const KARTS: KartStats[] = [
  { id: "zippy", name: "Zoomer", tagline: "Light and quickest off the line", driver: "bunny", color: "#ff7eb6", trim: "#ffffff", maxSpeed: 27.5, accel: 18.5, turnRate: 2.95, grip: 9, maxHp: 100, mass: 0.9 },
  { id: "bruiser", name: "Brickhouse", tagline: "Heavy, wins every shove", driver: "bear", color: "#ff8c42", trim: "#5c3d2e", maxSpeed: 27.5, accel: 16, turnRate: 2.7, grip: 10, maxHp: 100, mass: 1.35 },
  { id: "comet", name: "Comet", tagline: "Highest top speed", driver: "fox", color: "#4cc9f0", trim: "#f1faee", maxSpeed: 29, accel: 16.5, turnRate: 2.75, grip: 8.5, maxHp: 100, mass: 1.0 },
  { id: "sprocket", name: "Sprocket", tagline: "Sharpest turning", driver: "frog", color: "#7bd389", trim: "#2b2d42", maxSpeed: 28, accel: 17, turnRate: 3.05, grip: 9.5, maxHp: 100, mass: 1.0 },
];

export const kartById = (id: string): KartStats => KARTS.find((k) => k.id === id) ?? KARTS[0];

/** Player colour palette (body tint per slot so karts of the same model are distinguishable). */
export const SLOT_COLORS = ["#ff5d5d", "#3fa7ff", "#ffd23f", "#4fd67a", "#c77dff", "#ff9b3d", "#2ee6d6", "#ff6fb5"];
