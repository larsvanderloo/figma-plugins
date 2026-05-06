// Dedicated Vite config for the Figma plugin code-side entry point.
//
// IMPORTANT: Figma's plugin runtime executes code.js as a plain script — it
// has no ES module support.  This config MUST produce a single self-contained
// IIFE with no `import` or `export` statements at the top level.
//
// Design decision (over one-config multi-output):
//   Sharing one vite.config.ts across the code (IIFE) and ui (ES modules)
//   entries is possible via multiple rollupOptions.output objects, but Vite's
//   HTML-entry handling and the @nuxt/ui plugin only make sense for the ui
//   build; injecting them into the code build silently inflates the bundle.
//   Two configs keep each build's plugin chain minimal and explicit, and make
//   it obvious which output settings apply to which artifact.
//
// Output: dist/code.js — IIFE, single file, all shared/* inlined.
//   - `format: 'iife'` wraps everything in (function(){...})()
//   - `inlineDynamicImports: true` prevents any split chunks
//   - No `@nuxt/ui`, no `vue` plugin — the code sandbox has no DOM
//
// Run via: `pnpm --filter @figma-plugins/welder-editor build`
// (package.json build script: vite build --config vite.code.config.ts &&
//  vite build --config vite.config.ts)
//
// Bundle visualizer is intentionally omitted here; it runs on the ui build
// (vite.config.ts) which is the larger artifact.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

const root = fileURLToPath(new URL('.', import.meta.url));

/**
 * Vite plugin: exposes dist/ui/index.html as a virtual module
 * 'virtual:ui-html' whose default export is the full HTML string,
 * assembled from ≤60 KB chunks to stay under Figma's sandbox
 * string-literal parser limit (anti-pattern 0004).
 *
 * Build order dependency: vite build (ui side) must run before
 * vite build --config vite.code.config.ts (code side) so that
 * dist/ui/index.html exists when this plugin reads it.
 * The package.json build script already enforces this order.
 */
function chunkedUiHtml(): Plugin {
  const VIRTUAL_ID = 'virtual:ui-html';
  const RESOLVED_ID = '\0' + VIRTUAL_ID;
  return {
    name: 'welder-chunked-ui-html',
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID;
    },
    load(id) {
      if (id !== RESOLVED_ID) return;
      const uiPath = resolve(root, 'dist/ui/index.html');
      const html = readFileSync(uiPath, 'utf-8');
      // Base64-encode before chunking so every chunk is pure ASCII [A-Za-z0-9+/=].
      // Without encoding, Rollup's string optimiser converts JSON string chunks
      // to template literals; the HTML contains backticks (inlined Vue/Nuxt UI JS)
      // which break the outer template literal with "Unexpected token {" at runtime.
      // atob() is available in Figma's plugin sandbox. (anti-pattern 0004 fix v2)
      const b64 = Buffer.from(html).toString('base64');
      const CHUNK_SIZE = 60_000;
      const chunks: string[] = [];
      for (let i = 0; i < b64.length; i += CHUNK_SIZE) {
        chunks.push(JSON.stringify(b64.slice(i, i + CHUNK_SIZE)));
      }
      return `export default atob([\n${chunks.join(',\n')}\n].join(''));`;
    },
  };
}

export default defineConfig({
  plugins: [chunkedUiHtml()],
  resolve: {
    alias: {
      '@code': resolve(root, 'code'),
      '@shared': resolve(root, 'shared'),
    },
  },
  build: {
    // Write only code.js; do not clear dist/ here — the ui build runs first
    // (see package.json build script) and already cleared dist/ with
    // emptyOutDir: true.  Clearing again here would wipe dist/ui/index.html.
    outDir: 'dist',
    emptyOutDir: false,
    // ES2017 target: Figma's plugin sandbox parser does NOT accept ES2020+
    // syntax — optional chaining `?.`, nullish coalescing `??`, etc. — and
    // throws "SyntaxError: Unexpected token" at plugin load. v0.2.1 reference
    // build documents this constraint in its esbuild.config.mjs. Transpile
    // down to ES2017 so these features become equivalent ternary/`if` chains
    // that the sandbox can parse.
    target: 'es2017',
    lib: {
      entry: resolve(root, 'code/main.ts'),
      formats: ['iife'],
      name: 'WelderEditorCode',
      fileName: () => 'code.js',
    },
    rollupOptions: {
      // Inline all imports — no split chunks, no external references.
      // `inlineDynamicImports` stops rollup from splitting shared/* into
      // separate files (the bug: dist/messages.js being emitted and then
      // imported at runtime, which Figma's sandbox rejects).
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
