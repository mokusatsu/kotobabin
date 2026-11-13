import { defineConfig } from '@playwright/test';
import base from '../../tests/e2e/m6/playwright.config';
export default defineConfig(base, { testDir: '.', testMatch: 'input-profile.spec.ts', timeout: 120000,
  outputDir: '../../test-results/input-profile', use: { ...base.use, browserName: 'chromium', trace: 'off' } });
