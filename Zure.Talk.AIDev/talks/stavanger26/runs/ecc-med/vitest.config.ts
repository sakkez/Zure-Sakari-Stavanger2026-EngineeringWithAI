import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 5000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      // client.ts runs in the browser and is covered by the Playwright suite; server.ts is the process entry point.
      exclude: ['src/client.ts', 'src/server.ts'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
