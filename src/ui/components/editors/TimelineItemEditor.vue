<script setup lang="ts">
import type { TimelineItem } from '../../../shared/types';
import WInput from '../ui/WInput.vue';
import WTextarea from '../ui/WTextarea.vue';

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
  <div class="space-y-4">
    <h3 class="text-sm font-semibold text-highlighted">Item {{ index }}</h3>
    <UFormField label="Titel">
      <WInput
        :model-value="modelValue.heading"
        placeholder="Koptekst"
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
        class="w-full"
        @update:model-value="onParagraphCommit"
      />
    </UFormField>
  </div>
</template>
