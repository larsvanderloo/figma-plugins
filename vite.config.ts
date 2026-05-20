// ============================================================
// Vite config — bouwt de iframe-UI (Vue 3 + Nuxt UI v4) naar
// één zelfstandig dist/ui.html (JS + CSS inline). Deze file
// wordt daarna door esbuild (plugin-side) als string geimporteerd
// en doorgegeven aan figma.showUI(uiHtml, ...).
// ============================================================

import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import path from 'node:path';
import vue from '@vitejs/plugin-vue';
import ui from '@nuxt/ui/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const isDebug = process.env.PLUGIN_DEBUG === '1';
const debugLogEndpoint = isDebug ? (process.env.PLUGIN_DEBUG_LOG_ENDPOINT ?? '') : '';
const projectRoot = fileURLToPath(new URL('.', import.meta.url));
const uiIndexHtml = fileURLToPath(new URL('./src/ui/index.html', import.meta.url));
const uiAutoImportsDts = fileURLToPath(new URL('./src/ui/auto-imports.d.ts', import.meta.url));
const uiComponentsDts = fileURLToPath(new URL('./src/ui/components.d.ts', import.meta.url));

/**
 * Vite's input is src/ui/index.html; plugin-side esbuild importeert
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
      const outDirOption = options.dir ?? fileURLToPath(new URL('./dist', import.meta.url));
      const outDir = path.isAbsolute(outDirOption)
        ? outDirOption
        : path.resolve(projectRoot, outDirOption);
      const candidatePaths = [path.join(outDir, 'index.html'), path.join(outDir, 'src', 'ui', 'index.html')];
      const destPath = path.join(outDir, 'ui.html');
      for (const srcPath of candidatePaths) {
        try {
          await fs.rename(srcPath, destPath);
          await fs.rm(path.join(outDir, 'src'), { recursive: true, force: true });
          return;
        } catch (err: unknown) {
          // Als index.html niet bestaat (al hernoemd in watch-rebuild), geen fout.
          const e = err as { code?: string };
          if (e.code !== 'ENOENT') throw err;
        }
      }
    },
  };
}

function serveUiIndexAtRoot(): Plugin {
  return {
    name: 'serve-ui-index-at-root',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/' || req.url === '/index.html') {
          res.statusCode = 302;
          res.setHeader('Location', '/src/ui/index.html');
          res.end();
          return;
        }

        next();
      });
    },
  };
}

export default defineConfig({
  root: projectRoot,
  define: {
    // Replaced verbatim at bundle-time. Type declared in ui/env.d.ts.
    __PLUGIN_DEBUG__: JSON.stringify(isDebug),
    __PLUGIN_DEBUG_SOURCE__: JSON.stringify('ui'),
    __PLUGIN_DEBUG_LOG_ENDPOINT__: JSON.stringify(debugLogEndpoint),
  },
  plugins: [
    serveUiIndexAtRoot(),
    vue(),
    ui({
      colorMode: false,
      autoImport: {
        dts: uiAutoImportsDts,
      },
      components: {
        dts: uiComponentsDts,
      },
      ui: {
        colors: {
          primary: 'orange',
          neutral: 'neutral',
        },
        container: {
          base: 'w-full mx-auto px-2 pt-1 pb-6',
        },
        card: {
          slots: {
            header: 'p-5',
            body: 'p-5 space-y-4',
          },
          variants: {
            variant: {
              solid: {
                root: 'bg-default text-default shadow-[0_1px_2px_0_rgb(0_0_0/0.03),0_4px_16px_-4px_rgb(0_0_0/0.04)]',
                title: 'text-default',
                description: 'text-muted',
              },
            },
          },
        },
      },
    }),
    viteSingleFile(),
    renameIndexToUi(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src/ui', import.meta.url)),
    },
  },
  build: {
    outDir: fileURLToPath(new URL('./dist', import.meta.url)),
    emptyOutDir: false,
    // Target modern browsers — Figma's iframe sandbox is Chromium-based en
    // ondersteunt ES2020+ ruimschoots (plugin-sandbox is de ES2017-restrictie,
    // niet de iframe).
    target: 'es2020',
    sourcemap: isDebug ? 'inline' : false,
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    rollupOptions: {
      input: uiIndexHtml,
      output: {
        // Single-file-plugin verwacht 1 bundle; geen manualChunks.
        inlineDynamicImports: true,
        entryFileNames: 'ui.js',
        assetFileNames: 'ui.[ext]',
      },
    },
  },
});
