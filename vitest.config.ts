import { defineConfig } from "vitest/config";

// The fast lane: unit tests that need no network, no database and no browser.
// Packages keep their tests beside the source; scripts keep theirs beside the script.
export default defineConfig({
  test: {
    include: ["scripts/**/*.test.ts", "packages/*/src/**/*.test.ts"],
    // Machine limit: at most two test workers.
    maxWorkers: 2,
  },
});
