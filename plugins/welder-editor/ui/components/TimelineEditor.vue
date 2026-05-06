<script setup lang="ts">
/**
 * TimelineEditor — section for editing a TimelineWrap's ordered items.
 *
 * ## Phase 5.15 consolidation (ADR-0015)
 *
 * Imports rewritten from @figma-plugins/sections-* and @figma-plugins/components
 * to relative ./Component.vue siblings. Logic unchanged from sections/TimelineEditor/src/.
 *
 * Presentation-only per ADR-0010: no store imports, no bridge, no figma.*.
 *
 * Owner: ui-engineer (migrated by figma-api-engineer per ADR-0015).
 */

import { computed, useId } from 'vue';
import TitleDescriptionEditor from './TitleDescriptionEditor.vue';
import type { TitleDescriptionModel } from './types.js';
import StatusMessage from './StatusMessage.vue';
import type { TimelineItem } from './types.js';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TimelineEditorProps {
  items: TimelineItem[];
  label?: string;
  disabled?: boolean;
}

const props = withDefaults(defineProps<TimelineEditorProps>(), {
  disabled: false,
});

// ---------------------------------------------------------------------------
// Emits
// ---------------------------------------------------------------------------

export interface TimelineEditorEmits {
  'update:itemHeading': [payload: { itemId: string; value: string }];
  'update:itemParagraph': [payload: { itemId: string; value: string }];
}

const emit = defineEmits<TimelineEditorEmits>();

// ---------------------------------------------------------------------------
// Stable IDs
// ---------------------------------------------------------------------------

const sectionLabelId = useId();

// ---------------------------------------------------------------------------
// Derived state
// ---------------------------------------------------------------------------

const isEmpty = computed<boolean>(() => props.items.length === 0);

function toTitleDescriptionModel(item: TimelineItem): TitleDescriptionModel {
  return {
    copyWrapId: item.copyWrapNodeId,
    heading: item.heading,
    paragraph: item.paragraph,
  };
}

function onItemUpdate(itemId: string, patch: { heading: string; paragraph: string | null }): void {
  emit('update:itemHeading', { itemId, value: patch.heading });
  if (patch.paragraph !== null) {
    emit('update:itemParagraph', { itemId, value: patch.paragraph });
  }
}
</script>

<template>
  <div class="timeline-editor">
    <p v-if="label" :id="sectionLabelId" class="timeline-editor__label">{{ label }}</p>

    <StatusMessage v-if="isEmpty" message="No timeline steps" variant="status" />

    <ol v-else aria-label="Timeline steps" class="timeline-editor__list">
      <li v-for="(item, index) in items" :key="item.copyWrapNodeId" class="timeline-editor__item">
        <p class="timeline-editor__step-label" aria-hidden="true">Step {{ index + 1 }}</p>
        <TitleDescriptionEditor
          :model="toTitleDescriptionModel(item)"
          :disabled="disabled ?? false"
          @update:model="onItemUpdate(item.copyWrapNodeId, $event)"
        />
      </li>
    </ol>
  </div>
</template>

<style scoped>
.timeline-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.timeline-editor__label {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--color-label, #374151);
  letter-spacing: 0.01em;
}

.timeline-editor__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.timeline-editor__item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--color-divider, #e5e7eb);
}

.timeline-editor__item:last-child {
  padding-bottom: 0;
  border-bottom: none;
}

.timeline-editor__step-label {
  margin: 0;
  font-size: 10px;
  font-weight: 600;
  line-height: 1.4;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-step-label, #6b7280);
  user-select: none;
}
</style>
