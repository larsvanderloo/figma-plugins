<script setup lang="ts">
/**
 * IconPicker — Lucide icon picker section.
 *
 * Search box + scrollable grid of selectable icon thumbnails.
 * Returns a Lucide icon key on selection via `update:modelValue`.
 *
 * ## Bundle strategy (ADR-0003 §1)
 *
 * Icon data is NOT in the initial bundle. On the first time the picker becomes
 * visible (triggered by the consumer rendering this component), it calls
 * `loadIconManifest()` which dynamic-imports `lucide-subset.json` and
 * registers the icons with `addCollection()` from @iconify/vue. The Icon
 * component then resolves icons from the in-memory registry — no network.
 *
 * @iconify/vue is already a transitive dep via @nuxt/ui — zero new bundle cost.
 *
 * ## Primitives used (Sprint 3 migration — MON-2893969759)
 *
 * InputField replaces the inline <label sr-only> + <input type="search">
 * pattern. InputField with hideLabel=true keeps the label in the a11y tree
 * while hiding it visually — matching the original sr-only label. The
 * type="search" prop is forwarded to the native input so that the browser
 * renders the correct searchbox role and the native clear button.
 *
 * StatusMessage replaces the inline <p role="status" aria-live="polite"
 * aria-atomic="true"> pattern. It is always rendered (never v-if'd away)
 * so the live region is registered before announcements are needed.
 *
 * ## Accessibility
 *
 * Search field:
 *   - InputField with type="search" and hideLabel=true — browser-native
 *     searchbox role, sr-only label "Search icons", visible focus ring.
 *   - aria-controls dropped: not required by WCAG 2.1 AA and not forwarded
 *     by InputField. Can be re-added via InputField prop expansion in a
 *     follow-up if roving focus / grid navigation is added.
 *
 * Grid:
 *   - `role="listbox"` with `aria-label` for independent landmark.
 *   - `aria-multiselectable="false"` — single selection.
 *   - Each icon button: `role="option"`, `aria-label` with the icon key,
 *     `aria-selected` reflecting current selection.
 *   - Keyboard: grid buttons are individually focusable (tabindex=0 each,
 *     standard grid navigation). Arrow-key roving focus within the grid is
 *     NOT implemented at this stage — each button is independently tabbable,
 *     which keeps the keyboard contract simple and WCAG 2.1 AA compliant.
 *
 * Loading state:
 *   - StatusMessage variant="status" announces "Loading icons…" while the
 *     manifest loads. The element is always in the DOM (StatusMessage's
 *     invariant) so the live region is registered before the announcement.
 *   - `aria-busy="true"` on the empty grid placeholder.
 *
 * Disabled state:
 *   - InputField disabled prop disables the search input.
 *   - All icon buttons receive `disabled`.
 *   - `aria-disabled="true"` on the listbox container.
 *
 * No host shortcuts are shadowed (Cmd-Z, Cmd-D, Cmd-A, etc.).
 *
 * ## Props
 *
 * | Prop        | Type    | Default           | Description                            |
 * |-------------|---------|-------------------|----------------------------------------|
 * | modelValue  | string  | —                 | Currently selected icon key (v-model). |
 * | disabled    | boolean | false             | Disables search + all icon buttons.    |
 * | placeholder | string  | 'Search icons...' | Placeholder for the search input.      |
 *
 * ## Emits
 *
 * | Event             | Payload | Description                             |
 * |-------------------|---------|-----------------------------------------|
 * | update:modelValue | string  | Icon key when user clicks an icon cell. |
 *
 * ## Section discipline
 *
 * This section does NOT dispatch to any store. It does NOT call figma.*.
 * Data flows in via props; user actions flow out via emits.
 * The consumer is responsible for wiring `update:modelValue` to their store.
 *
 * Ownership: ui-engineer.
 * Resolves: MON-2893849834 (Sprint 2 task 2.6).
 */

import { ref, computed, onMounted, useId } from 'vue';
import { Icon } from '@iconify/vue';
import { InputField, StatusMessage } from '@figma-plugins/components';
import { ICON_KEYS, loadIconManifest } from './icons.js';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface IconPickerProps {
  /** Currently selected icon key (v-model). Empty string = no selection. */
  modelValue: string;
  /** When true, search and all icon cells are non-interactive. */
  disabled?: boolean;
  /** Placeholder text for the search input. */
  placeholder?: string;
}

const props = withDefaults(defineProps<IconPickerProps>(), {
  disabled: false,
  placeholder: 'Search icons...',
});

// ---------------------------------------------------------------------------
// Emits
// ---------------------------------------------------------------------------

export interface IconPickerEmits {
  /** Fired when the user clicks an icon cell. Payload is the icon key. */
  'update:modelValue': [iconKey: string];
}

const emit = defineEmits<IconPickerEmits>();

// ---------------------------------------------------------------------------
// Stable IDs for ARIA associations
// ---------------------------------------------------------------------------

