import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig(base, {
  testMatch: '**/*.measure.ts', timeout: 240000, outputDir: '../../../test-results/m6-performance',
  use: { ...base.use, browserName: 'chromium', trace: 'off' },
});
