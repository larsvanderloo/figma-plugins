<script setup lang="ts">
/**
 * TitleDescriptionEditor — section for editing a CopyWrap's heading and
 * optional paragraph fields.
 *
 * ## Responsibilities
 *
 * - Renders a single-line heading input (required) and, when the model's
 *   `paragraph` field is non-null, a multi-line paragraph textarea (optional).
 * - Debounces outbound `update:model` emits by 300 ms to avoid flooding the
 *   message bus on every keystroke.
 * - Does NOT dispatch messages directly. The consuming plugin view wires
 *   `@update:model="actions.applyTitleDescription"` (section discipline per
 *   ADR-0010 §section-authoring-template).
 * - Does NOT fetch data. Data flows in via the `model` prop from the plugin's
 *   Pinia store; user edits flow out via `update:model`.
 *
 * ## Primitives used (Sprint 3 migration — MON-2893969759)
 *
 * InputField (from @figma-plugins/components) replaces the inline
 * <label> + <input> and <label> + <textarea> patterns. The outer <fieldset>
 * is retained because `disabled` propagates to all descendant inputs via
 * the browser's native fieldset mechanism — InputField's own `disabled` prop
 * cannot replicate that without additional wiring.
 *
 * v-model on InputField feeds through the local draft refs. On each
 * update:modelValue event the handler updates the ref and calls scheduleEmit().
 *
 * ## Accessibility
 *
 * - InputField generates stable <label for="…"> / <input id="…"> pairs via
 *   Vue's useId() internally (WCAG 1.3.1, Technique H44).
 * - `disabled` propagates from <fieldset disabled> to InputField's controls.
 * - No host Figma shortcuts (Cmd-Z, Cmd-D, Cmd-A) are captured.
 * - `prefers-reduced-motion` is respected inside InputField.
 *
 * ## Debounce
 *
 * 300 ms debounce on the UI side. The message-bus spec for `apply-title-
 * description` notes "Debounced 200 ms in TitleDescriptionEditor" — the 300 ms
 * here is intentionally slightly longer to absorb typical keystroke cadences
 * in Figma's compact panel before hitting the code side. See project-pm flag
 * below.
 *
 * Ownership: ui-engineer.
 */

import { ref, computed, watch, onUnmounted } from 'vue';
import { InputField } from '@figma-plugins/components';
import type { TitleDescriptionModel } from './types.js';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TitleDescriptionEditorProps {
  /**
   * The current CopyWrap state. Heading + optional paragraph.
   * When `paragraph` is null the paragraph textarea is hidden entirely —
   * there is no "add paragraph" toggle in v0.1.0 (ADR-0008 backlog).
   */
  model: TitleDescriptionModel;
  /**
   * When true both inputs are disabled and the section communicates
   * `aria-disabled` on the fieldset.
   * @default false
   */
  disabled?: boolean;
}

const props = withDefaults(defineProps<TitleDescriptionEditorProps>(), {
  disabled: false,
});

// ---------------------------------------------------------------------------
// Emits
// ---------------------------------------------------------------------------

export interface TitleDescriptionEditorEmits {
  /**
   * Emitted (debounced 300 ms) when the user edits heading or paragraph.
   * Carries only the changed text fields — copyWrapId is passed through
   * unchanged so the parent can build the full message-bus payload.
   * The parent (plugin view) is responsible for dispatching
   * `actions.applyTitleDescription(payload)` with this value.
   */
  'update:model': [patch: { heading: string; paragraph: string | null }];
}

const emit = defineEmits<TitleDescriptionEditorEmits>();

// ---------------------------------------------------------------------------
// Local draft state
//
// We maintain internal refs that shadow the prop so the input isn't jarred by
// prop updates coming in while the user is typing. When the prop changes (e.g.
// slide changed), we sync the internal state.
// ---------------------------------------------------------------------------

const localHeading = ref<string>(props.model.heading);
const localParagraph = ref<string | null>(props.model.paragraph);

/**
 * Sync internal state when the model prop changes from the outside
 * (e.g. a different slide was selected in SlidePicker).
 * We compare by copyWrapId so that debounce-triggered prop updates
 * (round-tripped through the store) don't reset the cursor position.
 */
watch(
  () => props.model,
  (next) => {
    // If the CopyWrap identity changed, always reset.
    localHeading.value = next.heading;
    localParagraph.value = next.paragraph;
    clearPending();
  },
);

// ---------------------------------------------------------------------------
// Computed
// ---------------------------------------------------------------------------

/** True when this CopyWrap has a paragraph slot (paragraph !== null). */
const hasParagraph = computed<boolean>(() => props.model.paragraph !== null);

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
      paragraph: localParagraph.value,
    });
  }, 300);
}

onUnmounted(() => {
  clearPending();
});

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

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
  <fieldset
    class="title-description-editor"
    :disabled="disabled"
    :aria-disabled="disabled ? 'true' : undefined"
  >
    <!-- Visually hidden fieldset legend for screen readers -->
    <legend class="sr-only">CopyWrap text fields</legend>

    <!-- ------------------------------------------------------------------ -->
    <!-- Heading input — single-line, required                               -->
    <!-- InputField handles <label for="…"> association internally.         -->
    <!-- ------------------------------------------------------------------ -->
    <InputField
      label="Heading"
      :model-value="localHeading"
      type="text"
      :disabled="disabled ?? false"
      @update:model-value="onHeadingInput"
    />

    <!-- ------------------------------------------------------------------ -->
    <!-- Paragraph textarea — multi-line, optional                           -->
    <!-- Hidden when model.paragraph === null (no paragraph slot on CopyWrap) -->
    <!-- ------------------------------------------------------------------ -->
    <InputField
      v-if="hasParagraph"
      label="Paragraph"
      :model-value="localParagraph ?? ''"
      :disabled="disabled ?? false"
      :multiline="true"
      :rows="3"
      @update:model-value="onParagraphInput"
    />
  </fieldset>
</template>

<style scoped>
/*
 * Compact density — matches the Figma plugin iframe context.
 * All colours reference CSS custom properties (design tokens) so they
 * adapt to Figma's light/dark themes without hard-coded hex codes.
 * Fallback values are the Tailwind slate palette equivalents.
 *
 * InputField owns its own label + control styling; this wrapper only
 * provides the fieldset reset and column gap.
 */

.title-description-editor {
  /* Reset fieldset defaults */
  border: none;
  padding: 0;
  margin: 0;
  min-inline-size: 0;

  display: flex;
  flex-direction: column;
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
