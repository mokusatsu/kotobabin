import { defineConfig } from '@playwright/test';
export default defineConfig({testDir:'.',testMatch:'observe.spec.ts',timeout:180000,workers:1,reporter:'line',use:{baseURL:'http://127.0.0.1:4173',viewport:{width:1180,height:720}},projects:[{name:'chromium',use:{browserName:'chromium'}},{name:'webkit',use:{browserName:'webkit'}}]});
