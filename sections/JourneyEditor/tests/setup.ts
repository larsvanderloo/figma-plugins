// sections/JourneyEditor/tests/setup.ts — Vitest global setup for JourneyEditor tests.
//
// Owner: ui-engineer.
// Resolves: MON-2894486835 (Sprint 5, Task 5.8).
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
// Mock @nuxt/ui
//
// Stubs mirror Nuxt UI's accessibility semantics using the wrapping-label
// pattern. A <label> wrapping an <input> provides an accessible name via the
// label's text content without requiring a for/id pair — valid HTML and
// WCAG 1.3.1 H44 compliant.
//
// UFormField stub:
//   Renders <label style="display:flex;flex-direction:column">
//     <span>label text</span>
//     <slot />
//   </label>
//   This gives any <input> inside the slot its accessible name from the <span>
//   text content. screen.getByRole('textbox', { name: 'Step 1 label' }) and
//   screen.getByRole('spinbutton', { name: 'Step 1 start %' }) resolve correctly.
//
// UInput stub:
//   Renders <input type="text" ...> — must be rendered INSIDE a UFormField
//   (the wrapping label provides the name).
//
// UInputNumber stub:
//   Renders <input type="number" ...> with all ARIA numeric attributes forwarded
//   for axe spinbutton validation (WCAG 4.1.2).
//
// UButton stub:
//   Renders <button type="button" ...> with slot content and aria-label passthrough.
// ---------------------------------------------------------------------------

vi.mock('@nuxt/ui', () => ({
  UFormField: {
    name: 'UFormField',
    props: {
      label: { type: String, default: '' },
      name: { type: String, default: undefined },
      required: { type: Boolean, default: false },
    },
    // Wrapping <label> pattern: gives the slot's first focusable control its
    // accessible name via the <span> text without needing for/id wiring.
    // display:contents on outer div avoids breaking the label's wrapping semantics.
    template: `
      <div class="u-form-field-stub" style="display:contents">
        <label style="display:flex;flex-direction:column;gap:4px;font-size:11px">
          <span>{{ label }}</span>
          <slot />
        </label>
      </div>
    `,
  },

  UInput: {
    name: 'UInput',
    props: {
      modelValue: { type: String, default: '' },
      disabled: { type: Boolean, default: false },
      size: { type: String, default: 'md' },
      placeholder: { type: String, default: undefined },
      type: { type: String, default: 'text' },
    },
    emits: ['update:modelValue'],
    template: `
      <input
        :type="type || 'text'"
        :value="modelValue"
        :disabled="disabled"
        :placeholder="placeholder"
        v-bind="$attrs"
        @input="$emit('update:modelValue', $event.target.value)"
      />
    `,
  },

  UInputNumber: {
    name: 'UInputNumber',
    props: {
      modelValue: { type: Number, default: 0 },
      disabled: { type: Boolean, default: false },
      min: { type: Number, default: undefined },
      max: { type: Number, default: undefined },
      step: { type: Number, default: 1 },
      size: { type: String, default: 'md' },
      'aria-valuemin': { type: [Number, String], default: undefined },
      'aria-valuemax': { type: [Number, String], default: undefined },
      'aria-valuenow': { type: [Number, String], default: undefined },
    },
    emits: ['update:modelValue'],
    // Emits a number (or null for empty). NaN guard in the component handler
    // prevents emitting on non-numeric input.
    template: `
      <input
        type="number"
        :value="modelValue"
        :disabled="disabled"
        :min="min"
        :max="max"
        :step="step"
        v-bind="$attrs"
        @input="$emit('update:modelValue', $event.target.value === '' ? null : parseFloat($event.target.value))"
      />
    `,
  },

  UButton: {
    name: 'UButton',
    props: {
      color: { type: String, default: 'neutral' },
      variant: { type: String, default: 'solid' },
      icon: { type: String, default: undefined },
      size: { type: String, default: 'md' },
      disabled: { type: Boolean, default: false },
      block: { type: Boolean, default: false },
    },
    emits: ['click'],
    template: `
      <button
        type="button"
        :disabled="disabled"
        v-bind="$attrs"
        @click="$emit('click', $event)"
      ><slot /></button>
    `,
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
