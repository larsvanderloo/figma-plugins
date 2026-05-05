<script setup lang="ts">
/**
 * BadgeEditor — section for editing a Badge label (text) and icon (Lucide key).
 *
 * ## Slot contract
 *
 * The icon picker is decoupled from this section via a named slot:
 *
 *   <slot name="icon-picker" v-bind="{ icon, onChange: setIcon }" />
 *
 * The consumer wires whatever icon picker component is available (task 2.6
 * IconPicker, or a placeholder during development). BadgeEditor does not
 * import or reference any specific icon picker.
 *
 * ## Primitives used (Sprint 3 migration — MON-2893969759)
 *
 * InputField replaces the inline <label> + <input> pattern for the badge
 * label field. FormGroup (group mode) replaces the <div role="group"> +
 * <span> pattern for the icon-picker slot wrapper.
 *
 * InputField handles:
 *   - <label for="…"> / <input id="…"> via useId() internally.
 *   - Visible focus ring, disabled state, appearance:none, transition.
 *
 * FormGroup (group=true) handles:
 *   - <div role="group" aria-labelledby="…"> wrapper.
 *   - <span id="…"> label — exposes labelId via slot binding so the
 *     slot content can reference it if needed.
 *
 * ## Emit timing
 *
 * update:model is debounced 300 ms after the last label keystroke or icon
 * change so the parent (and the message bus) is not flooded during fast
 * typing. The debounce is reset on each new edit.
 *
 * ## Data flow
 *
 * Props flow in (model + disabled). User edits flow out via emits.
 * This section does NOT dispatch messages to the Figma code side — that is
 * the consuming plugin view's responsibility (per ADR-0010 §section contract).
 *
 * ## Accessibility
 *
 * - Label input: InputField renders <label>Badge label</label> associated
 *   via for/id. Screen readers announce "Badge label" on focus.
 * - Icon picker slot wrapper: FormGroup group=true renders
 *   <div role="group" aria-labelledby="…"> + <span>Badge icon</span>.
 *   This is valid ARIA (the group role accepts aria-labelledby) and groups
 *   the slot content under the "Badge icon" label for AT users.
 * - Disabled state: InputField[disabled] removes it from the tab order and
 *   is conveyed to AT. The slot receives `disabled` so the consumer can
 *   pass it to the icon picker.
 * - No live region needed: updates are user-initiated and synchronous.
 *
 * Ownership: ui-engineer.
 * Resolves: MON-2893850050 (Sprint 2, Task 2.5).
 */

import { ref, watch, onBeforeUnmount } from 'vue';
import { InputField, FormGroup } from '@figma-plugins/components';
import type { BadgeModel } from './types.js';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface BadgeEditorProps {
  /**
   * The current badge state. Drives both the label input and the icon slot.
   * Pass the BadgeSection slice from the slide store.
   */
  model: BadgeModel;
  /**
   * When true, the label input is disabled and the slot receives
   * disabled=true so the consumer can disable the icon picker as well.
   */
  disabled?: boolean;
}

const props = withDefaults(defineProps<BadgeEditorProps>(), {
  disabled: false,
});

// ---------------------------------------------------------------------------
// Emits
// ---------------------------------------------------------------------------

export interface BadgeEditorEmits {
  /**
   * Fired (debounced 300 ms) when label or icon changes.
   * The payload carries the full updated model — consumers replace the
   * whole model slice and dispatch apply-badge to the code side.
   */
  'update:model': [model: Pick<BadgeModel, 'label' | 'icon'>];
}

const emit = defineEmits<BadgeEditorEmits>();

// ---------------------------------------------------------------------------
// Internal reactive state — mirrors prop, updated on prop change
// ---------------------------------------------------------------------------

/** Local copy of label, kept in sync with props.model.label. */
const label = ref<string>(props.model.label);
/** Local copy of icon key, kept in sync with props.model.icon. */
const icon = ref<string>(props.model.icon);

/**
 * Keep local state in sync when the parent replaces the model entirely
 * (e.g. slide selection change). Avoid triggering the debounce for prop
 * sync updates by only updating when values actually differ.
 */
watch(
  () => props.model,
  (next) => {
    if (next.label !== label.value) label.value = next.label;
    if (next.icon !== icon.value) icon.value = next.icon;
  },
  { deep: false },
);

// ---------------------------------------------------------------------------
// Debounced emit
// ---------------------------------------------------------------------------

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleEmit(): void {
  if (debounceTimer !== null) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    emit('update:model', { label: label.value, icon: icon.value });
  }, 300);
}

onBeforeUnmount(() => {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
});

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

function handleLabelInput(value: string): void {
  label.value = value;
  scheduleEmit();
}

/**
 * Called by the icon-picker slot via the `onChange` binding.
 * Accepts the new Lucide icon key.
 */
function setIcon(newIcon: string): void {
  if (newIcon === icon.value) return;
  icon.value = newIcon;
  scheduleEmit();
}
</script>

<template>
  <div class="badge-editor">
    <!-- Label field — InputField handles <label for="…"> association -->
    <InputField
      label="Badge label"
      :model-value="label"
      type="text"
      :disabled="disabled ?? false"
      @update:model-value="handleLabelInput"
    />

    <!-- Icon picker slot — FormGroup group=true provides role="group" + aria-labelledby -->
    <!--
      group=true: <div role="group" aria-labelledby="…"> + <span> label.
      Valid ARIA: the group role accepts aria-labelledby. Groups the slot
      content under the "Badge icon" label for AT users without relying on
      aria-label on a generic div (which would be aria-prohibited-attr per
      WCAG 2.1 AA).
    -->
    <FormGroup label="Badge icon" :group="true">
      <!--
        Slot contract:
          icon     — current Lucide key string (read-only for the picker).
          onChange — callback the picker calls with the new Lucide key.
          disabled — boolean forwarded from the section's disabled prop.

        Example consumer wiring (once IconPicker lands in task 2.6):
          <template #icon-picker="{ icon, onChange, disabled }">
            <IconPicker :value="icon" :disabled="disabled" @select="onChange" />
          </template>
      -->
      <slot name="icon-picker" :icon="icon" :on-change="setIcon" :disabled="disabled" />
    </FormGroup>
  </div>
</template>

<style scoped>
.badge-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
