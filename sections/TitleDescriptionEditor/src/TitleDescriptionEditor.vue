<script setup lang="ts">
/**
 * TitleDescriptionEditor — section for editing a CopyWrap's heading and
 * optional paragraph fields.
 *
 * ## Responsibilities
 *
 * - Renders a single-line heading input (required) and, when the model's
 *   `paragraph` field is non-null, a multi-line paragraph textarea (optional).
 * - Debounces outbound `update:model` emits by 200 ms to avoid flooding the
 *   message bus on every keystroke.
 * - Does NOT dispatch messages directly. The consuming plugin view wires
 *   `@update:model="actions.applyTitleDescription"` (section discipline per
 *   ADR-0010 §section-authoring-template).
 * - Does NOT fetch data. Data flows in via the `model` prop from the plugin's
 *   Pinia store; user edits flow out via `update:model`.
 *
 * ## Primitives used (Sprint 5 migration — MON-2894475033)
 *
 * UFormField + UInput + UTextarea (Nuxt UI v4) replace the @figma-plugins/components
 * InputField primitive. UFormField generates stable <label for="…"> / <input id="…">
 * pairs via Nuxt UI's internal id wiring (WCAG 1.3.1, Technique H44). The outer
 * <fieldset> is retained because `disabled` propagates to all descendant inputs
 * via the browser's native fieldset mechanism.
 *
 * ## Accessibility
 *
 * - UFormField generates stable <label for="…"> / <input id="…"> pairs
 *   (WCAG 1.3.1, Technique H44).
 * - `disabled` propagates from <fieldset disabled> to UInput/UTextarea controls.
 * - No host Figma shortcuts (Cmd-Z, Cmd-D, Cmd-A) are captured.
 * - `prefers-reduced-motion` is respected inside Nuxt UI components.
 *
 * ## Debounce
 *
 * 200 ms debounce — matches the v0.2.1 canonical reference and the message-bus
 * spec for `apply-title-description`. Absorbs typical keystroke cadences
 * in Figma's compact panel before hitting the code side.
 *
 * ## Accent ranges
 *
 * headingDim / accent-range editing is deferred per ADR-0008.
 * No dim-words logic is included in this component.
 *
 * Ownership: ui-engineer.
 * Resolves: MON-2894475033 (Sprint 5, Wave 3, Task 5.4).
 */

import { ref, watch, onUnmounted } from 'vue';
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
   * Emitted (debounced 200 ms) when the user edits heading or paragraph.
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
// prop updates coming in while the user is typing. Granular watchers below
// sync individual fields — not the whole model object — so a debounce-echo
// from the parent store doesn't reset the cursor mid-keystroke.
// ---------------------------------------------------------------------------

const localHeading = ref<string>(props.model.heading);
const localParagraph = ref<string>(props.model.paragraph ?? '');
const hasParagraph = ref<boolean>(props.model.paragraph !== null);

// Granular watcher for heading — only updates local ref when the external
// value genuinely differs (prevents debounce-echo resetting the cursor).
watch(
  () => props.model.heading,
  (next) => {
    if (next !== localHeading.value) localHeading.value = next;
  },
);

// Granular watcher for paragraph — syncs paragraph text and visibility
// on slide switches.
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
    <!-- Visually hidden fieldset legend for screen readers -->
    <legend class="sr-only">CopyWrap text fields</legend>

    <!-- ------------------------------------------------------------------ -->
    <!-- Heading input — single-line, required                               -->
    <!-- UFormField handles <label for="…"> association internally.         -->
    <!-- ------------------------------------------------------------------ -->
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

      <!-- ---------------------------------------------------------------- -->
      <!-- Paragraph textarea — multi-line, optional                         -->
      <!-- Hidden when model.paragraph === null (no paragraph slot on CopyWrap) -->
      <!-- ---------------------------------------------------------------- -->
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
/*
 * Compact density — matches the Figma plugin iframe context.
 * All colours reference CSS custom properties (design tokens) so they
 * adapt to Figma's light/dark themes without hard-coded hex codes.
 *
 * UFormField + UInput/UTextarea own their own label + control styling;
 * this wrapper only provides the fieldset reset.
 */

.title-description-editor {
  /* Reset fieldset defaults */
  border: none;
  padding: 0;
  margin: 0;
  min-inline-size: 0;
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
