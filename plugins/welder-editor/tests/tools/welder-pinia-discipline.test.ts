// tests/tools/welder-pinia-discipline.test.ts
//
// RuleTester cases for the welder/pinia-mutation-discipline rule (ADR-0010 §3.1).
//
// Lives under welder-editor tests so it runs via the package's configured
// vitest (node environment, eslint resolvable from root node_modules).
//
// ESLint 9 flat-config RuleTester — uses `languageOptions` in place of the
// legacy `parserOptions` key.
//
// Test matrix (4 required cases per the Monday 1.2 spec):
//   VALID-1   Store mutation inside useEditorStore.ts (allowed file)
//   VALID-2   Store mutation inside useEditorActions.ts (allowed file)
//   INVALID-1 $patch from SlidePicker section
//   INVALID-2 Direct property assignment from SlidePicker section
//
// Additional cases verify $reset, $state, and storeToRefs ref assignment
// so regressions in those branches are caught early.
//
// Filename simulation:
//   RuleTester `filename` sets what context.getFilename() returns.
//   The rule resolves paths relative to process.cwd(), so we produce absolute
//   paths whose relative form matches the expected welder-editor segments.

import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import { resolve } from 'node:path';

// The rule lives in tools/eslint-rules/ relative to the monorepo root.
// We import with an absolute path so no package-resolution shenanigans.
import rule from '../../../../tools/eslint-rules/welder-pinia-discipline.js';

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

const cwd = process.cwd();

/** Allowed file: store internals. */
const ALLOWED_STORE = resolve(cwd, 'plugins/welder-editor/ui/stores/useEditorStore.ts');

/** Allowed file: composable action wrappers. */
const ALLOWED_ACTIONS = resolve(cwd, 'plugins/welder-editor/ui/composables/useEditorActions.ts');

/** Disallowed file: a section component. */
const SECTION_FILE = resolve(cwd, 'plugins/welder-editor/ui/views/SlidePicker/SlidePicker.vue.ts');

// ---------------------------------------------------------------------------
// RuleTester — ESLint 9 flat-config style
// ---------------------------------------------------------------------------

const ruleTester = new RuleTester({
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
});

// Preambles used in INVALID cases so the rule has tracked variables.
const PREAMBLE = `const store = useEditorStore();\n`;
const PREAMBLE_STORE_TO_REFS = `const { activeSlide } = storeToRefs(useEditorStore());\n`;

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('welder/pinia-mutation-discipline ESLint rule', () => {
  it('passes all 4 required RuleTester cases (2 valid + 2 invalid) plus extended cases', () => {
    ruleTester.run('pinia-mutation-discipline', rule, {
      // ====================================================================
      // VALID — mutations inside allowed files are NOT flagged
      // ====================================================================
      valid: [
        // VALID-1: Direct assignment inside useEditorStore.ts (store action method)
        {
          name: 'VALID-1: direct assignment inside useEditorStore.ts is allowed',
          filename: ALLOWED_STORE,
          code: PREAMBLE + `store.slides = [];`,
        },

        // VALID-2: $patch inside useEditorActions.ts (action wrapper)
        {
          name: 'VALID-2: $patch inside useEditorActions.ts is allowed',
          filename: ALLOWED_ACTIONS,
          code: PREAMBLE + `store.$patch({ activeSlideId: 'abc' });`,
        },

        // VALID-3: Reading (not writing) store in a section is fine
        {
          name: 'VALID-3: reading store.slides in a section is not flagged',
          filename: SECTION_FILE,
          code: PREAMBLE + `const slides = store.slides; console.log(slides);`,
        },

        // VALID-4: Reading a storeToRefs ref in a section is fine
        {
          name: 'VALID-4: reading activeSlide.value in a section is not flagged',
          filename: SECTION_FILE,
          code: PREAMBLE_STORE_TO_REFS + `console.log(activeSlide.value);`,
        },

        // VALID-5: File unrelated to welder-editor is not checked (fast-path)
        {
          name: 'VALID-5: non-welder-editor file is skipped entirely',
          filename: resolve(cwd, 'components/SomeButton/SomeButton.ts'),
          code: PREAMBLE + `store.$patch({ foo: 'bar' });`,
        },

        // VALID-6: $reset in the allowed store file is fine
        {
          name: 'VALID-6: $reset inside useEditorStore.ts is allowed',
          filename: ALLOWED_STORE,
          code: PREAMBLE + `store.$reset();`,
        },
      ],

      // ====================================================================
      // INVALID — mutations outside allowed files must be flagged as errors
      // ====================================================================
      invalid: [
        // INVALID-1 (Monday 1.2 required): $patch from SlidePicker section
        {
          name: 'INVALID-1: $patch from SlidePicker section is an error',
          filename: SECTION_FILE,
          code: PREAMBLE + `store.$patch({ activeSlideId: 'new' });`,
          errors: [{ messageId: 'patchOrReset' }],
        },

        // INVALID-2 (Monday 1.2 required): Direct property assignment from SlidePicker
        {
          name: 'INVALID-2: direct property assignment from SlidePicker section is an error',
          filename: SECTION_FILE,
          code: PREAMBLE + `store.activeSlideId = 'new';`,
          errors: [{ messageId: 'directAssignment' }],
        },

        // INVALID-3: $reset from a section
        {
          name: 'INVALID-3: $reset from section is an error',
          filename: SECTION_FILE,
          code: PREAMBLE + `store.$reset();`,
          errors: [{ messageId: 'patchOrReset' }],
        },

        // INVALID-4: $state assignment from a section
        {
          name: 'INVALID-4: $state assignment from section is an error',
          filename: SECTION_FILE,
          code: PREAMBLE + `store.$state = {};`,
          errors: [{ messageId: 'stateAssignment' }],
        },

        // INVALID-5: storeToRefs ref.value assignment from a section
        {
          name: 'INVALID-5: storeToRefs ref.value assignment from section is an error',
          filename: SECTION_FILE,
          code: PREAMBLE_STORE_TO_REFS + `activeSlide.value = 'new-id';`,
          errors: [{ messageId: 'storeRefAssignment' }],
        },
      ],
    });
  });
});
