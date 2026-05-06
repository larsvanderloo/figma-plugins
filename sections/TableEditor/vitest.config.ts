import { defineConfig, mergeConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import ui from '@nuxt/ui/vite';
import baseConfig from '../../vitest.config';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));

// Sprint 5 Wave 3 (MON-2894506892): TableEditor migrated to Nuxt UI v4 primitives.
//
// @nuxt/ui/vite is required so vitest can resolve the `@nuxt/ui/vue-plugin`
// virtual module used in tests/TableEditor.test.ts and tests/perf.test.ts
// (global: { plugins: [ui] } in each render() call).
//
// router: false — TableEditor has no router dependency; stub vue-router with
// @nuxt/ui's built-in "none" stub (exports no-op useRoute/useRouter) so the
// optional vue-router peer dep is not required to be installed.

export default mergeConfig(
  baseConfig,
  defineConfig({
    plugins: [ui({ router: false }), vue()],
    resolve: {
      alias: {
        '@': resolve(root, 'src'),
      },
    },
    test: {
      // csv-schema tests run in node; TableEditor.vue tests require jsdom.
      // We use jsdom for all tests in this package to keep a single config.
      environment: 'jsdom',
      setupFiles: ['./tests/setup.ts'],
    },
  }),
);
