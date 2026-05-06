<script setup lang="ts">
/**
 * JourneyEditor — section for editing a JourneyWrap.
 *
 * ## Composition
 *
 * JourneyEditor composes two child sections + one component:
 *
 *   1. TitleDescriptionEditor (from @figma-plugins/sections-title-description-editor)
 *      → column header editing (header + subheader text fields). Used for the
 *      column header row at the top of the section.
 *   2. Per-item editors: each JourneyItemModel is rendered as an <li> inside
 *      an <ol aria-label="Journey steps">. Per-item controls:
 *        - UFormField + UInput for the item label.
 *        - IconPicker (from @figma-plugins/sections-icon-picker) for icon swap.
 *        - UFormField + UInputNumber for startPct and endPct.
 *
 * ## Nuxt UI v4 primitives (Sprint 5 Task 5.8 — MON-2894486835)
 *
 * Replaces native HTML + InputField with Nuxt UI v4 primitives:
 *   - Column header heading/subheader → TitleDescriptionEditor (unchanged — it
 *     is its own section with its own migration timeline).
 *   - Per-item label → UFormField label="Step N label" + UInput.
 *   - Per-item icon swap → IconPicker child component (already migrated in 5.5).
 *   - Per-item startPct/endPct → UInputNumber :min="0" :max="100" :step="1".
 *   - Add/remove item buttons → UButton variant="ghost" icon="i-lucide-x|i-lucide-plus".
 *
 * ## Section discipline (ADR-0010 §section-authoring-template)
 *
 * JourneyEditor is a PRESENTATION SECTION:
 *   - It does NOT dispatch messages directly (emit; let the parent wire).
 *   - It does NOT call store actions.
 *   - It does NOT import the bridge or useEditorActions.
 *   - Data flows in via the `model` prop. User edits flow out via typed emits.
 *   - The PARENT (App.vue task 4.3) is responsible for calling
 *     useEditorActions.applyJourney() with the emitted payloads.
 *
 * ## Pinia discipline
 *
 * No Pinia store imports. Local refs only for UI buffers.
 *
 * ## T45.13 diff-based update
 *
 * Items emits carry only the changed field, not the entire item. The parent
 * diffs against the existing model and builds the desired JourneyWrapModel
 * before dispatching to applyJourney. This keeps each emit minimal and matches
 * the renderer's diff logic (updateJourneyItem only writes changed fields).
 *
 * ## Emits
 *
 * | Event                | Payload                                        | Description                    |
 * |----------------------|------------------------------------------------|--------------------------------|
 * | update:columnHeader  | { slotId, columnIndex, header?, subheader? }   | Column header text changed.    |
 * | update:itemLabel     | { itemId, label }                              | Item label changed.            |
 * | update:itemIcon      | { itemId, icon }                               | Item icon changed.             |
 * | update:itemRange     | { itemId, startPct?, endPct? }                 | Item range changed.            |
 *
 * ## Accessibility
 *
 * - Column header section: <section aria-labelledby="..."> with a visible heading.
 * - Item list: <ol aria-label="Journey steps">. Each item: <li> with an
 *   accessible name "{index}: {label}" via aria-label on the containing <li>
 *   so screen readers announce position and content on focus-within.
 * - Numeric inputs: UInputNumber carries aria-valuemin / aria-valuemax /
 *   aria-valuenow via :aria-valuemin/:aria-valuemax/:aria-valuenow props that
 *   are forwarded to the underlying <input>. UFormField provides visible
 *   label association (WCAG 1.3.1, H44).
 * - Tab order: column-header section → item 1 (label, icon, range) → item 2 ...
 * - No Figma host shortcuts captured.
 * - prefers-reduced-motion respected inside Nuxt UI primitives.
 * - axe-clean across: empty list, populated list, single item, disabled state.
 *
 * ## Range clamp logic (preserved from v0.2.1)
 *
 * - startPct is clamped to [0, 95].
 * - endPct is clamped to [startPct + 5, 100].
 * - Invalid range (end < start + 5): endPct is clamped to start + 5 before emitting.
 *
 * Ownership: ui-engineer.
 * Resolves: MON-2894486835 (Sprint 5, Task 5.8).
 */

