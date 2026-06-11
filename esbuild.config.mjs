// ============================================================
// esbuild — bouwt uitsluitend de plugin-thread (src/sandbox/main.ts
// -> dist/code.js). De iframe-UI wordt gebouwd door Vite naar
// dist/ui.html; esbuild laadt die file als string via de
// chunked-text-loader zodat main.ts hem aan figma.showUI kan geven.
//
// Buildvolgorde: npm run build -> vite (dist/ui.html) -> esbuild
// (dist/code.js). In watch-mode draaien beide tools tegelijk
// (concurrently) zodat elke UI-wijziging een nieuwe ui.html
// produceert die bij de eerstvolgende plugin-herbouw is inbegrepen.
//
// chunked-text-loader: de gegenereerde ui.html kan honderden KB groot
// zijn. Een enkele JS-string-literal van die grootte gooit Figma's
// sandbox-parser een "SyntaxError: Invalid or unexpected token" bij
// load. Oplossing: splits de HTML in chunks van ~60KB en join tijdens
// plugin-init. Elk chunk is een op zichzelf staand string-literal dat
// ruim onder welke parser-limiet dan ook valt.
//
// Target ES2017: de plugin-sandbox accepteert geen optional chaining,
// nullish coalescing of catch-without-binding (memory
// feedback_figma_runtime.md). De UI-bundle (Vite) mag wél ES2020+.
// ============================================================

import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isWatch = process.argv.includes('--watch');
const isDebug = process.env.PLUGIN_DEBUG === '1';
const debugLogEndpoint = isDebug ? (process.env.PLUGIN_DEBUG_LOG_ENDPOINT ?? '') : '';

const distDir = path.join(__dirname, 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

/**
 * esbuild-plugin: laadt .html-bestanden als een JS-module die een
 * samengevoegde string exporteert, opgebouwd uit kleine chunks.
 * Voorkomt "Invalid or unexpected token" bij grote single-literal
 * HTML-strings in Figma's plugin-sandbox.
 */
function chunkedTextLoader(options = {}) {
  const chunkSize = options.chunkSize ?? 60000;
  return {
    name: 'chunked-text',
    setup(build) {
      build.onLoad({ filter: /\.html$/ }, async (args) => {
        const text = await fs.promises.readFile(args.path, 'utf8');
        const chunks = [];
        for (let i = 0; i < text.length; i += chunkSize) {
          chunks.push(JSON.stringify(text.slice(i, i + chunkSize)));
        }
        const contents =
          chunks.length === 0
            ? 'export default "";'
            : `export default [\n${chunks.join(',\n')}\n].join("");`;
        return {
          contents,
          loader: 'js',
        };
      });
    },
  };
}

const codeContext = await esbuild.context({
  entryPoints: ['src/sandbox/main.ts'],
  bundle: true,
  outfile: 'dist/code.js',
  platform: 'browser',
  target: 'es2017',
  format: 'iife',
  sourcemap: isDebug ? 'inline' : false,
  define: {
    __PLUGIN_DEBUG__: isDebug ? 'true' : 'false',
    __PLUGIN_DEBUG_SOURCE__: JSON.stringify('sandbox'),
    __PLUGIN_DEBUG_LOG_ENDPOINT__: JSON.stringify(debugLogEndpoint),
  },
  logLevel: 'info',
  plugins: [chunkedTextLoader({ chunkSize: 60000 })],
});

if (isWatch) {
  await codeContext.watch();
  console.log('[esbuild] Watching src/sandbox/main.ts...' + (isDebug ? ' (debug)' : ''));
} else {
  await codeContext.rebuild();
  await codeContext.dispose();
  console.log('[esbuild] Plugin build complete.' + (isDebug ? ' (debug)' : ''));
}
