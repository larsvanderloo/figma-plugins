// Vite config for the Figma plugin UI entry (iframe side only).
//
//   ui/index.html → dist/ui/index.html (standard Vite app, loaded in iframe)
//
// The code-side entry (code/main.ts → dist/code.js) is built by a separate
// config — vite.code.config.ts — because Figma's plugin runtime requires a
// single-file IIFE with no ES import/export statements.  Merging both entries
// into one config caused Rollup to split shared/messages.ts into a separate
// dist/messages.js chunk, which the sandbox rejected with "Syntax error on
// line 1: Unexpected token".
//
// Build script (package.json): `vite build && vite build --config vite.code.config.ts`
//   1. This config clears dist/ (emptyOutDir: true) and writes ui artifacts.
//   2. vite.code.config.ts appends dist/code.js without clearing.
//
// Rollup places HTML entries in a subdirectory named after the entry key, so
// the named entry `ui` produces dist/ui/index.html, not dist/ui.html.
// manifest.json references dist/code.js and dist/ui/index.html accordingly.
// During `vite build --watch` (dev), run both watch processes or use the
// dedicated dev scripts; manually re-import the manifest in Figma after changes.
//
// Bundle visualizer: active only during production builds (`pnpm build`).
// Outputs dist/bundle-stats.html — use it to check against the ADR-0003 budget.
// Never runs in dev/watch mode so it doesn't slow the edit loop.

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import ui from '@nuxt/ui/vite';
import { visualizer } from 'rollup-plugin-visualizer';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import welderTheme from './app.config';

const root = fileURLToPath(new URL('.', import.meta.url));

// `command` is 'build' for `pnpm build` / `pnpm preview` and 'serve' for
// `pnpm dev`. Only attach the visualizer plugin during production builds so
// it never interferes with the HMR cycle or vitest.
export default defineConfig(({ command, mode }) => ({
  plugins: [
    vue(),
    ui({ ui: welderTheme }),
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
