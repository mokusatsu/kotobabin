import { defineConfig } from '@playwright/test';
// Static production preview belongs to GitHub CI only; never launch a local managed substitute.
export default defineConfig({
  testDir: 'tests/e2e/m6', testMatch: 'city.audit.ts', workers: 1,
  timeout: 180_000, expect: { timeout: 10_000 },
  use: { baseURL: process.env.M6_CITY_BASE_URL ?? 'http://127.0.0.1:4173', viewport: { width: 1180, height: 720 }, trace: 'retain-on-failure' },
  webServer: process.env.CI ? { command: 'npx vite preview --host 127.0.0.1 --port 4173 --strictPort', url: 'http://127.0.0.1:4173', reuseExistingServer: false } : undefined,
  reporter: 'list', outputDir: 'test-results/m6-city',
});
