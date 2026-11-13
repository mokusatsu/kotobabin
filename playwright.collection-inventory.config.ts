import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/e2e', testMatch: 'm6-inventory.launch.ts', workers: 1, timeout: 900000,
  outputDir: 'test-results/m6-inventory', reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'off', video: 'off' },
  webServer: process.env.CI ? { command: 'npx vite preview --host 127.0.0.1 --port 4173 --strictPort', url: 'http://127.0.0.1:4173', reuseExistingServer: false } : undefined,
});
