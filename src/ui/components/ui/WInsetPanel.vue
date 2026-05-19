<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    title?: string;
    titleTag?: 'h3' | 'h4';
    bodySeparated?: boolean;
    bodyPadded?: boolean;
    ui?: {
      root?: string;
      header?: string;
      body?: string;
    };
  }>(),
  {
    title: '',
    titleTag: 'h3',
    bodySeparated: true,
    bodyPadded: true,
    ui: undefined,
  },
);

const rootClass = computed(() => [
  'overflow-hidden rounded-[calc(var(--ui-radius)*2)] border border-default bg-elevated',
  props.ui?.root ?? '',
]);

const headerClass = computed(() => [
  'flex items-center justify-between gap-2 px-4 py-2',
  props.bodySeparated ? 'border-b border-default' : '',
  props.ui?.header ?? '',
]);

const bodyClass = computed(() => [
  props.bodyPadded ? 'space-y-2 px-4 py-3' : '',
  props.ui?.body ?? '',
]);
</script>

<template>
  <div :class="rootClass">
    <div :class="headerClass">
      <div class="min-w-0">
        <slot name="title">
          <component
            v-if="title !== ''"
            :is="titleTag"
            class="text-sm font-semibold text-default"
          >
            {{ title }}
          </component>
        </slot>
      </div>

      <div v-if="$slots.actions" class="shrink-0">
        <slot name="actions" />
      </div>
    </div>

    <div v-if="$slots.default" :class="bodyClass">
      <slot />
    </div>
  </div>
</template>
