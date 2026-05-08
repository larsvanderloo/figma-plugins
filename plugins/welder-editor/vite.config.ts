// ============================================================
// Vite config — bouwt de iframe-UI (Vue 3 + Nuxt UI v4) naar
// één zelfstandig dist/ui.html (JS + CSS inline). Deze file
// wordt daarna door esbuild (plugin-side) als string geimporteerd
// en doorgegeven aan figma.showUI(uiHtml, ...).
// ============================================================

import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import vue from '@vitejs/plugin-vue';
import ui from '@nuxt/ui/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Resolve the iframe's "v0.x.y" badge version. Source priority:
 *
 *   1. The most recent `welder-editor@v*` git tag (via `git describe`).
 *      This auto-tracks tagging without anyone having to bump package.json
 *      — fixes the long-running drift where local dev builds and CI
 *      release zips both showed stale badges after a tag bump.
 *   2. package.json — fallback for environments without git (e.g. shallow
 *      checkouts, CI containers without the .git directory).
 *
 * The release workflow checks out the tagged commit, so step 1 returns
 * the exact tag of the build. Local dev returns the latest tag (with no
 * commits-ahead suffix — `--abbrev=0` is intentional, the badge stays
 * stable between tags rather than churning on every commit).
 */
function resolvePluginVersion(): string {
  try {
    const tag = execSync("git describe --tags --match 'welder-editor@v*' --abbrev=0", {
      cwd: fileURLToPath(new URL('.', import.meta.url)),
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    if (tag.startsWith('welder-editor@v')) {
      return tag.slice('welder-editor@v'.length);
    }
  } catch (_e) {
    // No git, no matching tag, or shallow checkout — fall through.
  }
  const pkg = JSON.parse(
    readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf-8'),
  ) as { version: string };
  return pkg.version;
}

const pluginVersion = resolvePluginVersion();

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
    __APP_VERSION__: JSON.stringify(pluginVersion),
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
