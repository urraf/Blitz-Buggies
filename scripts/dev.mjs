// Runs the game server (auto-restart on change) and the Vite dev server together.
import { spawn } from "node:child_process";

const procs = [
  spawn(process.execPath, ["--watch", "server/src/index.ts"], { stdio: "inherit" }),
  spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "dev", "-w", "client"], { stdio: "inherit" }),
];
const stop = () => { for (const p of procs) p.kill(); process.exit(); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
for (const p of procs) p.on("exit", (code) => { if (code) stop(); });