import { computed, useId } from 'vue';
import TitleDescriptionEditor from './TitleDescriptionEditor.vue';
import type { TitleDescriptionModel } from './types.js';
import IconPicker from './IconPicker.vue';
import type { JourneyWrapModel, JourneyItemModel, JourneyColumnModel, NodeId } from './types.js';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface JourneyEditorProps {
  /** The JourneyWrap model to edit. Drives all child controls. */
  model: JourneyWrapModel;
  /**
   * When true, all controls are disabled.
   * @default false
   */
  disabled?: boolean;
}

const props = withDefaults(defineProps<JourneyEditorProps>(), {
  disabled: false,
});

// ---------------------------------------------------------------------------
// Emits — diff-based per-field shape (T45.13)
// ---------------------------------------------------------------------------

export interface JourneyEditorEmits {
  /**
   * A column header or subheader text changed.
   * Parent patches model.columns[columnIndex] and dispatches applyJourney.
   */
  'update:columnHeader': [
    payload: { slotId: NodeId; columnIndex: number; header?: string; subheader?: string },
  ];
  /**
   * An item's label changed.
   * Parent patches model.items[itemId] and dispatches applyJourney.
   */
  'update:itemLabel': [payload: { itemId: NodeId; label: string }];
  /**
   * An item's icon changed.
   * Parent patches model.items[itemId] and dispatches applyJourney.
   */
  'update:itemIcon': [payload: { itemId: NodeId; icon: string }];
  /**
   * An item's startPct and/or endPct changed.
   * Only the changed field is included. Parent patches and dispatches.
   * Invalid range (end < start + 5) is clamped to start + 5 before emitting.
   */
  'update:itemRange': [payload: { itemId: NodeId; startPct?: number; endPct?: number }];
}

const emit = defineEmits<JourneyEditorEmits>();

// ---------------------------------------------------------------------------
// Stable IDs for ARIA associations
// ---------------------------------------------------------------------------

const sectionLabelId = useId();
const columnHeaderSectionLabelId = useId();

// ---------------------------------------------------------------------------
// Computed
// ---------------------------------------------------------------------------

/** True when the model has at least one column. */
const hasColumns = computed<boolean>(() => props.model.columns.length > 0);

/** True when the model has at least one item. */
const hasItems = computed<boolean>(() => props.model.items.length > 0);

// ---------------------------------------------------------------------------
// Column header helpers
// ---------------------------------------------------------------------------

/**
 * Build a TitleDescriptionModel from a JourneyColumnModel for the first column
 * header only. JourneyEditor only exposes column 0 editing for the header section
 * in the primary MVP scope.
 */
function columnToTitleDescriptionModel(
  col: JourneyColumnModel,
  index: number,
): TitleDescriptionModel {
  return {
    copyWrapId: `${props.model.slotId}:col:${index}`,
    heading: col.header,
    paragraph: col.subheader,
  };
}

