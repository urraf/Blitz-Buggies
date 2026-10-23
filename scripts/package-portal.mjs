// Build the web client for a game portal or static host (Poki, CrazyGames, itch.io, ...) and zip it.
// The portal hosts these files; the game connects to your own server for online play.
//
//   npm run package:portal -- https://your-game-server.onrender.com
//
// Output: release/blitz-buggies-web.zip (client/dist is left untouched for the local server).
import { execFileSync } from "node:child_process";
import { readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const server = (process.argv[2] ?? process.env.VITE_SERVER_URL ?? "").replace(/\/+$/, "");
if (!/^https:\/\/[^/]+$/.test(server)) {
  console.error("Usage: npm run package:portal -- https://your-game-server.example.com");
  console.error("Give the public HTTPS address of your game server (portals are HTTPS pages, so http:// is blocked).");
  process.exit(1);
}

const outDir = "release/web";
const zip = "release/blitz-buggies-web.zip";
rmSync("release", { recursive: true, force: true });
execFileSync(process.platform === "win32" ? "npm.cmd" : "npm",
  ["run", "build", "-w", "client", "--", "--outDir", `../${outDir}`, "--emptyOutDir"],
  { stdio: "inherit", env: { ...process.env, VITE_SERVER_URL: server } });
execFileSync("zip", ["-qr", "-X", "../blitz-buggies-web.zip", ".", "-x", "*.DS_Store"], { cwd: outDir, stdio: "inherit" });

let files = 0, bytes = 0;
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); const s = statSync(p); if (s.isDirectory()) walk(p); else { files++; bytes += s.size; } } };
walk(outDir);
console.log(`\n${zip}: ${files} files, ${(bytes / 1024 / 1024).toFixed(1)} MB unzipped, ${(statSync(zip).size / 1024 / 1024).toFixed(1)} MB zipped`);
console.log(`Online play connects to ${server}`);
