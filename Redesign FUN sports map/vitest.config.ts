import { defineConfig } from "vitest/config";
import path from "path";

// Standalone config (not vite.config.ts): the app's vite config runs the
// overpass dev proxy + env loading that tests don't need.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.ts"],
    // Forks time out on worker startup when the repo sits on an iCloud-synced
    // path (heavy I/O). Threads are stable + faster here.
    pool: "threads",
  },
});
