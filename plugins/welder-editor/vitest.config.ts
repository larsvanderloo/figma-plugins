import { defineConfig, mergeConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import ui from '@nuxt/ui/vite';
import baseConfig from '../../vitest.config';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));

export default mergeConfig(
  baseConfig,
  defineConfig({
    plugins: [
      vue(),
      // Nuxt UI v4 Vite plugin — required for plugin-level integration tests
      // (tests/ui/*) that mount sections rendering UFormField/UInput/etc.
      // Without this, vitest can't resolve `#build/ui/*` virtual aliases that
      // Nuxt UI components emit, and `getByRole('textbox', {name:/heading/i})`
      // queries fail because UFormField's auto-id label association doesn't
      // execute. Mirrors plugins/welder-editor/vite.config.ts (PR #53 / 5.0).
      ui({
        colorMode: false,
        ui: { colors: { primary: 'orange', secondary: 'blue', neutral: 'neutral' } },
      }),
    ],
    resolve: {
      alias: {
        '@': resolve(root, 'ui'),
        '@code': resolve(root, 'code'),
        '@shared': resolve(root, 'shared'),
        // Nuxt UI's runtime stubs reference vue-router as an optional peer
        // dep. We don't ship a router; alias to a no-op stub so vitest can
        // resolve the import. See tests/__stubs__/vue-router.ts.
        'vue-router': resolve(root, 'tests/__stubs__/vue-router.ts'),
      },
    },
    test: {
      // Ambient per-test cleanup and Pinia bootstrap. Registered globally so
      // no test file needs to repeat afterEach(cleanup) or the
      // setActivePinia(createPinia()) pattern. See tests/setup.ts for details.
      // Node 25 compatibility: tests/setup.ts installs a localStorage shim before
      // Pinia is dynamically imported. See tests/setup.ts for the full explanation.
      //
      // setup.code.ts installs the global figma stub (figma.mixed sentinel) for
      // code-side tests (node environment). It uses an `if undefined` guard so it
      // is harmless in jsdom — ui-side tests never import figma.* code. Inline
      // figma stubs in wrappers.test.ts have been removed in favour of this file.
      setupFiles: ['./tests/setup.ts', './tests/setup.code.ts'],
      // ui-side tests need a DOM; code-side and tools tests run in node.
      // tests/ui/**   → jsdom  (default)
      // tests/code/** → node
      // tests/tools/** → node (ESLint RuleTester; no DOM needed)
      environment: 'jsdom',
      environmentMatchGlobs: [
        ['tests/code/**', 'node'],
        ['tests/tools/**', 'node'],
      ],
    },
  }),
);
