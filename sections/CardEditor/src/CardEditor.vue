<script setup lang="ts">
/**
 * CardEditor — section for editing a single CardWrap card.
 *
 * ## Composition
 *
 * CardEditor composes three child sections rather than reimplementing primitives:
 *
 *   1. TitleDescriptionEditor (from @figma-plugins/sections-title-description-editor)
 *      → heading + paragraph text fields.
 *   2. IconPicker (from @figma-plugins/sections-icon-picker)
 *      → Lucide icon swap. Only rendered when card.icon !== null.
 *   3. ImageEditor (from @figma-plugins/sections-image-editor)
 *      → image upload + canvas crop. Only rendered when card.visualHash !== undefined.
 *
 * ## Section discipline (ADR-0010 §section-authoring-template)
 *
 * CardEditor is a PRESENTATION SECTION:
 *   - It does NOT dispatch messages directly (emit; let the parent wire).
 *   - It does NOT call store actions.
 *   - It does NOT import the bridge or useEditorActions.
 *   - Data flows in via the `card` prop. User edits flow out via typed emits.
 *   - The PARENT (CardList consumer → App.vue content tab, Sprint 3.4) is
 *     responsible for calling useEditorActions.applyCard() with the emitted
 *     payloads.
 *
 * ## Emits → useEditorActions.applyCard contract
 *
 * Each emit mirrors one optional field in the apply-card message payload:
 *   - `update:heading`   → { cardNodeId, heading }
 *   - `update:paragraph` → { cardNodeId, paragraph }
 *   - `update:icon`      → { cardNodeId, icon }
 *   - `update:visual`    → { cardNodeId, bytes } (raw image bytes; imageWrapId
 *     is not carried here — parent resolves the ImageWrap by cardNodeId context)
 *
 * ## Adapter bridge from child-section emits to CardEditor emits
 *
 * TitleDescriptionEditor emits `update:model` with { heading, paragraph }.
 * CardEditor splits these into separate `update:heading` / `update:paragraph`
 * emits so the parent can pass individual fields to applyCard, matching the
 * apply-card message shape's optional individual fields.
 *
 * IconPicker emits `update:modelValue` with a bare icon key string.
 * CardEditor wraps this into `update:icon` with { cardNodeId, iconName }.
 *
 * ImageEditor emits `update:image` with raw Uint8Array bytes.
 * CardEditor wraps this into `update:visual` with { cardNodeId, bytes }.
 * The filename is not carried through ImageEditor's emit; the parent constructs
 * a fallback filename when dispatching to the message bus.
 *
 * ## TitleDescriptionModel shim
 *
 * TitleDescriptionEditor requires a `model` prop of type TitleDescriptionModel
 * which includes a `copyWrapId`. CardEditor synthesises this from card.cardNodeId
 * because TitleDescriptionEditor doesn't own message dispatch — it only needs
 * the id to pass it back through in its emit, which CardEditor discards
 * (replacing with card.cardNodeId in the re-emitted payload).
 *
 * ## ImageModel shim
 *
 * ImageEditor requires a `model` prop of type ImageModel which includes
 * `imageWrapId` and `imageHash`. CardEditor maps card.cardNodeId → imageWrapId
 * (the parent resolves the actual ImageWrap node; this id is informational for
 * ImageEditor's aria-label only) and card.visualHash → imageHash.
 *
 * ## Accessibility
 *
 * - The outer <section> carries aria-labelledby pointing at the heading element
 *   that renders the `label` prop value (e.g. "Card 2 of 4").
 * - Each child section uses a <fieldset> or <section> with its own label.
 * - `disabled` propagates to all child sections via their `disabled` prop.
 * - Tab order: heading → paragraph (via TitleDescriptionEditor) →
 *   icon grid (via IconPicker, when present) → image pick button (via
 *   ImageEditor, when present). This matches visual top-to-bottom flow.
 * - No host Figma shortcuts (Cmd-Z, Cmd-D, Cmd-A) are captured.
 * - `prefers-reduced-motion` is respected inside each child section.
 * - axe-clean across all states: full card, null icon, no visual slot, disabled.
 *
 * Ownership: ui-engineer.
 * Resolves: MON-2893969761 (Sprint 3, Task 3.2).
 */

