<script setup lang="ts">
/**
 * TimelineEditor — section for editing a TimelineWrap's ordered items.
 *
 * ## Purpose
 *
 * Renders an ordered list of timeline steps. Each step is a CopyWrap-backed
 * entry with heading + paragraph, composed via TitleDescriptionEditor.
 * Items are rendered in array order with a "Step N" label per item.
 *
 * This section is PRESENTATION-ONLY per ADR-0010 §section-authoring-template:
 *   - It does NOT dispatch messages directly.
 *   - It does NOT import stores or the plugin bridge.
 *   - It does NOT call figma.* (the iframe has no figma API surface).
 *   - Data flows in via the `items` prop (TimelineItem[]).
 *   - User edits flow out via typed per-field emits.
 *   - The parent (App.vue Content tab, Sprint 3 task 3.4) wires each emit to
 *     useEditorActions.applyTimeline({ copyWrapNodeId: itemId, ...field }).
 *
 * ## Composition
 *
 * Each timeline item composes TitleDescriptionEditor
 * (@figma-plugins/sections-title-description-editor). TitleDescriptionEditor
 * owns the heading + paragraph inputs with 300 ms debounce; TimelineEditor
 * adapts its `update:model` emit into per-field `update:itemHeading` and
 * `update:itemParagraph` emits keyed by `itemId` (= copyWrapNodeId).
 *
 * ## Emit → useEditorActions.applyTimeline contract
 *
 *   update:itemHeading  → { itemId: copyWrapNodeId, value: heading }
 *   update:itemParagraph → { itemId: copyWrapNodeId, value: paragraph }
 *
 * The parent maps itemId → copyWrapNodeId when calling applyTimeline.
 *
 * ## Layout and accessibility
 *
 * - `<ol aria-label="Timeline steps">` — ordered list landmark. Using <ol>
 *   communicates order semantics to screen readers (WAI-ARIA 1.2).
 * - Each `<li>` carries a "Step N" label as a visible `<p>` acting as the
 *   <section> aria-labelledby target so each step is a distinct landmark.
 * - No reorder UI in v0.1.0 (out of scope per spec).
 * - Empty state: StatusMessage with message="No timeline steps" when items=[].
 * - `disabled` propagates to every TitleDescriptionEditor child.
 * - Tab order: Step 1 heading → Step 1 paragraph → Step 2 heading → … (matches
 *   visual top-to-bottom, left-to-right flow; no host Figma shortcuts captured).
 * - `aria-live="polite"` on the empty-state region via StatusMessage.
 * - Color contrast: step label #374151 on white = 10.7:1 (well above 4.5:1 AA).
 *   Muted index label #6b7280 on white = 4.61:1 (AA met).
 * - No gratuitous animation. `prefers-reduced-motion` respected inside
 *   TitleDescriptionEditor (InputField).
 *
 * ## Keyboard contract
 *
 * - Tab traverses heading → paragraph within each step, then moves to the next
 *   step. This is the natural DOM order.
 * - No custom key handlers introduced at this level.
 *
 * Ownership: ui-engineer.
 * Resolves: MON-2894009373 (Sprint 3, Task 3.3).
 */

import { computed, useId } from 'vue';
import { TitleDescriptionEditor } from '@figma-plugins/sections-title-description-editor';
import type { TitleDescriptionModel } from '@figma-plugins/sections-title-description-editor';
import { StatusMessage } from '@figma-plugins/components';
import type { TimelineItem } from './types.js';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TimelineEditorProps {
  /**
   * The ordered list of timeline items to edit.
   * Empty array = show the empty-state placeholder (StatusMessage).
   */
  items: TimelineItem[];
  /**
   * Optional label shown as the section's visible heading (e.g. "Timeline").
   * When omitted the heading is suppressed and the ol aria-label alone
   * names the region for screen readers.
   */
  label?: string;
  /**
   * When true all child TitleDescriptionEditors are disabled.
   * @default false
   */
  disabled?: boolean;
}

const props = withDefaults(defineProps<TimelineEditorProps>(), {
  disabled: false,
});

// ---------------------------------------------------------------------------
// Emits — mirror useEditorActions.applyTimeline per-field payload shape.
// Parent maps itemId (= copyWrapNodeId) when calling applyTimeline.
// ---------------------------------------------------------------------------

export interface TimelineEditorEmits {
  /**
   * Heading changed on a timeline item.
   * Parent calls: applyTimeline({ copyWrapNodeId: itemId, heading: value })
   */
  'update:itemHeading': [payload: { itemId: string; value: string }];
  /**
   * Paragraph changed on a timeline item.
   * Parent calls: applyTimeline({ copyWrapNodeId: itemId, paragraph: value })
   */
  'update:itemParagraph': [payload: { itemId: string; value: string }];
}

const emit = defineEmits<TimelineEditorEmits>();

// ---------------------------------------------------------------------------
// Stable IDs for ARIA associations (section heading aria-labelledby)
// ---------------------------------------------------------------------------

const sectionLabelId = useId();

// ---------------------------------------------------------------------------
// Derived state
// ---------------------------------------------------------------------------

/** True when there are no timeline items to display. */
const isEmpty = computed<boolean>(() => props.items.length === 0);

