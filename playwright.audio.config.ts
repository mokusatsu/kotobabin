import { defineConfig } from '@playwright/test';

// Audio journeys use rendered controls and native Web Audio against the static build.
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: 'audio.spec.ts',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  webServer: {
    command: 'npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
  },
  reporter: 'list',
});