import { computed, useId } from 'vue';
import { TitleDescriptionEditor } from '@figma-plugins/sections-title-description-editor';
import type { TitleDescriptionModel } from '@figma-plugins/sections-title-description-editor';
import { IconPicker } from '@figma-plugins/sections-icon-picker';
import { ImageEditor } from '@figma-plugins/sections-image-editor';
import type { ImageModel } from '@figma-plugins/sections-image-editor';
import type { CardItem } from './types.js';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CardEditorProps {
  /** The card to edit. Drives all child sections. */
  card: CardItem;
  /**
   * Label shown as the section's accessible heading.
   * E.g. "Card 2 of 4" or "Editing card".
   * When omitted, a generic label is used.
   */
  label?: string;
  /**
   * When true all child sections are disabled.
   * Propagated individually to TitleDescriptionEditor, IconPicker, ImageEditor.
   * @default false
   */
  disabled?: boolean;
}

const props = withDefaults(defineProps<CardEditorProps>(), {
  disabled: false,
});

// ---------------------------------------------------------------------------
// Emits — mirror useEditorActions.applyCard per-field payload shape
// ---------------------------------------------------------------------------

export interface CardEditorEmits {
  /**
   * Heading changed. Parent passes { cardNodeId, heading } to applyCard.
   * Debounced by TitleDescriptionEditor (300 ms).
   */
  'update:heading': [payload: { cardNodeId: string; heading: string }];
  /**
   * Paragraph changed. Parent passes { cardNodeId, paragraph } to applyCard.
   * Debounced by TitleDescriptionEditor (300 ms).
   */
  'update:paragraph': [payload: { cardNodeId: string; paragraph: string }];
  /**
   * Icon changed. Parent passes { cardNodeId, icon } to applyCard.
   * Immediate (no debounce in IconPicker).
   */
  'update:icon': [payload: { cardNodeId: string; iconName: string }];
  /**
   * Visual (image) replaced. Parent passes { cardNodeId, bytes } to the
   * image upload flow.
   * Immediate (file-read is async but emit fires once the bytes are ready).
   */
  'update:visual': [payload: { cardNodeId: string; bytes: Uint8Array }];
}

const emit = defineEmits<CardEditorEmits>();

// ---------------------------------------------------------------------------
// Stable IDs for ARIA associations
// ---------------------------------------------------------------------------

const labelId = useId();

// ---------------------------------------------------------------------------
// Computed props for child sections
// ---------------------------------------------------------------------------

/**
 * Resolved label shown in the heading element and used as aria-labelledby target.
 * Falls back to "Edit card" when the caller doesn't supply a label.
 */
const resolvedLabel = computed<string>(() => props.label ?? 'Edit card');

/**
 * TitleDescriptionModel shim — TitleDescriptionEditor needs a copyWrapId.
 * We use cardNodeId as the synthetic id; TitleDescriptionEditor passes it
 * back through its update:model emit, which we discard (replacing with
 * card.cardNodeId in our re-emit).
 */
const titleDescriptionModel = computed<TitleDescriptionModel>(() => ({
  copyWrapId: props.card.cardNodeId,
  heading: props.card.heading,
  paragraph: props.card.paragraph,
}));

/**
 * True when the card has an icon slot (icon !== null).
 * When false, IconPicker is hidden entirely.
 */
const hasIcon = computed<boolean>(() => props.card.icon !== null);

/**
 * ImageModel shim — ImageEditor needs an imageWrapId and imageHash.
 * We map card.cardNodeId → imageWrapId (informational; for ImageEditor's
 * aria-label only — the parent resolves the actual ImageWrap node).
 * visualHash (string | null | undefined) aligns with imageHash (string | null).
 */
const imageModel = computed<ImageModel>(() => ({
  imageWrapId: props.card.cardNodeId,
  imageHash: props.card.visualHash ?? null,
}));

/**
 * True when the card has a visual slot (visualHash !== undefined).
 * When false, ImageEditor is hidden entirely.
 */
const hasVisual = computed<boolean>(() => props.card.visualHash !== undefined);

// ---------------------------------------------------------------------------
// Child-section event adapters
// ---------------------------------------------------------------------------

