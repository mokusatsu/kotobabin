import { defineConfig } from '@playwright/test';
import production from './playwright.production.config';

// Dedicated CI-only repeated audit against the static production output.
export default defineConfig(production, {
  testMatch: 'profile-ui.spec.ts', outputDir: 'test-results/ownership', workers: 1,
});
