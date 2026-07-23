// Builds the iframe UI into one self-contained dist/ui.html (JS + CSS inlined);
// esbuild then imports that file as a string and passes it to figma.showUI.

import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath, URL } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vue from '@vitejs/plugin-vue';
import ui from '@nuxt/ui/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const isDebug = process.env.PLUGIN_DEBUG === '1';
const debugLogEndpoint = isDebug ? (process.env.PLUGIN_DEBUG_LOG_ENDPOINT ?? '') : '';
const projectRoot = fileURLToPath(new URL('.', import.meta.url));

// Version comes from package.json via `define` at bundle time — no generated file.
const appVersion = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
).version as string;
const uiIndexHtml = fileURLToPath(new URL('./src/ui/index.html', import.meta.url));
const uiAutoImportsDts = fileURLToPath(new URL('./src/ui/auto-imports.d.ts', import.meta.url));
const uiComponentsDts = fileURLToPath(new URL('./src/ui/components.d.ts', import.meta.url));

// Vite emits index.html but plugin-side esbuild imports './dist/ui.html', so rename
// after write. Moving the file on disk (instead of mutating the bundle) keeps this
// compatible with both Rolldown (Vite 8) and Rollup.
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
          // ENOENT means it was already renamed in a watch rebuild — not an error.
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
    // Each define needs a matching ambient declaration in ui/env.d.ts.
    __PLUGIN_DEBUG__: JSON.stringify(isDebug),
    __PLUGIN_DEBUG_SOURCE__: JSON.stringify('ui'),
    __PLUGIN_DEBUG_LOG_ENDPOINT__: JSON.stringify(debugLogEndpoint),
    __APP_VERSION__: JSON.stringify(appVersion),
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
    // The ES2017 restriction is for the plugin sandbox only; Figma's iframe is
    // Chromium-based, so ES2020 is safe here.
    target: 'es2020',
    sourcemap: isDebug ? 'inline' : false,
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    rollupOptions: {
      input: uiIndexHtml,
      output: {
        // viteSingleFile expects a single bundle — no manualChunks.
        inlineDynamicImports: true,
        entryFileNames: 'ui.js',
        assetFileNames: 'ui.[ext]',
      },
    },
  },
});
