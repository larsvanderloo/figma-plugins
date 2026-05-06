<script setup lang="ts">
/**
 * CardEditor — section for editing a single CardWrap card.
 *
 * ## Phase 5.15 consolidation (ADR-0015)
 *
 * Imports rewritten from @figma-plugins/sections-* to relative ./Component.vue
 * siblings. The component logic is unchanged from sections/CardEditor/src/.
 *
 * ## Composition
 *
 *   1. TitleDescriptionEditor → heading + paragraph text fields.
 *   2. IconPicker → Lucide icon swap. Only when card.icon !== null.
 *   3. ImageEditor → image upload + crop. Only when card.visualHash !== undefined.
 *      NOTE: New ImageEditor from PR#59 uses props { modelValue, previewUrl,
 *      fillW, fillH } + emits `upload`. CardEditor adapts the old `@update:image`
 *      pattern to `@upload` and supplies sensible defaults for previewUrl/fillW/fillH.
 *
 * ## Section discipline (ADR-0010 §section-authoring-template)
 *
 * Presentation section — no store imports, no bridge, no figma.* calls.
 *
 * Owner: ui-engineer (migrated by figma-api-engineer per ADR-0015).
 */

import { computed, useId } from 'vue';
import TitleDescriptionEditor from './TitleDescriptionEditor.vue';
import type { TitleDescriptionModel } from './types.js';
import IconPicker from './IconPicker.vue';
import ImageEditor from './ImageEditor.vue';
import type { CardItem } from './types.js';

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
// Stable IDs
// ---------------------------------------------------------------------------

const labelId = useId();

// ---------------------------------------------------------------------------
// Computed props for child sections
// ---------------------------------------------------------------------------

const resolvedLabel = computed<string>(() => props.label ?? 'Edit card');

const titleDescriptionModel = computed<TitleDescriptionModel>(() => ({
  copyWrapId: props.card.cardNodeId,
  heading: props.card.heading,
  paragraph: props.card.paragraph,
}));

const hasIcon = computed<boolean>(() => props.card.icon !== null);
const hasVisual = computed<boolean>(() => props.card.visualHash !== undefined);

/**
 * ImageEditor (PR#59 version) takes { hasImage, imageHash } as modelValue.
 */
const imageModelValue = computed(() => ({
  hasImage: props.card.visualHash !== null && props.card.visualHash !== undefined,
  imageHash: props.card.visualHash ?? null,
}));

// ---------------------------------------------------------------------------
// Event adapters
// ---------------------------------------------------------------------------

function onTitleDescriptionUpdate(patch: { heading: string; paragraph: string | null }): void {
  emit('update:heading', { cardNodeId: props.card.cardNodeId, heading: patch.heading });
  if (patch.paragraph !== null) {
    emit('update:paragraph', { cardNodeId: props.card.cardNodeId, paragraph: patch.paragraph });
  }
}

function onIconUpdate(iconKey: string): void {
  emit('update:icon', { cardNodeId: props.card.cardNodeId, iconName: iconKey });
}

function onVisualUpdate(bytes: Uint8Array): void {
  emit('update:visual', { cardNodeId: props.card.cardNodeId, bytes });
}
</script>

<template>
  <section class="card-editor" :aria-labelledby="labelId">
    <p :id="labelId" class="card-editor__label">{{ resolvedLabel }}</p>

    <TitleDescriptionEditor
      :model="titleDescriptionModel"
      :disabled="disabled ?? false"
      @update:model="onTitleDescriptionUpdate"
    />

    <div v-if="hasIcon" class="card-editor__sub-section">
      <p class="card-editor__sub-label" aria-hidden="true">Icon</p>
      <IconPicker
        :model-value="card.icon ?? ''"
        :disabled="disabled ?? false"
        @update:model-value="onIconUpdate"
      />
    </div>

    <div v-if="hasVisual" class="card-editor__sub-section">
      <!--
        ImageEditor (PR#59) interface: modelValue + previewUrl + fillW + fillH.
        previewUrl: null — no preview in v0.1.0 (image bytes flow code→ui separately).
        fillW/fillH: null — aspect ratio unknown; ImageEditor uses fixed height.
        @upload maps to @update:visual in CardEditor's outer API.
      -->
      <ImageEditor
        :model-value="imageModelValue"
        :preview-url="null"
        :fill-w="null"
        :fill-h="null"
        :disabled="disabled ?? false"
        @upload="onVisualUpdate"
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
