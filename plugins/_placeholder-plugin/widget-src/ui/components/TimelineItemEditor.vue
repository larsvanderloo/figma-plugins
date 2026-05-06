<!--
  TimelineItemEditor — v-model-gebonden editor voor één timeline-item
  binnen de Content-tab (spec §13 T31).

  Timeline-items hebben geen icon-picker en geen visual-upload (anders dan
  CardItemEditor) — alleen Heading + Paragraph. Gemodelleerd naar
  TitleDescriptionEditor's simpele debounced-watch-pattern (inclusief de
  T30-anti-regression `!== local`-guards zodat een main-thread-echo tijdens
  het typen niet de lokale state overschrijft, commit c895fe7).

  Props:
    modelValue: TimelineItem  — huidige waarden
    index:      number        — 1-based volgnummer voor de header-label

  Emits:
    update:modelValue — volledige TimelineItem, debounced 200ms sinds de
      laatste keystroke. ContentPanel post dit als `update-timeline-item`
      naar de main-thread.
-->
<script setup lang="ts">
import { ref, watch } from 'vue';
import type { TimelineItem } from '../../types';

interface Props {
  modelValue: TimelineItem;
  index: number;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: TimelineItem];
}>();

// Lokale reactieve kopie zodat de user type-snelheid niet wordt
// afgeknepen door de 200ms-debounce. De emit gebeurt na debounce.
const localHeading = ref<string>(props.modelValue.heading);
const localParagraph = ref<string>(props.modelValue.paragraph);

// Granulaire watches met `!== local`-guards — T30-anti-regression
// (commit c895fe7): voorkomt dat onze eigen debounce-emit als echo
// terugkomt en een in-progress edit overschrijft midden in een
// user-keystroke.
watch(
  () => props.modelValue.heading,
  (next) => {
    if (next !== localHeading.value) {
      localHeading.value = next;
    }
  },
);

watch(
  () => props.modelValue.paragraph,
  (next) => {
    if (next !== localParagraph.value) {
      localParagraph.value = next;
    }
  },
);

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleEmit(): void {
  if (debounceTimer !== null) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    emit('update:modelValue', {
      copyWrapNodeId: props.modelValue.copyWrapNodeId,
      heading: localHeading.value,
      paragraph: localParagraph.value,
    });
  }, 200);
}

function onHeadingInput(value: string): void {
  localHeading.value = value;
  scheduleEmit();
}

function onParagraphInput(value: string): void {
  localParagraph.value = value;
  scheduleEmit();
}
</script>

<template>
  <section
    class="space-y-3 rounded-[calc(var(--ui-radius)*4)] bg-default px-5 py-8 shadow-[0_4px_16px_-6px_rgba(0,0,0,0.08)]"
  >
    <h3 class="text-base font-semibold text-default">Timeline-item {{ index }}</h3>

    <UFormField name="heading" label="Koptekst" size="md">
      <UInput
        :model-value="localHeading"
        placeholder="Koptekst"
        class="w-full"
        @update:model-value="onHeadingInput"
      />
    </UFormField>

    <UFormField name="paragraph" label="Alinea" size="md">
      <UTextarea
        :model-value="localParagraph"
        :rows="3"
        :autoresize="true"
        placeholder="Alineatekst"
        class="w-full"
        @update:model-value="onParagraphInput"
      />
    </UFormField>
  </section>
</template>
