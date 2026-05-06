// Vite config for the Figma plugin UI entry (iframe side only).
//
//   ui/index.html → dist/ui/index.html (single self-contained HTML file)
//
// KEY CONSTRAINT: Figma's plugin runtime loads manifest.ui as a self-contained
// HTML string (__html__ global). The string is injected into a sandboxed iframe
// that has NO server — any external <script src=...> or <link href=...>
// references will silently fail (the sandbox can't fetch /ui.js or /ui.css from
// a data: URL origin). This caused the "Syntax error on line 1: Unexpected token {"
// crash: the iframe tried to evaluate an incomplete script tag.
//
// Fix: use vite-plugin-singlefile to inline ALL JS and CSS into a single
// dist/ui/index.html. Figma then receives a fully self-contained HTML string.
//
// The code-side entry (code/main.ts → dist/code.js) is built by a separate
// config — vite.code.config.ts — because Figma's plugin runtime requires a
// single-file IIFE with no ES import/export statements.  Merging both entries
// into one config caused Rollup to split shared/messages.ts into a separate
// dist/messages.js chunk, which the sandbox rejected with "Syntax error on
// line 1: Unexpected token".
//
// Build script (package.json): `vite build && vite build --config vite.code.config.ts`
//   1. This config clears dist/ (emptyOutDir: true) and writes dist/ui/index.html.
//   2. vite.code.config.ts appends dist/code.js without clearing.
//
// Output structure:
//   dist/ui/index.html — single-file bundle (JS + CSS inlined)
//   dist/code.js       — IIFE plugin code (written by vite.code.config.ts)
//
// Bundle visualizer: active only during production builds (`pnpm build`).
// Outputs dist/bundle-stats.html — use it to check against the ADR-0014 budget.
// Never runs in dev/watch mode so it doesn't slow the edit loop.

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import ui from '@nuxt/ui/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { visualizer } from 'rollup-plugin-visualizer';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

// `command` is 'build' for `pnpm build` / `pnpm preview` and 'serve' for
// `pnpm dev'. Only attach the visualizer plugin during production builds so
// it never interferes with the HMR cycle or vitest.
export default defineConfig(({ command, mode }) => ({
  plugins: [
    vue(),
    // Nuxt UI v4 Vite plugin — configures Tailwind CSS v4 preprocessing,
    // registers the Nuxt UI component transform, and injects the theme.
    //
    // colorMode: false — force light mode.  Figma's iframe inherits the host
    // OS prefers-color-scheme, but Welder branding is always light.  Disabling
    // colorMode prevents the iframe from flipping to dark on dark-mode desktops.
    //
    // colors — Welder palette:
    //   primary = 'orange'   → orange-500 (#ff6900 in Tailwind oklch) is the
    //                          closest to Welder Oranje (#ff7700); all 11 shades
    //                          (50–950) are available for hover/active/focus states
    //                          on UButton, UInput focus ring, UBadge, USwitch, etc.
    //   secondary = 'blue'   → accent colour for secondary actions (matches v0.2.1)
    //   neutral  = 'neutral' → pure gray for panel backgrounds, disabled states,
    //                          placeholder text, and border colours.
    ui({
      colorMode: false,
      ui: {
        colors: {
          primary: 'orange',
          secondary: 'blue',
          neutral: 'neutral',
        },
      },
    }),
    // viteSingleFile: inlines all JS and CSS into the HTML output.
    // This is required for Figma's plugin sandbox which loads the ui path as
    // a raw HTML string (__html__) with no server to resolve external assets.
    viteSingleFile(),
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
    // viteSingleFile requires assetsInlineLimit: Infinity so all assets
    // (fonts, images, etc.) are inlined as data URIs rather than left as
    // external files that the sandbox can't fetch.
    assetsInlineLimit: Infinity,
    // cssCodeSplit: false ensures CSS is not split into separate chunks;
    // viteSingleFile will inline the single CSS into the HTML <style> tag.
    cssCodeSplit: false,
    // Target modern Chromium — Figma's iframe sandbox is Chromium-based and
    // supports ES2020+.  The ES2017 restriction applies only to code.js
    // (the Figma plugin sandbox), not to the iframe.
    target: 'es2020',
    rollupOptions: {
      input: resolve(root, 'ui/index.html'),
      output: {
        // Single entry; no chunks needed — viteSingleFile handles inlining.
        // Keep predictable names for the visualizer report.
        entryFileNames: 'ui.js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name][extname]',
        // Prevent code-splitting: everything in one JS file so singlefile
        // can inline it into the HTML in one pass.
        manualChunks: undefined,
      },
    },
  },
}));
