<!--
  TimelineItemEditor — editor for one timeline item (heading + paragraph).
  Uses WInput / WTextarea so typing doesn't fire a sandbox round-trip per
  keystroke (commit-on-blur).
-->
<script setup lang="ts">
import type { TimelineItem } from '../../../types';
import WInput from '../ui/WInput.vue';
import WTextarea from '../ui/WTextarea.vue';
import WCard from '../ui/WCard.vue';

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
  <WCard :title="`Item ${index}`">
    <div class="space-y-4">
      <UFormField label="Titel">
        <WInput
          :model-value="modelValue.heading"
          placeholder="Koptekst"
          size="md"
          class="w-full"
          @update:model-value="onHeadingCommit"
        />
      </UFormField>

      <UFormField label="Omschrijving">
        <WTextarea
          :model-value="modelValue.paragraph"
          :rows="3"
          :autoresize="true"
          placeholder="Alineatekst"
          size="md"
          class="w-full"
          @update:model-value="onParagraphCommit"
        />
      </UFormField>
    </div>
  </WCard>
</template>
