// vitest config for tools/eslint-rules.
// ESLint RuleTester tests run in node — no DOM needed.

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
  },
});
