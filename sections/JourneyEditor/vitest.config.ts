import { mergeConfig } from 'vitest/config';
import baseConfig from '../../vitest.config';
import viteConfig from './vite.config';

// Extend the workspace base config with:
//   - The section's vite.config (includes @nuxt/ui/vite for UInput/UFormField resolution).
//   - jsdom environment + setup file for @testing-library/vue + axe tests.
//
// Owner: ui-engineer.
// Resolves: MON-2894486835 (Sprint 5, Task 5.8).

export default mergeConfig(
  baseConfig,
  mergeConfig(viteConfig, {
    test: {
      environment: 'jsdom',
      setupFiles: ['./tests/setup.ts'],
    },
  }),
);
