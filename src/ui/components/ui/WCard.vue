<script setup lang="ts">
import { computed } from 'vue';

type CardSlotUi = {
  root?: string;
  header?: string;
  body?: string;
  footer?: string;
};

const props = withDefaults(
  defineProps<{
    title?: string;
    titleTag?: 'h2' | 'h3';
    segmented?: boolean;
    ui?: CardSlotUi;
  }>(),
  {
    title: '',
    titleTag: 'h3',
    segmented: false,
    ui: undefined,
  },
);

function mergeSlotUi(base: CardSlotUi, override: CardSlotUi | undefined): CardSlotUi {
  if (override === undefined) return base;

  return {
    ...base,
    ...override,
    root: [base.root, override.root].filter(Boolean).join(' '),
    header: [base.header, override.header].filter(Boolean).join(' '),
    body: [base.body, override.body].filter(Boolean).join(' '),
    footer: [base.footer, override.footer].filter(Boolean).join(' '),
  };
}

const cardUi = computed<CardSlotUi>(() => {
  const base = props.segmented
    ? {
        root: 'gap-0 p-0',
        header: 'p-4',
        body: 'p-0',
      }
    : {};

  return mergeSlotUi(base, props.ui);
});
</script>

<template>
  <UCard :ui="cardUi">
    <template v-if="$slots.header" #header>
      <slot name="header" />
    </template>

    <template v-else-if="title !== '' || $slots.actions" #header>
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <slot name="title">
            <component
              v-if="title !== ''"
              :is="titleTag"
              class="text-sm font-medium text-highlighted"
            >
              {{ title }}
            </component>
          </slot>
        </div>

        <div v-if="$slots.actions" class="shrink-0">
          <slot name="actions" />
        </div>
      </div>
    </template>

    <slot />

    <template v-if="$slots.footer" #footer>
      <slot name="footer" />
    </template>
  </UCard>
</template>
