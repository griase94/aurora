import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vitest/config";

// Shiftbook's unit lane: pure functions and the session on its memory adapters.
// No browser and no network. The Svelte plugin compiles the one fixture that
// renders the session context on the server.
export default defineConfig({
  plugins: [svelte()],
  test: {
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
    // Machine limit: at most two test workers.
    maxWorkers: 2,
  },
});
