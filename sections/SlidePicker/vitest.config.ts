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
      // @nuxt/ui/vite resolves the #build/ui/* and #imports virtual modules
      // that USelectMenu (and other Nuxt UI v4 components) require at transform
      // time. Without this plugin, vitest cannot transform SelectMenu.vue.
      ui({
        // router: false — use the "none" stub so vue-router (a peer dep of
        // @nuxt/ui) is not required. The SlidePicker section does not use any
        // router-dependent components (no NuxtLink, no RouterLink).
        router: false,
        colorMode: false,
        ui: {
          colors: {
            primary: 'orange',
            secondary: 'blue',
            neutral: 'neutral',
          },
        },
      }),
      vue(),
    ],
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
