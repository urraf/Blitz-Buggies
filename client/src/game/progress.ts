import { DRIVERS, HATS, Item, PAINTS, type ResultRow } from "../../../shared/src/index.ts";

// Player progression, stored per browser: level / XP from matches, coins for hats, a daily bonus.

/** What happened to the local player in one match (gathered from game events). */
export interface MatchStats { kills: number; byItem: Record<number, number>; pickups: number; bestStreak: number; lavaPushes: number }

interface MissionTpl { id: string; text: string; goal: number; coins: number; xp: number; measure: (s: MatchStats, rank: number) => number }
export interface Mission { id: string; text: string; goal: number; coins: number; xp: number; progress: number; done: boolean }

// Daily mission pool: small, achievable goals that reward variety (different weapons, arenas, play styles).
const MISSIONS: MissionTpl[] = [
  { id: "wreck5", text: "Wreck 5 karts", goal: 5, coins: 40, xp: 60, measure: (s) => s.kills },
  { id: "wreck12", text: "Wreck 12 karts", goal: 12, coins: 80, xp: 120, measure: (s) => s.kills },
  { id: "win1", text: "Win a match", goal: 1, coins: 60, xp: 100, measure: (_, r) => (r === 1 ? 1 : 0) },
  { id: "top3x2", text: "Finish top 3 twice", goal: 2, coins: 50, xp: 80, measure: (_, r) => (r > 0 && r <= 3 ? 1 : 0) },
  { id: "play3", text: "Play 3 matches", goal: 3, coins: 30, xp: 50, measure: () => 1 },
  { id: "rocket3", text: "Wreck 3 karts with rockets", goal: 3, coins: 50, xp: 70, measure: (s) => (s.byItem[Item.Rocket] ?? 0) + (s.byItem[Item.Hornet] ?? 0) + (s.byItem[Item.Triple] ?? 0) },
  { id: "buzz3", text: "Wreck 3 karts with the Buzz Gun", goal: 3, coins: 50, xp: 70, measure: (s) => s.byItem[Item.Blaster] ?? 0 },
  { id: "boom3", text: "Wreck 3 karts with bombs or cannons", goal: 3, coins: 50, xp: 70, measure: (s) => (s.byItem[Item.Lobber] ?? 0) + (s.byItem[Item.Cannon] ?? 0) },
  { id: "mine2", text: "Wreck 2 karts with mines", goal: 2, coins: 50, xp: 70, measure: (s) => s.byItem[Item.Mine] ?? 0 },
  { id: "boxes15", text: "Grab 15 item boxes", goal: 15, coins: 35, xp: 50, measure: (s) => s.pickups },
  { id: "streak3", text: "Get a 3-wreck streak", goal: 1, coins: 60, xp: 90, measure: (s) => (s.bestStreak >= 3 ? 1 : 0) },
  { id: "lava1", text: "Knock a kart into lava", goal: 1, coins: 60, xp: 90, measure: (s) => s.lavaPushes },
];

export interface Progress {
  missionsDate: string;
  missions: Mission[];
  xp: number;
  level: number;
  coins: number;
  hats: string[];
  lastDaily: string;
  matches: number;
  wins: number;
  kills: number;
}

export interface Reward { xp: number; coins: number; levelUp: boolean; newLevel: number; unlocked: string[]; missions: Mission[] }

const KEY = "bb.progress";
const fresh = (): Progress => ({ missionsDate: "", missions: [], xp: 0, level: 1, coins: 100, hats: ["none"], lastDaily: "", matches: 0, wins: 0, kills: 0 });

/** XP needed to go from `level` to `level + 1`. */
export const xpForLevel = (level: number) => 100 + (level - 1) * 60;

function load(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...fresh(), ...JSON.parse(raw) };
  } catch { /* storage unavailable */ }
  return fresh();
}

let current = load();

function dailyMissions(date: string): Mission[] {
  let h = 0;
  for (const c of date) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const pool = [...MISSIONS];
  const out: Mission[] = [];
  while (out.length < 3 && pool.length) {
    h = (h * 1103515245 + 12345) >>> 0;
    const t = pool.splice(h % pool.length, 1)[0];
    out.push({ id: t.id, text: t.text, goal: t.goal, coins: t.coins, xp: t.xp, progress: 0, done: false });
  }
  return out;
}
const listeners = new Set<() => void>();
const save = () => {
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* ignore */ }
  for (const l of listeners) l();
};

const today = () => new Date().toISOString().slice(0, 10);

export const progress = {
  get: () => current,
  subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; },

  driverUnlocked: (id: string) => (DRIVERS.find((d) => d.id === id)?.unlockLevel ?? 99) <= current.level,
  paintUnlocked: (i: number) => (PAINTS[i]?.unlockLevel ?? 99) <= current.level,
  hatOwned: (id: string) => current.hats.includes(id),

  buyHat(id: string): boolean {
    const hat = HATS.find((h) => h.id === id);
    if (!hat || current.hats.includes(id) || current.coins < hat.cost) return false;
    current = { ...current, coins: current.coins - hat.cost, hats: [...current.hats, id] };
    save();
    return true;
  },

  /** Today's three missions (rolled over automatically at midnight). */
  missions(): Mission[] {
    if (current.missionsDate !== today()) {
      current = { ...current, missionsDate: today(), missions: dailyMissions(today()) };
      save();
    }
    return current.missions;
  },

  /** Next locked driver/paint the player is working toward. */
  nextUnlock(): { name: string; level: number } | null {
    const d = DRIVERS.filter((x) => x.unlockLevel > current.level).sort((a, b) => a.unlockLevel - b.unlockLevel)[0];
    return d ? { name: d.name, level: d.unlockLevel } : null;
  },

  dailyAvailable: () => current.lastDaily !== today(),
  claimDaily(): number {
    if (current.lastDaily === today()) return 0;
    const amount = 75 + Math.min(10, current.level) * 5;
    current = { ...current, coins: current.coins + amount, lastDaily: today() };
    save();
    return amount;
  },

  /** Award XP and coins for a finished match, and advance today's missions. */
  award(rows: ResultRow[], you: number, stats: MatchStats): Reward | null {
    const rank = rows.findIndex((r) => r.id === you) + 1;
    const me = rows.find((r) => r.id === you);
    if (!me || rank === 0) return null;
    const placeBonus = rank === 1 ? 80 : rank === 2 ? 50 : rank === 3 ? 30 : 10;
    let xp = 40 + me.kills * 15 + placeBonus;
    let coins = 15 + me.kills * 5 + Math.round(placeBonus / 2);
    const completed: Mission[] = [];
    const missions = this.missions().map((m) => {
      if (m.done) return m;
      const tpl = MISSIONS.find((t) => t.id === m.id);
      const progress = Math.min(m.goal, m.progress + (tpl ? tpl.measure(stats, rank) : 0));
      const done = progress >= m.goal;
      if (done) { completed.push(m); xp += m.xp; coins += m.coins; }
      return { ...m, progress, done };
    });
    current = { ...current, missions };
    let { level } = current;
    let total = current.xp + xp;
    const before = level;
    while (total >= xpForLevel(level)) { total -= xpForLevel(level); level++; }
    const unlocked = DRIVERS.filter((d) => d.unlockLevel > before && d.unlockLevel <= level).map((d) => d.name);
    current = { ...current, xp: total, level, coins: current.coins + coins, matches: current.matches + 1, wins: current.wins + (rank === 1 ? 1 : 0), kills: current.kills + me.kills };
    save();
    return { xp, coins, levelUp: level > before, newLevel: level, unlocked, missions: completed };
  },
};
