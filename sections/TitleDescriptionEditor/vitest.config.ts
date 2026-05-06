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
      // Nuxt UI v4 Vite plugin — required for UFormField, UInput, UTextarea
      // component resolution, #imports alias, and Tailwind v4 preprocessing.
      //
      // colorMode: false — Figma plugin panels use explicit theming via the
      // message bus; we don't want the iframe flipping on OS dark mode.
      ui({
        colorMode: false,
      }),
    ],
    resolve: {
      alias: {
        '@': resolve(root, 'src'),
        // vue-router is an optional peer dep of @nuxt/ui. The Vite plugin's
        // router stub re-exports from vue-router which isn't installed in this
        // section (no routing needed). We alias it to a minimal stub so the
        // Nuxt UI plugin initialises cleanly in the jsdom test environment.
        'vue-router': resolve(root, 'tests/__stubs__/vue-router.ts'),
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./tests/setup.ts'],
    },
  }),
);
