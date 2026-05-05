// Flat ESLint config for the figma-plugins monorepo.
// Vue 3 + TypeScript + accessibility-aware rules. Per-package overrides
// extend this base via their own eslint.config.ts.
//
// Run from any workspace root:
//   pnpm lint
// Or per-package:
//   pnpm --filter @figma-plugins/<pkg> lint

import vue from 'eslint-plugin-vue';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/.vite/**', '**/coverage/**'],
  },
  {
    files: ['**/*.{ts,tsx,vue,mts,cts}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        extraFileExtensions: ['.vue'],
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      vue,
    },
    rules: {
      // TypeScript
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],

      // General
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'eqeqeq': ['error', 'always'],
      'prefer-const': 'error',
      'no-var': 'error',

      // Vue 3
      'vue/multi-word-component-names': 'off', // common for plugin tops; opt-in elsewhere
      'vue/component-name-in-template-casing': ['error', 'PascalCase'],
      'vue/define-emits-declaration': ['error', 'type-based'],
      'vue/define-props-declaration': ['error', 'type-based'],
      'vue/no-v-html': 'error',
    },
  },
];
