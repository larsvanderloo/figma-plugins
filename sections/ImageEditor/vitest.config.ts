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
        // Mock cropperjs CSS import — jsdom does not process stylesheets and
        // cropperjs/dist/cropper.css causes a parse error in the test runner.
        'cropperjs/dist/cropper.css': resolve(root, 'tests/__mocks__/cropper.css.ts'),
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./tests/setup.ts'],
    },
  }),
);
