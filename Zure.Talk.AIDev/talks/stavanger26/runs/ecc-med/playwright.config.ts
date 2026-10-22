import { defineConfig } from '@playwright/test';

const port = Number(process.env.E2E_PORT) || 3199;

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  workers: 1,
  fullyParallel: false,
  use: { baseURL: `http://localhost:${port}` },
  webServer: {
    command: 'npm start',
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      PORT: String(port),
      COUNTDOWN_MS: '1500',
      ZONE_INTERVAL_MS: '60000',
      RESULT_MS: '1500',
      RECONNECT_MS: '1500',
    },
  },
});
