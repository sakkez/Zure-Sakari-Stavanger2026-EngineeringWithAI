import { defineConfig } from '@playwright/test';
const port = Number(process.env.PORT) || 3001;
export default defineConfig({
  testDir: 'e2e', timeout: 60000, workers: 1,
  use: { baseURL: `http://localhost:${port}` },
  webServer: { command: 'npm start', url: `http://localhost:${port}`, reuseExistingServer: false,
    env: { PORT: String(port), COUNTDOWN_MS: '2000', RECONNECT_MS: '2000', RESULT_MS: '1500', ZONE_INTERVAL_MS: '20000' } },
});
