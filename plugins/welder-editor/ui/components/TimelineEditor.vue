<script setup lang="ts">
/**
 * TimelineEditor — ordered list of timeline steps.
 *
 * Lifted from sections/TimelineEditor/src/TimelineEditor.vue.
 * Updated imports:
 *   - TitleDescriptionEditor from @/components/
 *   - StatusMessage → inline div[role="status"] + UAlert
 *   - Types from @shared/messages.js
 *
 * Props-only renderer. Emits update:itemHeading + update:itemParagraph.
 * Does NOT import store.
 * Owner: ui-engineer. Sprint 5 Task 5.9.
 */

import { computed } from 'vue';
import TitleDescriptionEditor from '@/components/TitleDescriptionEditor.vue';
import type { TimelineItem, TitleDescriptionSection } from '@shared/messages.js';

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
// Derived state
// ---------------------------------------------------------------------------

const isEmpty = computed<boolean>(() => props.items.length === 0);

// ---------------------------------------------------------------------------
// TitleDescriptionSection shim
// ---------------------------------------------------------------------------

function toTitleDescriptionModel(item: TimelineItem): TitleDescriptionSection {
  return {
    copyWrapId: item.copyWrapNodeId,
    heading: item.heading,
    paragraph: item.paragraph,
    headingDim: null,
  };
}

// ---------------------------------------------------------------------------
// Event adapters
// ---------------------------------------------------------------------------

function onItemUpdate(itemId: string, patch: { heading: string; paragraph: string | null }): void {
  emit('update:itemHeading', { itemId, value: patch.heading });
  if (patch.paragraph !== null) {
    emit('update:itemParagraph', { itemId, value: patch.paragraph });
  }
}
</script>

<template>
  <div class="timeline-editor">
    <p v-if="label" class="timeline-editor__label">{{ label }}</p>

    <!-- Empty state -->
    <div
      v-if="isEmpty"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      class="timeline-editor__empty"
    >
      No timeline steps
    </div>

    <!-- Populated list -->
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

.timeline-editor__empty {
  font-size: 11px;
  color: var(--color-label, #6b7280);
  font-style: italic;
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
