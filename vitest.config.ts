// Root vitest config. Per-package vitest.config.ts files extend this when
// they need plugin-specific test setup (jsdom for ui-side, no env for
// code-side). Most packages can rely on this base.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node', // ui-side packages override to "jsdom"
    globals: false,
    // packages without test files (e.g., packages/figma-api before its first test)
    // shouldn't fail CI. Promote to false once every package has at least one test.
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['**/_template/**', '**/dist/**', '**/*.config.*', '**/*.stories.*'],
    },
  },
});
