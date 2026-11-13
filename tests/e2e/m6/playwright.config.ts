import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// CI production-output audit only. Do not launch an alternate local managed preview.
export default defineConfig({
  testDir: '.', testMatch: 'resilience.audit.ts', timeout: 45000, workers: 1, retries: 0,
  outputDir: '../../../test-results/m6',
  use: { baseURL: 'http://127.0.0.1:4173', viewport: { width: 1180, height: 720 }, trace: 'retain-on-failure' },
  webServer: { command: 'npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
    cwd: fileURLToPath(new URL('../../../', import.meta.url)), url: 'http://127.0.0.1:4173', reuseExistingServer: false },
  reporter: 'list',
});
