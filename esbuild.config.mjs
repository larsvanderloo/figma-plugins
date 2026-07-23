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

// Figma's sandbox parser throws "SyntaxError: Invalid or unexpected token" on very large
// single string literals, so .html imports are emitted as ~60KB chunks joined at load time.
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
