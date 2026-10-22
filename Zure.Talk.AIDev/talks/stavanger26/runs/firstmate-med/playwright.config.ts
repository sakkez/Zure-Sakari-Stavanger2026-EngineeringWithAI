import { defineConfig } from '@playwright/test';
const PORT = Number(process.env.E2E_PORT || 3123);
export default defineConfig({
  testDir: 'e2e',
  timeout: 30000,
  workers: 1,
  use: { baseURL: `http://localhost:${PORT}` },
  webServer: {
    command: 'npm start',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    env: { PORT: String(PORT), COUNTDOWN_MS: '1500', ZONE_INTERVAL_MS: '60000', RESULT_MS: '1500', RECONNECT_MS: '2500' },
  },
});
