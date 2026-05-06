<script setup lang="ts">
/**
 * SlidePicker — dropdown section for selecting a Welder slide on the current page.
 *
 * Migrated from native <select> to Nuxt UI v4 <USelectMenu> (Sprint 5 Wave 3,
 * MON-2894451891). USelectMenu is chosen over USelect because it supports
 * free-form typing for long slide titles and renders a custom listbox that
 * adapts to the compact Figma plugin viewport.
 *
 * This section does NOT fetch data. It does NOT write to any Pinia store.
 * Data flows in via props; user actions flow out via emits.
 *
 * ## External contract (preserved from pre-migration)
 *
 * Props: slides, activeSlideId, loading, error.
 * Emits: select (slideId: string) — consumed by App.vue → useEditorActions().loadSlide().
 *
 * ## USelectMenu integration
 *
 * USelectMenu expects modelValue: string | undefined and items: { label, value }[].
 * The `selected` computed bridges from activeSlideId (string | null) to that
 * contract: null ↔ undefined in the getter; undefined → no emit in the setter
 * (empty string / deselect is a no-op at the App.vue level).
 *
 * ## Accessibility
 *
 * USelectMenu (reka-ui ComboboxRoot) provides:
 *   - ComboboxInput: role="combobox", aria-expanded, aria-controls, aria-autocomplete.
 *   - ComboboxContent: role="listbox" in a portal (<body>).
 *   - ComboboxItem: role="option", aria-selected.
 * All keyboard navigation (↑/↓/Enter/Escape) is handled by reka-ui.
 * The wrapper label remains for the ARIA grouping visible in the panel.
 * Loading and error states are communicated via aria-busy and StatusMessage
 * (role="alert") respectively — same pattern as the native <select> version.
 *
 * Ownership: ui-engineer.
 * ADR-0010: sections are read-only consumers of store state; they do not mutate
 * the store directly ($patch / property assignment forbidden by ESLint rule).
 */

import { computed } from 'vue';
import { StatusMessage } from '@figma-plugins/components';
import type { SlideSummary } from './types.js';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SlidePickerProps {
  /** Slide list for the current Figma page. Empty array shows the empty state. */
  slides: SlideSummary[];
  /**
   * Currently active slide id. null = no selection.
   */
  activeSlideId: string | null;
  /**
   * True while the slide list is loading (slide-list:request in-flight).
   */
  loading?: boolean;
  /**
   * Error message to display when the slide-list request failed.
   * Rendered in a StatusMessage variant="alert" live region for screen readers.
   */
  error?: string | null;
}

const props = withDefaults(defineProps<SlidePickerProps>(), {
  loading: false,
  error: null,
});

// ---------------------------------------------------------------------------
// Emits
// ---------------------------------------------------------------------------

export interface SlidePickerEmits {
  /**
   * Fired when the user selects a slide from the dropdown.
   * The parent (plugin view) is responsible for calling
   * `useEditorActions().loadSlide(slideId)` with this value.
   */
  select: [slideId: string];
}

const emit = defineEmits<SlidePickerEmits>();

// ---------------------------------------------------------------------------
// Derived state
// ---------------------------------------------------------------------------

/** True when the list is not loading and contains no slides. */
const isEmpty = computed(() => !props.loading && props.slides.length === 0);

/**
 * True when the dropdown should be disabled.
 * Disabled during loading or when the slide list is empty.
 */
const disabled = computed(() => props.loading || isEmpty.value);

/**
 * Items array for USelectMenu.
 * Label format: "N. Slide name" — mirrors v0.2.1 SlideSelector label format.
 */
const items = computed<{ label: string; value: string }[]>(() =>
  props.slides.map((s) => ({ label: `${s.number}. ${s.name}`, value: s.id })),
);

/**
 * v-model bridge between activeSlideId (string | null) and
 * USelectMenu's expected modelValue (string | undefined).
 *
 * Getter: null → undefined (USelectMenu treats undefined as "no selection").
 * Setter: undefined → no-op (deselect is not meaningful in this context);
 *         string → emit('select', id) so App.vue can dispatch loadSlide.
 */
const selected = computed<string | undefined>({
  get() {
    return props.activeSlideId ?? undefined;
  },
  set(next: string | undefined) {
    if (next !== undefined) {
      emit('select', next);
    }
  },
});

/**
 * Placeholder text adapts to the loading / empty state.
 */
const placeholder = computed<string>(() => {
  if (props.loading) return 'Loading slides…';
  if (isEmpty.value) return 'No Welder slides on this page';
  return 'Pick a slide';
});
</script>

<template>
  <div class="slide-picker flex flex-col gap-1" :aria-busy="loading ? 'true' : undefined">
    <!-- Label -->
    <span class="select-none text-xs font-medium text-gray-500">Current slide</span>

    <!-- USelectMenu — replaces native <select> -->
    <!-- :model-value uses explicit string coercion (selected ?? '') to satisfy
         exactOptionalPropertyTypes: USelectMenu.modelValue is string, not string|undefined.
         The empty-string fallback is safe because USelectMenu treats '' as unselected
         (it won't match any item.value, which are Figma node IDs). -->
    <USelectMenu
      :model-value="selected ?? ''"
      :items="items"
      value-key="value"
      :disabled="disabled"
      :placeholder="placeholder"
      size="md"
      class="min-w-[260px] max-w-[420px]"
      @update:model-value="
        (v: string) => {
          selected = v;
        }
      "
    />

    <!--
      Error message — mounted only when error is truthy so that
      queryByRole('alert') returns null in non-error states (test contract).
      StatusMessage with variant="alert" renders role="alert" aria-live="assertive".
    -->
    <StatusMessage v-if="error" variant="alert" :message="error" />
  </div>
</template>
