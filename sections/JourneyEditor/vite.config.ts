// sections/JourneyEditor/vite.config.ts
//
// Standalone Vite config for the JourneyEditor section.
//
// @nuxt/ui/vite is included so that UFormField, UInput, UInputNumber, and
// UButton virtual module aliases (#build/ui/*) are resolved at build and
// test time without a full Nuxt app context. This is the same plugin wired
// in plugins/welder-editor/vite.config.ts.
//
// Owner: ui-engineer.
// Resolves: MON-2894486835 (Sprint 5, Task 5.8).

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import ui from '@nuxt/ui/vite';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [
    vue(),
    // Nuxt UI v4 vite plugin — resolves #build/ui/* virtual modules so that
    // UFormField, UInput, UInputNumber, and UButton can be imported directly
    // from '@nuxt/ui' in section packages that run without a Nuxt app context.
    ui({
      colorMode: false,
      ui: {
        colors: {
          primary: 'orange',
          secondary: 'blue',
          neutral: 'neutral',
        },
      },
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(root, 'src'),
    },
  },
});
