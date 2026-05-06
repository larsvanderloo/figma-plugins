<script setup lang="ts">
/**
 * CardEditor — section for editing a single CardWrap card.
 *
 * Lifted from sections/CardEditor/src/CardEditor.vue.
 * Updated imports:
 *   - TitleDescriptionEditor, IconPicker, ImageEditor from @/components/
 *   - Types from @shared/messages.js
 *   - ImageModel from imageEditorTypes.js (co-located helper)
 *
 * Props-only renderer. Emits update:heading/paragraph/icon/visual.
 * Does NOT import store.
 * Owner: ui-engineer. Sprint 5 Task 5.9.
 */

import { computed, useId } from 'vue';
import TitleDescriptionEditor from '@/components/TitleDescriptionEditor.vue';
import IconPicker from '@/components/IconPicker.vue';
import ImageEditor from '@/components/ImageEditor.vue';
import type { ImageModel } from './imageEditorTypes.js';
import type { CardItem, TitleDescriptionSection } from '@shared/messages.js';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CardEditorProps {
  card: CardItem;
  label?: string;
  disabled?: boolean;
}

const props = withDefaults(defineProps<CardEditorProps>(), {
  disabled: false,
});

// ---------------------------------------------------------------------------
// Emits
// ---------------------------------------------------------------------------

export interface CardEditorEmits {
  'update:heading': [payload: { cardNodeId: string; heading: string }];
  'update:paragraph': [payload: { cardNodeId: string; paragraph: string }];
  'update:icon': [payload: { cardNodeId: string; iconName: string }];
  'update:visual': [payload: { cardNodeId: string; bytes: Uint8Array }];
}

const emit = defineEmits<CardEditorEmits>();

// ---------------------------------------------------------------------------
// IDs
// ---------------------------------------------------------------------------

const labelId = useId();

// ---------------------------------------------------------------------------
// Computed
// ---------------------------------------------------------------------------

const resolvedLabel = computed<string>(() => props.label ?? 'Edit card');

const titleDescriptionModel = computed<TitleDescriptionSection>(() => ({
  copyWrapId: props.card.cardNodeId,
  heading: props.card.heading,
  paragraph: props.card.paragraph,
  headingDim: null,
}));

const hasIcon = computed<boolean>(() => props.card.icon !== null);

const imageModel = computed<ImageModel>(() => ({
  imageWrapId: props.card.cardNodeId,
  imageHash: props.card.visualHash ?? null,
}));

const hasVisual = computed<boolean>(() => props.card.visualHash !== undefined);

// ---------------------------------------------------------------------------
// Child-section event adapters
// ---------------------------------------------------------------------------

function onTitleDescriptionUpdate(patch: { heading: string; paragraph: string | null }): void {
  emit('update:heading', {
    cardNodeId: props.card.cardNodeId,
    heading: patch.heading,
  });
  if (patch.paragraph !== null) {
    emit('update:paragraph', {
      cardNodeId: props.card.cardNodeId,
      paragraph: patch.paragraph,
    });
  }
}

function onIconUpdate(iconKey: string): void {
  emit('update:icon', {
    cardNodeId: props.card.cardNodeId,
    iconName: iconKey,
  });
}

function onVisualUpdate(bytes: Uint8Array): void {
  emit('update:visual', {
    cardNodeId: props.card.cardNodeId,
    bytes,
  });
}
</script>

<template>
  <section class="card-editor" :aria-labelledby="labelId">
    <p :id="labelId" class="card-editor__label">{{ resolvedLabel }}</p>

    <!-- Heading + paragraph -->
    <TitleDescriptionEditor
      :model="titleDescriptionModel"
      :disabled="disabled ?? false"
      @update:model="onTitleDescriptionUpdate"
    />

    <!-- Icon swap -->
    <div v-if="hasIcon" class="card-editor__sub-section">
      <p class="card-editor__sub-label" aria-hidden="true">Icon</p>
      <IconPicker
        :model-value="card.icon ?? ''"
        :disabled="disabled ?? false"
        @update:model-value="onIconUpdate"
      />
    </div>

    <!-- Visual -->
    <div v-if="hasVisual" class="card-editor__sub-section">
      <ImageEditor
        :model="imageModel"
        :disabled="disabled ?? false"
        @update:image="onVisualUpdate"
      />
    </div>
  </section>
</template>

<style scoped>
.card-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0;
  margin: 0;
  border: none;
}

.card-editor__label {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--color-label, #374151);
  letter-spacing: 0.01em;
}

.card-editor__sub-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.card-editor__sub-label {
  margin: 0;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.4;
  color: var(--color-label, #6b7280);
  user-select: none;
}
</style>
