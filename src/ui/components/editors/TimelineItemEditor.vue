<script setup lang="ts">
import type { TimelineItem } from '../../../shared/types';
import WInput from '../ui/WInput.vue';
import WTextarea from '../ui/WTextarea.vue';
import { useLiveText } from '../../composables/useLiveText';

interface Props {
  modelValue: TimelineItem;
  index: number;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: TimelineItem];
}>();

// Live events debounce onto the same emit path as commit; useTimelineEditor's no-op guard dedupes.
// modelValue is spread only at fire time so the other field keeps its current store value; commit
// cancels the pending debounce first — else it would post a stale value after the commit.
let liveHeadingValue = '';
const liveHeading = useLiveText(() =>
  emit('update:modelValue', { ...props.modelValue, heading: liveHeadingValue }),
);
function onHeadingLive(value: string): void {
  liveHeadingValue = value;
  liveHeading.schedule();
}
function onHeadingCommit(value: string): void {
  liveHeading.cancel();
  emit('update:modelValue', { ...props.modelValue, heading: value });
}

let liveParagraphValue = '';
const liveParagraph = useLiveText(() =>
  emit('update:modelValue', { ...props.modelValue, paragraph: liveParagraphValue }),
);
function onParagraphLive(value: string): void {
  liveParagraphValue = value;
  liveParagraph.schedule();
}
function onParagraphCommit(value: string): void {
  liveParagraph.cancel();
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
        @live="onHeadingLive"
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
        @live="onParagraphLive"
      />
    </UFormField>
  </div>
</template>
