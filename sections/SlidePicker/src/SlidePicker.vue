<script setup lang="ts">
/**
 * SlidePicker — dropdown section for selecting a Welder slide on the current page.
 *
 * Renders the slide list as a labelled native <select> element. The consuming
 * plugin is responsible for:
 *   1. Providing the slide list via the `slides` prop (populated from the store).
 *   2. Wiring the `select` emit to `useEditorActions().loadSlide()` (or equivalent).
 *
 * This section does NOT fetch data. It does NOT write to any Pinia store.
 * Data flows in via props; user actions flow out via emits.
 *
 * Accessibility:
 *   - Native <select> provides browser-native combobox + listbox + option semantics.
 *   - Explicit <label> associated via `for`/`id`. Screen readers announce the label.
 *   - Loading state announced via aria-busy on the wrapper.
 *   - Error state announced via role="alert" (live region, immediate).
 *   - Active slide distinguished with a text prefix ("✓") for screen readers
 *     that do not announce <option selected> reliably.
 *
 * Ownership: ui-engineer.
 * ADR-0010: sections are read-only consumers of store state; they do not mutate
 * the store directly ($patch / property assignment forbidden by ESLint rule).
 */

import { computed, useId } from 'vue';
import type { SlideSummary } from './types.js';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SlidePickerProps {
  /** Slide list for the current Figma page. Empty array shows the empty state. */
  slides: SlideSummary[];
  /**
   * Currently active slide id. null = no selection.
   * The active option is visually and semantically distinguished.
   */
  activeSlideId: string | null;
  /**
   * True while the slide list is loading (slide-list:request in-flight).
   * Shows a disabled placeholder option and communicates via aria-busy.
   */
  loading?: boolean;
  /**
   * Error message to display when the slide-list request failed.
   * Rendered in a role="alert" live region for screen readers.
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
// Stable label ID for aria association
// ---------------------------------------------------------------------------

const labelId = useId();
const selectId = useId();

// ---------------------------------------------------------------------------
// Derived state
// ---------------------------------------------------------------------------

/** True when the list is not loading and contains no slides. */
const isEmpty = computed(() => !props.loading && props.slides.length === 0);

/** The currently selected slide object (or null if no active slide). */
const activeSlide = computed<SlideSummary | null>(
  () => props.slides.find((s) => s.id === props.activeSlideId) ?? null,
);

/**
 * The value bound to the native <select>.
 * Empty string when nothing is selected (matches the placeholder option's value).
 */
const selectValue = computed<string>(() => props.activeSlideId ?? '');

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

function handleChange(event: Event): void {
  const target = event.target as HTMLSelectElement;
  const value = target.value;
  // Guard: ignore the placeholder option ("") and emission during loading.
  if (!value || props.loading) return;
  emit('select', value);
}
</script>

<template>
  <div class="slide-picker flex flex-col gap-1" :aria-busy="loading ? 'true' : undefined">
    <!-- Label -->
    <label :id="labelId" :for="selectId" class="select-none text-xs font-medium text-gray-500">
      Current slide
    </label>

    <!-- Dropdown trigger -->
    <div class="relative">
      <select
        :id="selectId"
        :aria-labelledby="labelId"
        :disabled="loading || isEmpty"
        :value="selectValue"
        class="w-full cursor-pointer appearance-none rounded border border-gray-200 bg-white px-2.5 py-1.5 pr-7 text-sm leading-tight text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50"
        @change="handleChange"
      >
        <!-- Loading placeholder -->
        <option v-if="loading" value="" disabled selected>Loading slides…</option>

        <!-- Empty state option — shown when no slides and not loading -->
        <option v-else-if="isEmpty" value="" disabled selected>
          No Welder slides on this page
        </option>

        <!-- Slide options -->
        <template v-else>
          <!-- Unselected placeholder shown when no active slide -->
          <option v-if="activeSlide === null" value="" disabled>Select a slide…</option>

          <option
            v-for="slide in slides"
            :key="slide.id"
            :value="slide.id"
            :selected="slide.id === activeSlideId"
          >
            <!--
              Prefix active slide with a checkmark character so screen readers
              that don't announce <option selected> still convey the selection.
              The native <select> "selected" attribute handles visual selection;
              this prefix supplements it for auditory output.
            -->
            {{ slide.id === activeSlideId ? '✓ ' : '' }}{{ slide.name
            }}<template v-if="slide.isSkipped === true"> (skipped)</template>
          </option>
        </template>
      </select>

      <!-- Custom chevron icon (appearance-none removes the native arrow) -->
      <span
        aria-hidden="true"
        class="pointer-events-none absolute inset-y-0 right-2 flex items-center text-gray-400"
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          focusable="false"
        >
          <path
            d="M2.5 4.5L6 8L9.5 4.5"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </span>
    </div>

    <!-- Error message -->
    <p v-if="error" role="alert" class="mt-0.5 text-xs text-red-600">
      {{ error }}
    </p>
  </div>
</template>
