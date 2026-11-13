import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['tests/e2e/m6/fixture.generate.ts'] } });
