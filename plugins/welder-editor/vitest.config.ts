import { defineConfig, mergeConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import baseConfig from '../../vitest.config';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));

export default mergeConfig(
  baseConfig,
  defineConfig({
    plugins: [vue()],
    resolve: {
      alias: {
        '@': resolve(root, 'ui'),
        '@code': resolve(root, 'code'),
        '@shared': resolve(root, 'shared'),
      },
    },
    test: {
      // Ambient per-test cleanup and Pinia bootstrap. Registered globally so
      // no test file needs to repeat afterEach(cleanup) or the
      // setActivePinia(createPinia()) pattern. See tests/setup.ts for details.
      // Node 25 compatibility: tests/setup.ts installs a localStorage shim before
      // Pinia is dynamically imported. See tests/setup.ts for the full explanation.
      setupFiles: ['./tests/setup.ts'],
      // ui-side tests need a DOM; code-side tests run in node. The split is
      // by directory: tests/ui/* uses jsdom, tests/code/* uses node.
      environment: 'jsdom',
      environmentMatchGlobs: [['tests/code/**', 'node']],
    },
  }),
);
