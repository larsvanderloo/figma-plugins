<script setup lang="ts">
/**
 * JourneyEditor — section for editing a JourneyWrap.
 *
 * Lifted from sections/JourneyEditor/src/JourneyEditor.vue.
 * Updated imports:
 *   - TitleDescriptionEditor from @/components/TitleDescriptionEditor.vue
 *   - IconPicker from @/components/IconPicker.vue
 *   - Types from @shared/messages.js (no local types.ts needed)
 *   - InputField → UFormField + UInput (Nuxt UI v4)
 *
 * T45.13 diff-based update preserved (per-field emits).
 * Props-only renderer. Does NOT import store.
 * Owner: ui-engineer. Sprint 5 Task 5.8 (JourneyEditor).
 */

import { computed, useId } from 'vue';
import TitleDescriptionEditor from '@/components/TitleDescriptionEditor.vue';
import IconPicker from '@/components/IconPicker.vue';
import type {
  JourneyWrapModel,
  JourneyItemModel,
  JourneyColumnModel,
  TitleDescriptionSection,
} from '@shared/messages.js';

type NodeId = string;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface JourneyEditorProps {
  model: JourneyWrapModel;
  disabled?: boolean;
}

const props = withDefaults(defineProps<JourneyEditorProps>(), {
  disabled: false,
});

// ---------------------------------------------------------------------------
// Emits (T45.13 diff-based per-field shape)
// ---------------------------------------------------------------------------

export interface JourneyEditorEmits {
  'update:columnHeader': [
    payload: { slotId: NodeId; columnIndex: number; header?: string; subheader?: string },
  ];
  'update:itemLabel': [payload: { itemId: NodeId; label: string }];
  'update:itemIcon': [payload: { itemId: NodeId; icon: string }];
  'update:itemRange': [payload: { itemId: NodeId; startPct?: number; endPct?: number }];
}

const emit = defineEmits<JourneyEditorEmits>();

// ---------------------------------------------------------------------------
// Stable IDs
// ---------------------------------------------------------------------------

const sectionLabelId = useId();
const columnHeaderSectionLabelId = useId();

// ---------------------------------------------------------------------------
// Computed
// ---------------------------------------------------------------------------

const hasColumns = computed<boolean>(() => props.model.columns.length > 0);
const hasItems = computed<boolean>(() => props.model.items.length > 0);

// ---------------------------------------------------------------------------
// Column header helpers
// ---------------------------------------------------------------------------

function columnToTitleDescriptionModel(
  col: JourneyColumnModel,
  index: number,
): TitleDescriptionSection {
  return {
    copyWrapId: `${props.model.slotId}:col:${index}`,
    heading: col.header,
    paragraph: col.subheader,
    headingDim: null,
  };
}

const primaryColumnModel = computed<TitleDescriptionSection | null>(() => {
  if (!hasColumns.value) return null;
  return columnToTitleDescriptionModel(props.model.columns[0]!, 0);
});

function onColumnHeaderUpdate(
  columnIndex: number,
  patch: { heading: string; paragraph: string | null },
): void {
  const payload: { slotId: NodeId; columnIndex: number; header?: string; subheader?: string } = {
    slotId: props.model.slotId,
    columnIndex,
  };
  if (patch.heading !== props.model.columns[columnIndex]?.header) {
    payload.header = patch.heading;
  }
  if (patch.paragraph !== null && patch.paragraph !== props.model.columns[columnIndex]?.subheader) {
    payload.subheader = patch.paragraph;
  }
  emit('update:columnHeader', payload);
}

// ---------------------------------------------------------------------------
// Item helpers
// ---------------------------------------------------------------------------

function itemAccessibleName(item: JourneyItemModel, index: number): string {
  return `Step ${index + 1}: ${item.label || '(no label)'}`;
}

function onItemLabelUpdate(item: JourneyItemModel, label: string): void {
  emit('update:itemLabel', { itemId: item.itemNodeId, label });
}

function onItemIconUpdate(item: JourneyItemModel, icon: string): void {
  emit('update:itemIcon', { itemId: item.itemNodeId, icon });
}

function onItemStartPctInput(item: JourneyItemModel, rawValue: string | number): void {
  const parsed = parseFloat(String(rawValue));
  if (isNaN(parsed)) return;
  const clamped = Math.min(95, Math.max(0, parsed));
  emit('update:itemRange', { itemId: item.itemNodeId, startPct: clamped });
}

function onItemEndPctInput(item: JourneyItemModel, rawValue: string | number): void {
  const parsed = parseFloat(String(rawValue));
  if (isNaN(parsed)) return;
  const minEnd = item.startPct + 5;
  const clamped = Math.min(100, Math.max(minEnd, parsed));
  emit('update:itemRange', { itemId: item.itemNodeId, endPct: clamped });
}
</script>

