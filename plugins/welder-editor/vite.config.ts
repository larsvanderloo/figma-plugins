// Vite config for a Figma plugin. Two entries:
//   - code/main.ts → dist/code.js (IIFE — Figma sandbox doesn't support ES modules)
//   - ui/index.html → dist/ui.html (standard Vite app, loaded in iframe)
//
// manifest.json references dist/code.js and dist/ui.html. During `vite build
// --watch` (dev), Vite serves the ui from a localhost URL; in dev, manually
// re-import the manifest in Figma after big changes to refresh.

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(root, 'ui'),
      '@code': resolve(root, 'code'),
      '@shared': resolve(root, 'shared'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        code: resolve(root, 'code/main.ts'),
        ui: resolve(root, 'ui/index.html'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name][extname]',
      },
    },
  },
});
