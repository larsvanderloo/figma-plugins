<script setup lang="ts">
/**
 * SlidePicker — dropdown for selecting a Welder slide.
 *
 * Lifted from sections/SlidePicker/src/SlidePicker.vue.
 * Uses USelectMenu (Nuxt UI v4) replacing native <select>.
 *
 * Props-only renderer. Emits select(slideId). Does NOT import store.
 * Owner: ui-engineer.
 */

import { computed } from 'vue';
import type { SlideSummary } from '@shared/messages.js';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface SlidePickerProps {
  slides: SlideSummary[];
  activeSlideId: string | null;
  loading?: boolean;
  error?: string | null;
}

const props = withDefaults(defineProps<SlidePickerProps>(), {
  loading: false,
  error: null,
});

// ---------------------------------------------------------------------------
// Emits
// ---------------------------------------------------------------------------

const emit = defineEmits<{
  select: [slideId: string];
}>();

// ---------------------------------------------------------------------------
// Derived state
// ---------------------------------------------------------------------------

const isEmpty = computed(() => !props.loading && props.slides.length === 0);

const disabled = computed(() => props.loading || isEmpty.value);

const items = computed<{ label: string; value: string }[]>(() =>
  props.slides.map((s) => ({ label: `${s.number}. ${s.name}`, value: s.id })),
);

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

const placeholder = computed<string>(() => {
  if (props.loading) return 'Loading slides…';
  if (isEmpty.value) return 'No Welder slides on this page';
  return 'Pick a slide';
});
</script>

<template>
  <div class="slide-picker flex flex-col gap-1" :aria-busy="loading ? 'true' : undefined">
    <span class="select-none text-xs font-medium text-gray-500">Current slide</span>

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
      Error message — StatusMessage pattern: rendered only when error is truthy.
      Inline UAlert replaces @figma-plugins/components StatusMessage dependency.
    -->
    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      :description="error"
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
    />
  </div>
</template>