<template>
  <section class="journey-editor" :aria-labelledby="sectionLabelId">
    <p :id="sectionLabelId" class="journey-editor__label">Journey</p>

    <!-- Column header editor -->
    <section
      v-if="hasColumns && primaryColumnModel !== null"
      class="journey-editor__sub-section"
      :aria-labelledby="columnHeaderSectionLabelId"
    >
      <p :id="columnHeaderSectionLabelId" class="journey-editor__sub-label">Column header</p>
      <TitleDescriptionEditor
        :model="primaryColumnModel"
        :disabled="disabled ?? false"
        @update:model="onColumnHeaderUpdate(0, $event)"
      />
    </section>

    <!-- Item list -->
    <div class="journey-editor__items-wrapper">
      <p class="journey-editor__sub-label">Steps</p>

      <p
        v-if="!hasItems"
        class="journey-editor__empty"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        No journey steps. Add steps via the canvas.
      </p>

      <ol v-else class="journey-editor__items" aria-label="Journey steps">
        <template v-for="(item, index) in model.items" :key="item.itemNodeId">
          <li class="journey-editor__item" :aria-label="itemAccessibleName(item, index)">
            <p class="journey-editor__item-index" aria-hidden="true">Step {{ index + 1 }}</p>

            <!-- Label -->
            <div class="journey-editor__item-field">
              <UFormField
                :name="`step-${index}-label`"
                :label="`Step ${index + 1} label`"
                size="md"
              >
                <UInput
                  :model-value="item.label"
                  type="text"
                  :disabled="disabled ?? false"
                  class="w-full"
                  @update:model-value="onItemLabelUpdate(item, String($event))"
                />
              </UFormField>
            </div>

            <!-- Icon swap -->
            <div class="journey-editor__item-field">
              <p class="journey-editor__item-sub-label" aria-hidden="true">Icon</p>
              <IconPicker
                :model-value="item.icon"
                :disabled="disabled ?? false"
                @update:model-value="onItemIconUpdate(item, $event)"
              />
            </div>

            <!-- Range inputs -->
            <div class="journey-editor__item-range">
              <UFormField
                :name="`step-${index}-start`"
                :label="`Step ${index + 1} start %`"
                size="md"
              >
                <UInput
                  :model-value="String(item.startPct)"
                  type="number"
                  :min="0"
                  :max="95"
                  :step="1"
                  :disabled="disabled ?? false"
                  :aria-valuemin="0"
                  :aria-valuemax="95"
                  :aria-valuenow="item.startPct"
                  class="w-full"
                  @update:model-value="onItemStartPctInput(item, $event)"
                />
              </UFormField>
              <UFormField :name="`step-${index}-end`" :label="`Step ${index + 1} end %`" size="md">
                <UInput
                  :model-value="String(item.endPct)"
                  type="number"
                  :min="item.startPct + 5"
                  :max="100"
                  :step="1"
                  :disabled="disabled ?? false"
                  :aria-valuemin="item.startPct + 5"
                  :aria-valuemax="100"
                  :aria-valuenow="item.endPct"
                  class="w-full"
                  @update:model-value="onItemEndPctInput(item, $event)"
                />
              </UFormField>
            </div>
          </li>
        </template>
      </ol>
    </div>
  </section>
</template>

<style scoped>
.journey-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0;
  margin: 0;
  border: none;
}

.journey-editor__label {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--color-label, #374151);
  letter-spacing: 0.01em;
}

.journey-editor__sub-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0;
  margin: 0;
  border: none;
}

.journey-editor__sub-label {
  margin: 0;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.4;
  color: var(--color-label-secondary, #6b7280);
  user-select: none;
}

.journey-editor__items-wrapper {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.journey-editor__empty {
  margin: 0;
  font-size: 11px;
  color: var(--color-label-secondary, #9ca3af);
  font-style: italic;
}

.journey-editor__items {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.journey-editor__item {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.journey-editor__item + .journey-editor__item {
  border-top: 1px solid var(--color-border, #e5e7eb);
  padding-top: 8px;
  margin-top: 8px;
}

.journey-editor__item-index {
  margin: 0;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-label-tertiary, #9ca3af);
  user-select: none;
}

.journey-editor__item-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.journey-editor__item-sub-label {
  margin: 0;
  font-size: 11px;
  font-weight: 500;
  color: var(--color-label-secondary, #6b7280);
  user-select: none;
}

.journey-editor__item-range {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
</style>
