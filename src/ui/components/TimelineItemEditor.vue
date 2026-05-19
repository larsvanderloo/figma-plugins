<!--
  TimelineItemEditor — editor for one timeline item (heading + paragraph).
  Uses BInput / BTextarea so typing doesn't fire a sandbox round-trip per
  keystroke (commit-on-blur).
-->
<script setup lang="ts">
import type { TimelineItem } from '../../types';
import BInput from './BInput.vue';
import BTextarea from './BTextarea.vue';

interface Props {
  modelValue: TimelineItem;
  index: number;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: TimelineItem];
}>();

function onHeadingCommit(value: string): void {
  emit('update:modelValue', { ...props.modelValue, heading: value });
}

function onParagraphCommit(value: string): void {
  emit('update:modelValue', { ...props.modelValue, paragraph: value });
}
</script>

<template>
  <section class="space-y-4 px-5 py-5">
    <h3 class="text-sm font-semibold text-highlighted">Item {{ index }}</h3>

    <div class="space-y-1.5">
      <label class="text-sm font-medium text-default">Titel</label>
      <BInput
        :model-value="modelValue.heading"
        placeholder="Koptekst"
        size="md"
        class="w-full"
        @update:model-value="onHeadingCommit"
      />
    </div>

    <div class="space-y-1.5">
      <label class="text-sm font-medium text-default">Omschrijving</label>
      <BTextarea
        :model-value="modelValue.paragraph"
        :rows="3"
        :autoresize="true"
        placeholder="Alineatekst"
        size="md"
        class="w-full"
        @update:model-value="onParagraphCommit"
      />
    </div>
  </section>
</template>
