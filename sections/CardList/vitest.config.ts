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
        '@': resolve(root, 'src'),
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./tests/setup.ts'],
    },
  }),
);
