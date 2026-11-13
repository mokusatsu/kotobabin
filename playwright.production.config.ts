import { defineConfig } from '@playwright/test';

// The independent reviewer uses rendered UI only, so the same journey can run
// against the exact static production output shipped to Sites.
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: 'sakurai-review.spec.ts',
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  webServer: {
    command: 'npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
  },
  reporter: 'list',
});
