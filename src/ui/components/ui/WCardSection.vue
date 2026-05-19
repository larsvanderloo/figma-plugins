<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    spacious?: boolean;
    disabled?: boolean;
    ui?: {
      root?: string;
      fieldset?: string;
    };
  }>(),
  {
    spacious: false,
    disabled: false,
    ui: undefined,
  },
);

const sectionClass = computed(() => [
  'w-card-section',
  props.spacious ? 'space-y-4' : '',
  'py-4',
  props.ui?.root ?? '',
]);

const fieldsetClass = computed(() => [
  props.disabled ? 'opacity-50 pointer-events-none' : '',
  props.ui?.fieldset ?? '',
]);
</script>

<template>
  <section :class="sectionClass">
    <fieldset
      v-if="disabled"
      :disabled="disabled"
      :class="fieldsetClass"
      style="border: 0; padding: 0; margin: 0; min-width: 0"
    >
      <slot />
    </fieldset>
    <slot v-else />
  </section>
</template>
