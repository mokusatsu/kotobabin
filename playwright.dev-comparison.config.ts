import { defineConfig } from '@playwright/test';
import production from './playwright.production.config';
export default defineConfig(production, { testMatch: 'dev-comparison.spec.ts', outputDir: 'test-results/dev-comparison', workers: 1 });
