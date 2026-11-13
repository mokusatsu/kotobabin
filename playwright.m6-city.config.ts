import { defineConfig } from '@playwright/test';
// Uses the integration owner's existing production build endpoint. Never starts
// another preview/dev server or imports source modules into the browser.
export default defineConfig({
  testDir: 'tests/e2e/m6', testMatch: 'city.audit.ts', workers: 1,
  timeout: 180_000, expect: { timeout: 10_000 },
  use: { baseURL: process.env.M6_CITY_BASE_URL, viewport: { width: 1180, height: 720 }, trace: 'retain-on-failure' },
  reporter: 'list', outputDir: 'test-results/m6-city',
});
