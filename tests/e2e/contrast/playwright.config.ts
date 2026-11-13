import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
export default defineConfig({ testDir: '.', testMatch: 'contrast.audit.ts', timeout: 240000, workers: 1, retries: 0,
  outputDir: '../../../test-results/contrast', use: { baseURL: 'http://127.0.0.1:4173', viewport: { width: 1180, height: 720 }, trace: 'retain-on-failure' },
  webServer: { command: 'npx vite preview --host 127.0.0.1 --port 4173 --strictPort', url: 'http://127.0.0.1:4173', cwd: fileURLToPath(new URL('../../../', import.meta.url)), reuseExistingServer: false }, reporter: 'list' });
