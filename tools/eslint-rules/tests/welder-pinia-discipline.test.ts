// tools/eslint-rules/tests/welder-pinia-discipline.test.ts
//
// RuleTester cases for the welder/pinia-mutation-discipline rule (ADR-0010 §3.1).
//
// ESLint 9 flat-config RuleTester is used. It accepts `languageOptions` in
// place of the legacy `parserOptions` key.
//
// Test matrix (4 required cases per the Monday 1.2 spec):
//   VALID-1  Store mutation inside useEditorStore.ts action (allowed file)
//   VALID-2  Store mutation inside useEditorActions.ts (allowed file)
//   INVALID-1  $patch from a section (SlidePicker.vue)
//   INVALID-2  Direct property assignment from a section (SlidePicker.vue)
//
// Additional cases cover $reset, $state, and storeToRefs ref assignment so
// regressions in those branches are caught before they ship.
//
// Note on filename simulation:
//   RuleTester's `filename` option sets the value returned by
//   context.getFilename(). The rule uses path.relative(process.cwd(), filename)
//   to resolve the allowed-file check. In tests we use absolute paths that
//   reproduce the expected relative segments so the rule classifies correctly.

import { describe, it } from 'vitest';
import { RuleTester } from 'eslint';
import { resolve } from 'node:path';
import rule from '../welder-pinia-discipline.js';

// ---------------------------------------------------------------------------
// Path helpers — derive absolute test filenames from monorepo CWD.
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

// ---------------------------------------------------------------------------
// Common preamble used in INVALID cases so the rule has store vars to track.
// ---------------------------------------------------------------------------
const PREAMBLE = `
const store = useEditorStore();
`;

const PREAMBLE_STORE_TO_REFS = `
const { activeSlide } = storeToRefs(useEditorStore());
`;

// ---------------------------------------------------------------------------
// RuleTester.run — wraps vitest describe/it internally in ESLint 9.
// We wrap it in our own describe for clarity in the vitest reporter.
// ---------------------------------------------------------------------------

describe('welder/pinia-mutation-discipline', () => {
  it('passes all RuleTester cases', () => {
    ruleTester.run('pinia-mutation-discipline', rule, {
      // ======================================================================
      // VALID — mutations inside allowed files should NOT be flagged
      // ======================================================================
      valid: [
        // VALID-1: Store mutation inside useEditorStore.ts action method.
        // This represents the applySlideListResult action writing to the store.
        {
          name: 'VALID-1: direct assignment inside useEditorStore.ts is allowed',
          filename: ALLOWED_STORE,
          code: `
            const store = useEditorStore();
            store.slides = [];
          `,
        },

        // VALID-2: Store mutation inside useEditorActions.ts composable.
        // This represents an action wrapper that optimistically writes to store.
        {
          name: 'VALID-2: $patch inside useEditorActions.ts is allowed',
          filename: ALLOWED_ACTIONS,
          code: `
            const store = useEditorStore();
            store.$patch({ activeSlideId: 'abc' });
          `,
        },

        // VALID-3: Reading from the store in a section is fine (no mutation).
        {
          name: 'VALID-3: reading store state in a section is not flagged',
          filename: SECTION_FILE,
          code: `
            const store = useEditorStore();
            const slides = store.slides;
            console.log(slides);
          `,
        },

        // VALID-4: storeToRefs read in a section is fine (no .value assignment).
        {
          name: 'VALID-4: reading storeToRefs ref.value in a section is not flagged',
          filename: SECTION_FILE,
          code: `
            const { activeSlide } = storeToRefs(useEditorStore());
            console.log(activeSlide.value);
          `,
        },

        // VALID-5: File unrelated to welder-editor is skipped entirely.
        {
          name: 'VALID-5: file outside welder-editor is not checked',
          filename: resolve(cwd, 'components/SomeButton/SomeButton.ts'),
          code: `
            const store = useEditorStore();
            store.$patch({ foo: 'bar' });
          `,
        },
      ],

      // ======================================================================
      // INVALID — mutations outside allowed files must be flagged
      // ======================================================================
      invalid: [
        // INVALID-1: $patch from SlidePicker section.
        {
          name: 'INVALID-1: $patch from SlidePicker section is an error',
          filename: SECTION_FILE,
          code: PREAMBLE + `store.$patch({ activeSlideId: 'new' });`,
          errors: [{ messageId: 'patchOrReset' }],
        },

        // INVALID-2: Direct property assignment from SlidePicker section.
        {
          name: 'INVALID-2: direct property assignment from SlidePicker section is an error',
          filename: SECTION_FILE,
          code: PREAMBLE + `store.activeSlideId = 'new';`,
          errors: [{ messageId: 'directAssignment' }],
        },

        // INVALID-3: $reset from a section.
        {
          name: 'INVALID-3: $reset from section is an error',
          filename: SECTION_FILE,
          code: PREAMBLE + `store.$reset();`,
          errors: [{ messageId: 'patchOrReset' }],
        },

        // INVALID-4: $state assignment from a section.
        {
          name: 'INVALID-4: $state assignment from section is an error',
          filename: SECTION_FILE,
          code: PREAMBLE + `store.$state = {};`,
          errors: [{ messageId: 'stateAssignment' }],
        },

        // INVALID-5: storeToRefs ref.value assignment from a section.
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
