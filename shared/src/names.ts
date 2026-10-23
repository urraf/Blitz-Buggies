// Kid-safe player names: a small blocklist with leetspeak folding, plus a fun random-name generator.

const BLOCK = [
  "fuck", "shit", "bitch", "cunt", "dick", "cock", "pussy", "asshole", "bastard", "slut", "whore", "fag", "nigg", "nigga",
  "retard", "rape", "nazi", "hitler", "porn", "sex", "penis", "vagina", "boob", "tits", "anal", "cum", "jizz", "wank",
  "twat", "piss", "damn", "crap", "kill yourself", "kys", "suicide", "drug", "weed", "cocaine", "heroin",
];

const FOLD: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "@": "a", "$": "s", "!": "i", "|": "i", "+": "t" };

/** True when the name contains blocked words, even disguised with digits, symbols or spacing. */
export function isNameBlocked(name: string): boolean {
  const folded = [...name.toLowerCase()].map((c) => FOLD[c] ?? c).join("");
  const compact = folded.replace(/[^a-z]/g, "");
  const spaced = folded.replace(/[^a-z ]/g, " ");
  const words = spaced.split(/\s+/).filter(Boolean);
  return BLOCK.some((w) => {
    // 3-letter words only match whole words ("cum" must not catch "cucumber"); longer ones match anywhere
    if (w.length <= 3) return words.includes(w) || compact === w;
    return compact.includes(w.replace(/ /g, "")) || spaced.includes(w);
  });
}

const ADJ = ["Turbo", "Zippy", "Bouncy", "Sparkly", "Mighty", "Speedy", "Wobbly", "Fuzzy", "Jolly", "Rocket", "Super", "Happy", "Brave", "Lucky", "Fizzy", "Sunny"];
const NOUN = ["Panda", "Bunny", "Pickle", "Muffin", "Comet", "Taco", "Penguin", "Noodle", "Dino", "Waffle", "Frog", "Biscuit", "Otter", "Pancake", "Koala", "Button"];

export function randomName(seed = Math.random()): string {
  const a = ADJ[Math.floor(seed * ADJ.length) % ADJ.length];
  const n = NOUN[Math.floor(seed * 9973) % NOUN.length];
  return `${a} ${n} ${Math.floor(seed * 90) + 10}`;
}

/** Normalise a requested display name; blocked or empty names become a random fun name. */
export function safeName(raw: unknown): string {
  const n = typeof raw === "string" ? raw.replace(/[^\w \-.!?']/g, "").replace(/\s+/g, " ").trim().slice(0, 16) : "";
  if (!n || isNameBlocked(n)) return randomName();
  return n;
}

/** Kid-friendly emotes (no free text chat). */
export const EMOTES = ["👋", "😄", "😎", "🎉"] as const;