const gridId = useId();

// ---------------------------------------------------------------------------
// Manifest loading
// ---------------------------------------------------------------------------

/** True once the icon manifest has been fetched and registered. */
const manifestReady = ref(false);

onMounted(async () => {
  await loadIconManifest();
  manifestReady.value = true;
});

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

const searchQuery = ref('');

/** Icons filtered by the current search query. */
const filteredIcons = computed<readonly string[]>(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return ICON_KEYS;
  return ICON_KEYS.filter((key) => key.includes(query));
});

// ---------------------------------------------------------------------------
// Status message for live region
// ---------------------------------------------------------------------------

/**
 * Message shown in the status live region.
 * Empty string when the grid is populated — StatusMessage renders nothing.
 */
const statusMessage = computed<string>(() => {
  if (!manifestReady.value) return 'Loading icons…';
  if (filteredIcons.value.length === 0) return `No icons match "${searchQuery.value}"`;
  return '';
});

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

function handleSelect(key: string): void {
  if (props.disabled) return;
  emit('update:modelValue', key);
}

// ---------------------------------------------------------------------------
// Icon name for @iconify/vue (prefixed with collection name)
// ---------------------------------------------------------------------------

function iconName(key: string): string {
  return `lucide:${key}`;
}
</script>

<template>
  <div class="icon-picker flex flex-col gap-2">
    <!-- Search — InputField with type="search" gives <input type="search"> -->
    <!-- hideLabel=true renders the label as sr-only for AT, hidden visually. -->
    <InputField
      label="Search icons"
      type="search"
      :hide-label="true"
      :model-value="searchQuery"
      :placeholder="placeholder ?? 'Search icons...'"
      :disabled="disabled ?? false"
      :autocomplete="'off'"
      @update:model-value="searchQuery = $event"
    />

    <!--
      Status live region: always in the DOM so the live region is registered
      before the first announcement (StatusMessage's invariant).
      Announced by screen readers when content changes.
      Lives OUTSIDE the listbox so it does not violate aria-required-children
      (role="listbox" must only contain role="option" children).
    -->
    <StatusMessage :message="statusMessage" variant="status" />

    <!--
      Grid wrapper: provides the scrollable container.
      role="listbox" is only rendered when there are actual options to show —
      an empty listbox (without role="option" children) violates
      aria-required-children (WCAG 2.1 AA, axe rule id: aria-required-children).
    -->
    <div
      v-if="manifestReady && filteredIcons.length > 0"
      :id="gridId"
      role="listbox"
      aria-label="Icon options"
      aria-multiselectable="false"
      :aria-disabled="disabled ? 'true' : undefined"
      class="icon-picker__grid"
    >
      <button
        v-for="key in filteredIcons"
        :key="key"
        type="button"
        role="option"
        :aria-label="key"
        :aria-selected="key === modelValue"
        :disabled="disabled"
        class="icon-picker__cell"
        :class="{ 'icon-picker__cell--selected': key === modelValue }"
        @click="handleSelect(key)"
      >
        <Icon
          :icon="iconName(key)"
          width="16"
          height="16"
          aria-hidden="true"
          class="icon-picker__icon"
        />
      </button>
    </div>

    <!--
      Non-option grid placeholder: rendered when there are no options (loading
      or no-match). Provides the visual grid shell with aria-busy for loading.
      Not role="listbox" — no aria-required-children constraint applies.
    -->
    <div
      v-else
      :id="gridId"
      :aria-busy="!manifestReady ? 'true' : undefined"
      class="icon-picker__grid icon-picker__grid--empty"
      aria-hidden="true"
    />
  </div>
</template>

<style scoped>
/* Grid layout: compact, fixed-width cells, wrapping. */
.icon-picker__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(28px, 1fr));
  gap: 2px;
  max-height: 160px;
  overflow-y: auto;
  /* Scrollbar styling: compact for plugin iframe context. */
  scrollbar-width: thin;
  scrollbar-color: #d1d5db transparent;
}

.icon-picker__cell {
  /* Reset */
  appearance: none;
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;

  /* Size: 28×28 px cell, icon centered. */
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  color: #374151;

  transition:
    background-color 100ms ease,
    color 100ms ease;
}

@media (prefers-reduced-motion: reduce) {
  .icon-picker__cell {
    transition: none;
  }
}

.icon-picker__cell:hover:not(:disabled) {
  background-color: #f3f4f6;
  color: #111827;
}

.icon-picker__cell:focus-visible {
  outline: 2px solid #3b82f6;
  outline-offset: -1px;
}

.icon-picker__cell--selected {
  background-color: #eff6ff;
  color: #2563eb;
  /* Ring to distinguish selection from hover — 3:1 UI component contrast. */
  outline: 2px solid #3b82f6;
  outline-offset: -2px;
}

.icon-picker__cell:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.icon-picker__icon {
  /* Icon stroke inherits color from the cell. */
  flex-shrink: 0;
}
</style>
