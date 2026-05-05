// Flat ESLint config for the figma-plugins monorepo.
//
// Scope: TypeScript files only. Vue SFCs (.vue) are type-checked by vue-tsc
// and need vue-eslint-parser to be linted by ESLint — wiring that up is a
// follow-up. For now eslint covers .ts/.tsx; vue-tsc + Prettier cover .vue.
//
// Run from any workspace root:
//   pnpm lint
// Or per-package:
//   pnpm --filter @figma-plugins/<pkg> lint

import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';

export default [
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/.vite/**', '**/coverage/**', '**/*.vue'],
  },
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      // TypeScript
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],

      // General
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always'],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },
];
