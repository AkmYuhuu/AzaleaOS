/// <reference types="node" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Tauri expects strict port 1420 (see tauri.conf.json devUrl).
// https://tauri.app/start/frontend/vite/
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: "0.0.0.0",
    watch: {
      ignored: ["**/src-tauri/target/**", "**/node_modules/**", "**/.git/**"],
    },
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: (process.env.TAURI_ENV_PLATFORM as string) === "windows" ? "chrome105" : "esnext",
    minify: !(process.env.TAURI_ENV_DEBUG as string) ? "esbuild" : false,
    sourcemap: !!(process.env.TAURI_ENV_DEBUG as string),
    // honey: startup - keep 101 modules splitted reasonably, vendor isolated for cache
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "zustand"],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
});
