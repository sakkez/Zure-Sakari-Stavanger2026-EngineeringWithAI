import { defineConfig } from '@playwright/test';

const port = Number(process.env.PORT) || 3005;

export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  timeout: 60_000,
  use: { baseURL: `http://localhost:${port}`, headless: true },
  webServer: {
    command: 'npm start',
    url: `http://localhost:${port}`,
    reuseExistingServer: false,
    env: { PORT: String(port), COUNTDOWN_MS: '3000', ZONE_INTERVAL_MS: '60000', RESULT_MS: '3000', RECONNECT_MS: '2000' },
  },
});