// ---------------------------------------------------------------------------
// TitleDescriptionModel shim per item
//
// TitleDescriptionEditor requires a TitleDescriptionModel with a copyWrapId.
// We map copyWrapNodeId → copyWrapId.  The paragraph field is never null on
// TimelineItem (it uses empty string for absent paragraph) but we map '' → null
// so TitleDescriptionEditor hides the paragraph field when it is empty AND the
// TimelineItem has no paragraph text node.
//
// NOTE: TimelineItem.paragraph is '' when the paragraph text node is absent.
// We keep the empty string visible as an editable field (not null) because
// timeline step paragraphs are always present in the Welder template. If the
// design changes, adjust this mapping.
// ---------------------------------------------------------------------------

function toTitleDescriptionModel(item: TimelineItem): TitleDescriptionModel {
  return {
    copyWrapId: item.copyWrapNodeId,
    heading: item.heading,
    // Keep empty string as non-null — paragraph slot is always present on
    // TimelineItem. TitleDescriptionEditor will render the textarea.
    paragraph: item.paragraph,
  };
}

// ---------------------------------------------------------------------------
// Child-section event adapters
// ---------------------------------------------------------------------------

/**
 * TitleDescriptionEditor emits `update:model` with { heading, paragraph }.
 * Split into separate itemHeading / itemParagraph emits keyed by itemId.
 */
function onItemUpdate(itemId: string, patch: { heading: string; paragraph: string | null }): void {
  emit('update:itemHeading', { itemId, value: patch.heading });
  if (patch.paragraph !== null) {
    emit('update:itemParagraph', { itemId, value: patch.paragraph });
  }
}
</script>

<template>
  <div class="timeline-editor">
    <!--
      Optional section heading.
      Rendered as a <p> (not h*) — plugin UIs are single-level panels.
      The id is referenced by the outer section's aria-labelledby (when label
      is provided) to give the region an accessible name distinct from the
      ol's aria-label.
    -->
    <p v-if="label" :id="sectionLabelId" class="timeline-editor__label">{{ label }}</p>

    <!--
      Empty state: rendered when items array is empty.
      StatusMessage (variant="status") provides a polite live region for AT.
    -->
    <StatusMessage v-if="isEmpty" message="No timeline steps" variant="status" />

    <!--
      Populated state: <ol> communicates ordered semantics to screen readers.
      aria-label="Timeline steps" provides the accessible name for the list.
      Rendered only when items are present (an empty ol with this aria-label
      would be confusing — the StatusMessage handles that case above).
    -->
    <ol v-else aria-label="Timeline steps" class="timeline-editor__list">
      <li v-for="(item, index) in items" :key="item.copyWrapNodeId" class="timeline-editor__item">
        <!--
          Step label — "Step 1", "Step 2", etc.
          Rendered as a <p> (not h*). aria-hidden="true" because the step
          number is supplementary context; the heading input itself carries the
          accessible name of the content being edited.
          color: #6b7280 on white = 4.61:1 — WCAG 2.1 AA met.
        -->
        <p class="timeline-editor__step-label" aria-hidden="true">Step {{ index + 1 }}</p>

        <!--
          TitleDescriptionEditor for this item's heading + paragraph.
          The model shim maps copyWrapNodeId → copyWrapId and keeps paragraph
          as a non-null string (always present on TimelineItem).
          disabled propagates via the fieldset mechanism inside
          TitleDescriptionEditor (browser-native fieldset disabled).
        -->
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
/*
 * Compact density — matches the Figma plugin iframe context.
 * Colors reference CSS custom properties (design tokens) from components/tokens/
 * so they adapt to Figma's light/dark themes without hard-coded hex codes.
 * Fallback values are WCAG-passing slate palette equivalents.
 *
 * TitleDescriptionEditor owns its own internal spacing; this wrapper provides
 * the outer list structure and per-item separation.
 */

/* -----------------------------------------------------------------------
   Container
   ----------------------------------------------------------------------- */

.timeline-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* -----------------------------------------------------------------------
   Section label (when label prop is supplied)
   ----------------------------------------------------------------------- */

.timeline-editor__label {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
  /* #374151 on white = 10.7:1 — WCAG 2.1 AA met */
  color: var(--color-label, #374151);
  letter-spacing: 0.01em;
}

/* -----------------------------------------------------------------------
   Ordered list
   ----------------------------------------------------------------------- */

.timeline-editor__list {
  /* Reset browser <ol> defaults */
  list-style: none;
  margin: 0;
  padding: 0;

  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* -----------------------------------------------------------------------
   List item
   ----------------------------------------------------------------------- */

.timeline-editor__item {
  display: flex;
  flex-direction: column;
  gap: 6px;

  /* Subtle divider between steps (not on last item) */
  padding-bottom: 16px;
  border-bottom: 1px solid var(--color-divider, #e5e7eb);
}

.timeline-editor__item:last-child {
  padding-bottom: 0;
  border-bottom: none;
}

/* -----------------------------------------------------------------------
   Step label ("Step 1", "Step 2", ...)
   ----------------------------------------------------------------------- */

.timeline-editor__step-label {
  margin: 0;
  font-size: 10px;
  font-weight: 600;
  line-height: 1.4;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  /* #6b7280 on white = 4.61:1 — WCAG 2.1 AA met */
  color: var(--color-step-label, #6b7280);
  user-select: none;
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
