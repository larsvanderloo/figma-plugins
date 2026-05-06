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
import welderPiniaDisciplineRule from './tools/eslint-rules/welder-pinia-discipline.js';

export default [
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.vite/**',
      '**/coverage/**',
      '**/*.vue',
      // Excluded plugin (out of pnpm workspace; npm-driven; ADR-0017).
      // Lint runs against this folder via its own npm script `typecheck:ui`,
      // not the monorepo-wide pass.
      'plugins/_placeholder-plugin/**',
    ],
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

  // ---------------------------------------------------------------------------
  // welder/pinia-mutation-discipline (ADR-0010 §3.1)
  //
  // Flags direct Pinia store mutation outside the two allowed mutation files:
  //   plugins/welder-editor/ui/stores/useEditorStore.ts
  //   plugins/welder-editor/ui/composables/useEditorActions.ts
  //
  // The rule is path-gated: it fast-paths past any file that does not contain
  // 'welder-editor' in its path, so it has zero cost on the rest of the repo.
  //
  // Severity: error — violations are blocking (not warnings). Do not override.
  // See tools/eslint-rules/welder-pinia-discipline.ts for implementation.
  // ---------------------------------------------------------------------------
  {
    files: ['plugins/welder-editor/**/*.{ts,tsx}'],
    plugins: {
      welder: {
        rules: {
          'pinia-mutation-discipline': welderPiniaDisciplineRule,
        },
      },
    },
    rules: {
      'welder/pinia-mutation-discipline': 'error',
    },
  },
];
