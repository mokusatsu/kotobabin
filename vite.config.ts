import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  base: './',
  define: {
    __ASSET_VERSION__: JSON.stringify(Date.now().toString(36)),
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@spec-data': resolve(__dirname, 'spec/initial/data'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        debug: resolve(__dirname, 'debug/index.html'),
      },
    },
  },
});
