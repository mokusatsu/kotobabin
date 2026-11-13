import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e/m6', testMatch: 'route-geometry.audit.ts', workers: 1, timeout: 60_000,
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  webServer: process.env.CI ? { command: 'npx vite preview --host 127.0.0.1 --port 4173 --strictPort', url: 'http://127.0.0.1:4173', reuseExistingServer: false } : undefined,
  outputDir: 'test-results/route-geometry', reporter: 'list',
});
