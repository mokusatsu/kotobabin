import { defineConfig } from '@playwright/test';
export default defineConfig({
 testDir:'tests/e2e',testMatch:['world-map-minimum.spec.ts','world-stage.spec.ts','layout-settings.spec.ts','cosmetics.spec.ts'],workers:1,
 use:{baseURL:'http://127.0.0.1:4173',trace:'retain-on-failure'},
 webServer:process.env.CI?{command:'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort',url:'http://127.0.0.1:4173',reuseExistingServer:false}:undefined,
 outputDir:'test-results/world-layout',reporter:'list',
});
