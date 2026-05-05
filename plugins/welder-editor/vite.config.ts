// Vite config for a Figma plugin. Two entries:
//   - code/main.ts → dist/code.js (IIFE — Figma sandbox doesn't support ES modules)
//   - ui/index.html → dist/ui.html (standard Vite app, loaded in iframe)
//
// manifest.json references dist/code.js and dist/ui.html. During `vite build
// --watch` (dev), Vite serves the ui from a localhost URL; in dev, manually
// re-import the manifest in Figma after big changes to refresh.
//
// Bundle visualizer: active only during production builds (`pnpm build`).
// Outputs dist/bundle-stats.html — use it to check against the ADR-0003 budget.
// Never runs in dev/watch mode so it doesn't slow the edit loop.

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { visualizer } from 'rollup-plugin-visualizer';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

// `command` is 'build' for `pnpm build` / `pnpm preview` and 'serve' for
// `pnpm dev`. Only attach the visualizer plugin during production builds so
// it never interferes with the HMR cycle or vitest.
export default defineConfig(({ command, mode }) => ({
  plugins: [
    vue(),
    ...(command === 'build' && mode !== 'test'
      ? [
          visualizer({
            filename: 'dist/bundle-stats.html',
            gzipSize: true,
            brotliSize: true,
            open: false,
          }),
        ]
      : []),
  ],
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
}));
