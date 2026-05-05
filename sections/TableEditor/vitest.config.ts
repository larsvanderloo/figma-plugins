import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from '../../vitest.config';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));

export default mergeConfig(
  baseConfig,
  defineConfig({
    resolve: {
      alias: {
        '@': resolve(root, 'src'),
      },
    },
    test: {
      // Pure TypeScript module — no DOM required for schema tests.
      environment: 'node',
    },
  }),
);
