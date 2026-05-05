// sections/TimelineEditor/tests/setup.ts — Vitest global setup for TimelineEditor tests.
//
// Owner: ui-engineer.
//
// Node 25 localStorage shim — same rationale as CardEditor/tests/setup.ts.
// Pinia@3 / @vue/devtools-kit calls localStorage.getItem() at module-evaluation
// time. Node 25 throws a SecurityError on the native localStorage getter unless
// started with --localstorage-file. This shim installs a no-op Map-backed store
// before any dynamic import.
const _lsStore: Record<string, string> = {};
try {
  void globalThis.localStorage;
} catch {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    enumerable: true,
    writable: true,
    value: {
      getItem: (key: string): string | null => _lsStore[key] ?? null,
      setItem: (key: string, value: string): void => {
        _lsStore[key] = String(value);
      },
      removeItem: (key: string): void => {
        delete _lsStore[key];
      },
      clear: (): void => {
        Object.keys(_lsStore).forEach((k) => delete _lsStore[k]);
      },
      get length(): number {
        return Object.keys(_lsStore).length;
      },
      key: (index: number): string | null => Object.keys(_lsStore)[index] ?? null,
    },
  });
}

import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/vue';

// ---------------------------------------------------------------------------
// Mock @figma-plugins/components — only StatusMessage is used here.
//
// The stub renders a <p role="status"> matching the real StatusMessage's
// live-region contract (polite assertion, always in the DOM).
// ---------------------------------------------------------------------------

vi.mock('@figma-plugins/components', () => ({
  StatusMessage: {
    name: 'StatusMessage',
    props: {
      message: { type: String, required: true },
      variant: { type: String, default: 'status' },
    },
    template: `
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        class="status-message-stub"
        data-testid="status-message"
      >{{ message }}</p>
    `,
  },
}));

// ---------------------------------------------------------------------------
// Mock @figma-plugins/sections-title-description-editor
//
// The stub exercises TitleDescriptionEditor's event contract without coupling
// to InputField internals. Emits 'update:model' just like the real component.
// The fieldset is disabled when disabled=true (browser-native propagation).
// ---------------------------------------------------------------------------

vi.mock('@figma-plugins/sections-title-description-editor', () => ({
  TitleDescriptionEditor: {
    name: 'TitleDescriptionEditor',
    props: {
      model: { type: Object, required: true },
      disabled: { type: Boolean, default: false },
    },
    emits: ['update:model'],
    template: `
      <fieldset
        class="tde-stub"
        :disabled="disabled"
        :aria-disabled="disabled ? 'true' : undefined"
        :data-testid="'title-description-editor-' + model.copyWrapId"
      >
        <legend class="sr-only">CopyWrap text fields</legend>
        <input
          type="text"
          :aria-label="'Heading for ' + model.copyWrapId"
          :value="model.heading"
          :disabled="disabled"
          @input="$emit('update:model', { heading: $event.target.value, paragraph: model.paragraph })"
        />
        <textarea
          v-if="model.paragraph !== null"
          :aria-label="'Paragraph for ' + model.copyWrapId"
          :disabled="disabled"
          @input="$emit('update:model', { heading: model.heading, paragraph: $event.target.value })"
        >{{ model.paragraph }}</textarea>
      </fieldset>
    `,
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
