// sections/JourneyEditor/tests/setup.ts — Vitest global setup for JourneyEditor tests.
//
// Owner: ui-engineer.
//
// Node 25 localStorage shim — same rationale as CardEditor/tests/setup.ts.
// Pinia@3 / @vue/devtools-kit calls localStorage.getItem() at module-evaluation
// time in jsdom. This shim installs a no-op Map-backed store before any
// dynamic import.
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
// Mock @figma-plugins/components (InputField)
//
// InputField stub: renders a <label> + <input> pair using the label prop as
// the accessible name. Emits 'update:modelValue' on input events.
// Forwards type, min, max, step, disabled, aria-valuemin, aria-valuemax,
// aria-valuenow attributes so axe can verify numeric input accessibility.
// ---------------------------------------------------------------------------

vi.mock('@figma-plugins/components', () => ({
  InputField: {
    name: 'InputField',
    props: {
      label: { type: String, required: true },
      modelValue: { type: String, default: '' },
      type: { type: String, default: 'text' },
      disabled: { type: Boolean, default: false },
      multiline: { type: Boolean, default: false },
      rows: { type: Number, default: undefined },
      min: { type: [Number, String], default: undefined },
      max: { type: [Number, String], default: undefined },
      step: { type: [Number, String], default: undefined },
      autocomplete: { type: String, default: undefined },
      'aria-valuemin': { type: [Number, String], default: undefined },
      'aria-valuemax': { type: [Number, String], default: undefined },
      'aria-valuenow': { type: [Number, String], default: undefined },
    },
    emits: ['update:modelValue'],
    template: `
      <div class="input-field-stub" data-testid="input-field">
        <label :for="label + '-input'" style="display:block;font-size:11px">{{ label }}</label>
        <input
          :id="label + '-input'"
          :type="type || 'text'"
          :value="modelValue"
          :disabled="disabled"
          :min="min"
          :max="max"
          :step="step"
          :aria-label="label"
          v-bind="$attrs"
          @input="$emit('update:modelValue', $event.target.value)"
        />
      </div>
    `,
  },
  StatusMessage: {
    name: 'StatusMessage',
    props: {
      message: { type: String, default: '' },
      variant: { type: String, default: 'status' },
    },
    template: `<p v-if="message" role="status" aria-live="polite" aria-atomic="true">{{ message }}</p>`,
  },
}));

// ---------------------------------------------------------------------------
// Mock @figma-plugins/sections-title-description-editor
//
// TitleDescriptionEditor stub: renders a fieldset with a heading input and
// optionally a paragraph textarea. Emits 'update:model' with { heading, paragraph }.
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
        data-testid="title-description-editor"
      >
        <legend class="sr-only">Column header fields</legend>
        <input
          type="text"
          :aria-label="'Heading'"
          :value="model.heading"
          :disabled="disabled"
          @input="$emit('update:model', { heading: $event.target.value, paragraph: model.paragraph })"
        />
        <textarea
          v-if="model.paragraph !== null"
          :aria-label="'Paragraph'"
          :disabled="disabled"
          @input="$emit('update:model', { heading: model.heading, paragraph: $event.target.value })"
        >{{ model.paragraph }}</textarea>
      </fieldset>
    `,
  },
}));

// ---------------------------------------------------------------------------
// Mock @figma-plugins/sections-icon-picker
//
// IconPicker stub: renders a listbox with one selectable "star" icon option.
// Emits 'update:modelValue' with the icon key on selection.
// ---------------------------------------------------------------------------

vi.mock('@figma-plugins/sections-icon-picker', () => ({
  IconPicker: {
    name: 'IconPicker',
    props: {
      modelValue: { type: String, required: true },
      disabled: { type: Boolean, default: false },
      placeholder: { type: String, default: 'Search icons...' },
    },
    emits: ['update:modelValue'],
    template: `
      <div class="icon-picker-stub" data-testid="icon-picker">
        <div
          role="listbox"
          aria-label="Icon options"
          aria-multiselectable="false"
          :aria-disabled="disabled ? 'true' : undefined"
        >
          <button
            type="button"
            aria-label="star"
            role="option"
            :aria-selected="modelValue === 'star'"
            :disabled="disabled"
            @click="!disabled && $emit('update:modelValue', 'star')"
          >star</button>
        </div>
      </div>
    `,
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
