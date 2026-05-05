// sections/CardEditor/tests/setup.ts — Vitest global setup for CardEditor tests.
//
// Owner: ui-engineer.
//
// Node 25 localStorage shim — same rationale as CardList/tests/setup.ts.
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
// Mock @iconify/vue so tests don't depend on real SVG rendering.
// The Icon component renders a <span data-icon="..."> stub.
// ---------------------------------------------------------------------------

vi.mock('@iconify/vue', () => ({
  Icon: {
    name: 'Icon',
    props: {
      icon: { type: String, required: true },
      width: { type: [String, Number], default: undefined },
      height: { type: [String, Number], default: undefined },
    },
    template: '<span :data-icon="icon" aria-hidden="true" />',
  },
}));

// ---------------------------------------------------------------------------
// Mock sections-title-description-editor
//
// TitleDescriptionEditor is a real dependency but its internal InputField
// composable (which uses useId()) behaves correctly in jsdom. We stub it
// lightly to isolate CardEditor behaviour while still exercising the event
// wiring. The stub emits 'update:model' just like the real component.
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
        <legend class="sr-only">CopyWrap text fields</legend>
        <input
          type="text"
          aria-label="Heading"
          :value="model.heading"
          :disabled="disabled"
          @input="$emit('update:model', { heading: $event.target.value, paragraph: model.paragraph })"
        />
        <textarea
          v-if="model.paragraph !== null"
          aria-label="Paragraph"
          :disabled="disabled"
          @input="$emit('update:model', { heading: model.heading, paragraph: $event.target.value })"
        >{{ model.paragraph }}</textarea>
      </fieldset>
    `,
  },
}));

// ---------------------------------------------------------------------------
// Mock sections-icon-picker
//
// IconPicker stub: a search input + a simple button per icon for testing
// selection. The stub emits 'update:modelValue' with the icon key.
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
        <!--
          role="listbox" wrapper is required: role="option" elements must be
          children of a listbox/select/combobox (ARIA required-parent).
          aria-disabled mirrors the disabled prop so axe sees the listbox state.
        -->
        <div
          role="listbox"
          aria-label="Icon options"
          aria-multiselectable="false"
          :aria-disabled="disabled ? 'true' : undefined"
        >
          <button
            type="button"
            aria-label="Trophy"
            role="option"
            :aria-selected="modelValue === 'Trophy'"
            :disabled="disabled"
            @click="!disabled && $emit('update:modelValue', 'Trophy')"
          >Trophy</button>
        </div>
      </div>
    `,
  },
}));

// ---------------------------------------------------------------------------
// Mock sections-image-editor
//
// ImageEditor stub: a file-upload button that emits 'update:image' with a
// small Uint8Array when clicked (simulating a file-selection result).
// ---------------------------------------------------------------------------

vi.mock('@figma-plugins/sections-image-editor', () => {
  // Build a small Uint8Array at mock-definition time so the template can
  // reference it as a captured variable rather than constructing inline
  // (jsdom's template evaluation context has Uint8Array but the Vue template
  // compiler renders it in a sandboxed scope that may not resolve globals).
  const STUB_BYTES = new Uint8Array([1, 2, 3]);

  return {
    ImageEditor: {
      name: 'ImageEditor',
      props: {
        model: { type: Object, required: true },
        disabled: { type: Boolean, default: false },
        loading: { type: Boolean, default: false },
        error: { type: String, default: undefined },
      },
      emits: ['update:image', 'update:cropTransform'],
      setup(
        props: { model: { imageWrapId: string }; disabled: boolean },
        { emit }: { emit: (event: string, ...args: unknown[]) => void },
      ) {
        function handleClick() {
          if (!props.disabled) {
            emit('update:image', STUB_BYTES);
          }
        }
        return { handleClick };
      },
      template: `
        <section
          class="image-editor-stub"
          :aria-label="'Image editor for ' + model.imageWrapId"
          data-testid="image-editor"
        >
          <button
            type="button"
            :disabled="disabled"
            :aria-disabled="disabled ? 'true' : undefined"
            aria-label="Replace image — choose a PNG, JPEG, or WebP file"
            @click="handleClick"
          >Replace image</button>
        </section>
      `,
    },
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
