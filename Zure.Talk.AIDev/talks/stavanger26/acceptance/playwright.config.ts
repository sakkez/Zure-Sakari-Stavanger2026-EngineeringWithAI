import { defineConfig } from "@playwright/test";

// RUN_DIR is the run under test. Every test starts that run's own `npm start` on a free
// port, with the speed-up variables it needs (fixtures.ts), so tests never share a game.
if (!process.env.RUN_DIR) throw new Error("set RUN_DIR to the run folder to test");

export default defineConfig({
  testDir: "./specs",
  // Two at a time: the game runs on timers, and a starved machine makes them flaky.
  workers: 2,
  fullyParallel: true,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  retries: 0,
  use: { browserName: "chromium", trace: "retain-on-failure" },
});