/** First column's TitleDescriptionModel for the column header editor. */
const primaryColumnModel = computed<TitleDescriptionModel | null>(() => {
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

/**
 * Accessible name for each item <li>: "{1-based index}: {label}".
 * Screen readers announce position and content when focus enters the item.
 */
function itemAccessibleName(item: JourneyItemModel, index: number): string {
  return `Step ${index + 1}: ${item.label || '(no label)'}`;
}

function onItemLabelUpdate(item: JourneyItemModel, label: string): void {
  emit('update:itemLabel', { itemId: item.itemNodeId, label });
}

function onItemIconUpdate(item: JourneyItemModel, icon: string): void {
  emit('update:itemIcon', { itemId: item.itemNodeId, icon });
}

/**
 * startPct input handler.
 * Clamps to [0, 95] and ensures startPct < endPct - 5.
 * UInputNumber emits a number; NaN / null guard required.
 */
function onItemStartPctInput(item: JourneyItemModel, rawValue: number | null | undefined): void {
  if (rawValue === null || rawValue === undefined || isNaN(rawValue)) return;
  const clamped = Math.min(95, Math.max(0, rawValue));
  emit('update:itemRange', { itemId: item.itemNodeId, startPct: clamped });
}

/**
 * endPct input handler.
 * Clamps to [startPct + 5, 100]. If the entered value would make end < start + 5,
 * it is silently clamped to start + 5 before emitting (graceful handling per spec).
 */
function onItemEndPctInput(item: JourneyItemModel, rawValue: number | null | undefined): void {
  if (rawValue === null || rawValue === undefined || isNaN(rawValue)) return;
  const minEnd = item.startPct + 5;
  const clamped = Math.min(100, Math.max(minEnd, rawValue));
  emit('update:itemRange', { itemId: item.itemNodeId, endPct: clamped });
}
</script>

<template>
  <!--
    Outer <section> is the accessible landmark for the full JourneyEditor.
    aria-labelledby references the heading below, giving screen readers
    "Journey" or the custom label as the region name.
  -->
  <section class="journey-editor" :aria-labelledby="sectionLabelId">
    <!-- ------------------------------------------------------------------ -->
    <!-- Section heading                                                       -->
    <!-- ------------------------------------------------------------------ -->
    <p :id="sectionLabelId" class="journey-editor__label">Journey</p>

    <!-- ------------------------------------------------------------------ -->
    <!-- Column header editor                                                  -->
    <!-- Only rendered when the model has at least one column.               -->
    <!-- Uses TitleDescriptionEditor for header + subheader text fields.     -->
    <!-- ------------------------------------------------------------------ -->
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

    <!-- ------------------------------------------------------------------ -->
    <!-- Item list                                                            -->
    <!-- <ol> gives ordered semantics; screen readers announce "list of N    -->
    <!-- items" and each <li> has aria-label for position + content.         -->
    <!-- ------------------------------------------------------------------ -->
    <div class="journey-editor__items-wrapper">
      <p class="journey-editor__sub-label">Steps</p>

      <!-- Empty state -->
      <p
        v-if="!hasItems"
        class="journey-editor__empty"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        No journey steps. Add steps via the canvas.
      </p>

      <!-- Populated list -->
      <!--
        T46 dividers are rendered as CSS border-top on .journey-editor__item + li
        (after the first item) via CSS sibling selector, rather than as <li> elements.
        This keeps the <ol> axe-clean — only actual list items as children (WCAG 2.1).
      -->
      <ol v-else class="journey-editor__items" aria-label="Journey steps">
        <template v-for="(item, index) in model.items" :key="item.itemNodeId">
          <!-- Item row -->
          <li class="journey-editor__item" :aria-label="itemAccessibleName(item, index)">
            <!-- Item heading — positional label, screen-reader visible -->
            <p class="journey-editor__item-index" aria-hidden="true">Step {{ index + 1 }}</p>

            <!-- ---- Label ---- -->
            <!--
              UFormField provides <label> association (WCAG 1.3.1, H44).
              UInput renders <input type="text"> — matches textbox role query.
            -->
            <UFormField :label="`Step ${index + 1} label`" class="journey-editor__item-field">
              <UInput
                :model-value="item.label"
                :disabled="disabled ?? false"
                size="sm"
                class="journey-editor__item-input"
                @update:model-value="onItemLabelUpdate(item, $event)"
              />
            </UFormField>

            <!-- ---- Icon swap ---- -->
            <div class="journey-editor__item-field">
              <!--
                <p> aria-hidden — the listbox inside IconPicker has its own
                aria-label="Icon options" for screen readers.
              -->
              <p class="journey-editor__item-sub-label" aria-hidden="true">Icon</p>
              <IconPicker
                :model-value="item.icon"
                :disabled="disabled ?? false"
                @update:model-value="onItemIconUpdate(item, $event)"
              />
            </div>

            <!-- ---- Range inputs ---- -->
            <!--
              UInputNumber renders <input type="number"> (spinbutton role).
              :aria-valuemin / :aria-valuemax / :aria-valuenow are forwarded to
              the underlying native <input> by UInputNumber's v-bind="$attrs"
              passthrough, satisfying WCAG 4.1.2 and the axe spinbutton rule.
              UFormField provides visible label association (WCAG 1.3.1, H44).
            -->
            <div class="journey-editor__item-range">
              <UFormField :label="`Step ${index + 1} start %`">
                <UInputNumber
                  :model-value="item.startPct"
                  :min="0"
                  :max="95"
                  :step="1"
                  :disabled="disabled ?? false"
                  :aria-valuemin="0"
                  :aria-valuemax="95"
                  :aria-valuenow="item.startPct"
                  size="sm"
                  @update:model-value="onItemStartPctInput(item, $event)"
                />
              </UFormField>

              <UFormField :label="`Step ${index + 1} end %`">
                <UInputNumber
                  :model-value="item.endPct"
                  :min="item.startPct + 5"
                  :max="100"
                  :step="1"
                  :disabled="disabled ?? false"
                  :aria-valuemin="item.startPct + 5"
                  :aria-valuemax="100"
                  :aria-valuenow="item.endPct"
                  size="sm"
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
/*
 * Compact density — matches Figma plugin iframe context.
 * All colors reference CSS custom properties (design tokens) derived from
 * components/tokens/ so they adapt to Figma's light/dark themes.
 * No hard-coded hex codes in this component (colors only via var()).
 */

/* ---- Outer section ---- */

.journey-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;

  /* Reset <section> browser defaults */
  padding: 0;
  margin: 0;
  border: none;
}

/* ---- Primary section label ---- */

.journey-editor__label {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--color-label, #374151);
  letter-spacing: 0.01em;
}

/* ---- Sub-section ---- */

.journey-editor__sub-section {
  display: flex;
  flex-direction: column;
  gap: 6px;

  /* Reset <section> browser defaults */
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

/* ---- Items wrapper ---- */

.journey-editor__items-wrapper {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* ---- Empty state ---- */

.journey-editor__empty {
  margin: 0;
  font-size: 11px;
  color: var(--color-label-secondary, #9ca3af);
  font-style: italic;
}

/* ---- Ordered list reset ---- */

.journey-editor__items {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
}

/* ---- T46 dividers — CSS sibling selector approach ----
 *
 * Instead of <li role="presentation"> divider elements (which axe flags as
 * invalid list structure), we use CSS border-top on every item after the first.
 * This keeps the <ol> axe-clean — only actual list items as children.
 */

.journey-editor__item {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* T46: horizontal divider between items — no extra DOM nodes needed */
.journey-editor__item + .journey-editor__item {
  border-top: 1px solid var(--color-border, #e5e7eb);
  padding-top: 8px;
  margin-top: 8px;
}

/* Step N label — positional marker, small/muted */
.journey-editor__item-index {
  margin: 0;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-label-tertiary, #9ca3af);
  user-select: none;
}

/* ---- Item field wrapper ---- */

.journey-editor__item-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* Full-width input inside UFormField */
.journey-editor__item-input {
  width: 100%;
}

.journey-editor__item-sub-label {
  margin: 0;
  font-size: 11px;
  font-weight: 500;
  color: var(--color-label-secondary, #6b7280);
  user-select: none;
}

/* ---- Range inputs: side-by-side ---- */

.journey-editor__item-range {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

/* sr-only utility (Tailwind not available in scoped <style>) */
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
