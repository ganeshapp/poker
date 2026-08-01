import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf8"));

// https://vitejs.dev/config/
export default defineConfig({
  // Relative base so the same build works both under the GitHub Pages
  // subpath (e.g. /poker/) and inside the Tauri desktop app's custom protocol.
  base: "./",
  // Single-source the version from package.json.
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Tauri expects a fixed dev port matching tauri.conf.json `devUrl`.
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    target: "esnext",
    chunkSizeWarningLimit: 1200,
  },
});
