// ============================================================
// Vite config — bouwt de iframe-UI (Vue 3 + Nuxt UI v4) naar
// één zelfstandig dist/ui.html (JS + CSS inline). Deze file
// wordt daarna door esbuild (plugin-side) als string geimporteerd
// en doorgegeven aan figma.showUI(uiHtml, ...).
// ============================================================

import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import { readFileSync } from 'node:fs';
import vue from '@vitejs/plugin-vue';
import ui from '@nuxt/ui/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Read the plugin's version from package.json at build time so the iframe
// can render a small "v0.x.y" badge in the UI without having to know about
// the manifest. Updated whenever you bump package.json before tagging.
const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8'),
) as { version: string };

/**
 * Vite's input is plugin-src/ui/index.html; plugin-side esbuild importeert
 * via `import uiHtml from './dist/ui.html'`. Deze plugin hernoemt de HTML-
 * output van `index.html` naar `ui.html` in de post-write stap.
 *
 * Rolldown/Rollup-compat: we muteren de bundle niet direct, maar verplaatsen
 * het bestand op disk na write (nieuwe Vite 8 / Rolldown-API).
 */
function renameIndexToUi(): Plugin {
  return {
    name: 'rename-index-to-ui',
    enforce: 'post',
    async writeBundle(options) {
      const fs = await import('node:fs/promises');
      const path = await import('node:path');
      const outDir = options.dir ?? 'dist';
      const srcPath = path.join(outDir, 'index.html');
      const destPath = path.join(outDir, 'ui.html');
      try {
        await fs.rename(srcPath, destPath);
      } catch (err: unknown) {
        // Als index.html niet bestaat (al hernoemd in watch-rebuild), geen fout.
        const e = err as { code?: string };
        if (e.code !== 'ENOENT') throw err;
      }
    },
  };
}

export default defineConfig({
  root: fileURLToPath(new URL('./plugin-src/ui', import.meta.url)),
  define: {
    // Replaced verbatim at bundle-time. Type declared in ui/env.d.ts.
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    vue(),
    ui({
      // Forceer lichte modus: Figma-iframe volgt normaal `prefers-color-scheme`
      // van de user, maar we willen altijd Welder-branding in licht tonen.
      colorMode: false,
      ui: {
        colors: {
          primary: 'orange',
          secondary: 'blue',
          neutral: 'neutral',
        },
      },
    }),
    viteSingleFile(),
    renameIndexToUi(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./plugin-src/ui', import.meta.url)),
    },
  },
  build: {
    outDir: fileURLToPath(new URL('./dist', import.meta.url)),
    emptyOutDir: false,
    // Target modern browsers — Figma's iframe sandbox is Chromium-based en
    // ondersteunt ES2020+ ruimschoots (plugin-sandbox is de ES2017-restrictie,
    // niet de iframe).
    target: 'es2020',
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    rollupOptions: {
      output: {
        // Single-file-plugin verwacht 1 bundle; geen manualChunks.
        inlineDynamicImports: true,
        entryFileNames: 'ui.js',
        assetFileNames: 'ui.[ext]',
      },
    },
  },
});
