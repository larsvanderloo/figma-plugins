<script setup lang="ts">
/**
 * TitleDescriptionEditor — heading + optional paragraph inputs.
 *
 * Lifted from sections/TitleDescriptionEditor/src/TitleDescriptionEditor.vue.
 * Uses UFormField + UInput + UTextarea (Nuxt UI v4).
 *
 * Props-only renderer. Emits update:model. Does NOT import store.
 * Debounces 200 ms per ADR spec.
 * Owner: ui-engineer.
 */

import { ref, watch, onUnmounted } from 'vue';
import type { TitleDescriptionSection } from '@shared/messages.js';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TitleDescriptionEditorProps {
  model: TitleDescriptionSection;
  disabled?: boolean;
}

const props = withDefaults(defineProps<TitleDescriptionEditorProps>(), {
  disabled: false,
});

// ---------------------------------------------------------------------------
// Emits
// ---------------------------------------------------------------------------

const emit = defineEmits<{
  'update:model': [patch: { heading: string; paragraph: string | null }];
}>();

// ---------------------------------------------------------------------------
// Local draft state
// ---------------------------------------------------------------------------

const localHeading = ref<string>(props.model.heading);
const localParagraph = ref<string>(props.model.paragraph ?? '');
const hasParagraph = ref<boolean>(props.model.paragraph !== null);

watch(
  () => props.model.heading,
  (next) => {
    if (next !== localHeading.value) localHeading.value = next;
  },
);

watch(
  () => props.model.paragraph,
  (next) => {
    localParagraph.value = next ?? '';
    hasParagraph.value = next !== null;
  },
);

// ---------------------------------------------------------------------------
// Debounce
// ---------------------------------------------------------------------------

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function clearPending(): void {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

function scheduleEmit(): void {
  clearPending();
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    emit('update:model', {
      heading: localHeading.value,
      paragraph: hasParagraph.value ? localParagraph.value : null,
    });
  }, 200);
}

onUnmounted(() => {
  clearPending();
});

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

function onHeadingInput(value: string | number): void {
  localHeading.value = String(value);
  scheduleEmit();
}

function onParagraphInput(value: string | number): void {
  localParagraph.value = String(value);
  scheduleEmit();
}
</script>

<template>
  <fieldset
    class="title-description-editor"
    :disabled="disabled"
    :aria-disabled="disabled ? 'true' : undefined"
  >
    <legend class="sr-only">CopyWrap text fields</legend>

    <div class="space-y-3">
      <UFormField name="heading" label="Heading" size="md">
        <UInput
          :model-value="localHeading"
          placeholder="Slide title"
          :disabled="disabled ?? false"
          class="w-full"
          @update:model-value="onHeadingInput"
        />
      </UFormField>

      <UFormField v-if="hasParagraph" name="paragraph" label="Paragraph" size="md">
        <UTextarea
          :model-value="localParagraph"
          :rows="3"
          :autoresize="true"
          :disabled="disabled ?? false"
          placeholder="Paragraph text"
          class="w-full"
          @update:model-value="onParagraphInput"
        />
      </UFormField>
    </div>
  </fieldset>
</template>

<style scoped>
.title-description-editor {
  border: none;
  padding: 0;
  margin: 0;
  min-inline-size: 0;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
</style>
