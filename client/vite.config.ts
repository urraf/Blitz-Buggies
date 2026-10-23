import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./", // relative asset URLs, so the build also works from a portal's sub-folder
  server: {
    port: 5173,
    host: true, // reachable from other devices on the LAN
    proxy: { "/ws": { target: "ws://localhost:3000", ws: true } },
    fs: { allow: [".."] },
  },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three"],
          r3f: ["@react-three/fiber"],
        },
      },
    },
  },
});