/**
 * TitleDescriptionEditor emits `update:model` with { heading, paragraph }.
 * Split and re-emit as individual heading/paragraph events so the parent
 * can pass them to applyCard independently (matching the optional-field shape).
 */
function onTitleDescriptionUpdate(patch: { heading: string; paragraph: string | null }): void {
  emit('update:heading', {
    cardNodeId: props.card.cardNodeId,
    heading: patch.heading,
  });
  // Only emit paragraph if TitleDescriptionEditor surfaced it (paragraph !== null).
  if (patch.paragraph !== null) {
    emit('update:paragraph', {
      cardNodeId: props.card.cardNodeId,
      paragraph: patch.paragraph,
    });
  }
}

/**
 * IconPicker emits `update:modelValue` with the icon key string.
 * Wrap into { cardNodeId, iconName } for the parent.
 */
function onIconUpdate(iconKey: string): void {
  emit('update:icon', {
    cardNodeId: props.card.cardNodeId,
    iconName: iconKey,
  });
}

/**
 * ImageEditor emits `update:image` with raw Uint8Array bytes.
 * Wrap into { cardNodeId, bytes } for the parent.
 */
function onVisualUpdate(bytes: Uint8Array): void {
  emit('update:visual', {
    cardNodeId: props.card.cardNodeId,
    bytes,
  });
}
</script>

<template>
  <!--
    <section> provides a landmark region. aria-labelledby references the
    heading element below, giving screen readers the accessible name
    "Card 2 of 4" (or whatever the caller supplies).
  -->
  <section class="card-editor" :aria-labelledby="labelId">
    <!-- ------------------------------------------------------------------ -->
    <!-- Section heading                                                       -->
    <!-- Rendered as a visually styled label (not an h* element — plugin      -->
    <!-- UIs are typically single-level panels without heading hierarchy).    -->
    <!-- The id is referenced by the section's aria-labelledby.              -->
    <!-- ------------------------------------------------------------------ -->
    <p :id="labelId" class="card-editor__label">{{ resolvedLabel }}</p>

    <!-- ------------------------------------------------------------------ -->
    <!-- Heading + paragraph — TitleDescriptionEditor                         -->
    <!-- ------------------------------------------------------------------ -->
    <!--
      TitleDescriptionEditor wraps inputs in a <fieldset disabled> when
      disabled=true, which propagates to all native inputs inside it
      (browser-native fieldset mechanism — no additional wiring needed).
    -->
    <TitleDescriptionEditor
      :model="titleDescriptionModel"
      :disabled="disabled ?? false"
      @update:model="onTitleDescriptionUpdate"
    />

    <!-- ------------------------------------------------------------------ -->
    <!-- Icon swap — IconPicker                                               -->
    <!-- Only shown when card.icon !== null (icon slot exists on the card).  -->
    <!-- ------------------------------------------------------------------ -->
    <div v-if="hasIcon" class="card-editor__sub-section">
      <p class="card-editor__sub-label" aria-hidden="true">Icon</p>
      <IconPicker
        :model-value="card.icon ?? ''"
        :disabled="disabled ?? false"
        @update:model-value="onIconUpdate"
      />
    </div>

    <!-- ------------------------------------------------------------------ -->
    <!-- Visual — ImageEditor                                                 -->
    <!-- Only shown when card.visualHash !== undefined (visual slot exists). -->
    <!-- ------------------------------------------------------------------ -->
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
/*
 * Compact density — matches the Figma plugin iframe context.
 * All colors reference CSS custom properties (design tokens) derived from
 * components/tokens/ so they adapt to Figma's light/dark themes without
 * hard-coded hex codes.
 *
 * Child sections (TitleDescriptionEditor, IconPicker, ImageEditor) own their
 * own internal spacing. This wrapper provides the outer stack gap.
 */

.card-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;

  /* Reset <section> browser defaults */
  padding: 0;
  margin: 0;
  border: none;
}

/* ---- Section label (accessible name + visual heading) ---- */

.card-editor__label {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--color-label, #374151);
  /* Optical alignment with child section controls */
  letter-spacing: 0.01em;
}

/* ---- Sub-section wrapper: icon or visual ---- */

.card-editor__sub-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

/* Sub-section visual label (decorative — aria-hidden) */
.card-editor__sub-label {
  margin: 0;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.4;
  color: var(--color-label, #6b7280);
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
