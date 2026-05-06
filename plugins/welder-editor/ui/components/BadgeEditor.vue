<script setup lang="ts">
/**
 * BadgeEditor — section for editing a Badge label (text) and icon (Lucide key).
 *
 * ## Phase 5.15 consolidation (ADR-0015)
 *
 * Migrated from @figma-plugins/components InputField + FormGroup to Nuxt UI v4
 * UFormField + UInput (the plugin's vite config now has @nuxt/ui/vite wired).
 *
 * ## Slot contract
 *
 * The icon picker is decoupled from this section via a named slot:
 *   <slot name="icon-picker" v-bind="{ icon, onChange: setIcon, disabled }" />
 *
 * ## Emit timing
 *
 * update:model is debounced 300 ms after the last label keystroke or icon change.
 *
 * ## Data flow
 *
 * Props flow in (model + disabled). User edits flow out via emits.
 * Does NOT dispatch messages to the Figma code side.
 *
 * ## Accessibility
 *
 * - Label input: UFormField renders <label> associated via for/id.
 * - Icon picker slot wrapper: role="group" aria-labelledby groups the slot.
 * - Disabled state: UInput[disabled] removes from tab order.
 *
 * Owner: ui-engineer (migrated to plugin-internal ui/components/ by figma-api-engineer).
 * ADR-0015: sections/* collapsed into plugins/welder-editor/ui/components/.
 */

import { ref, watch, useId, onBeforeUnmount } from 'vue';
import type { BadgeModel } from './types.js';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface BadgeEditorProps {
  model: BadgeModel;
  disabled?: boolean;
}

const props = withDefaults(defineProps<BadgeEditorProps>(), {
  disabled: false,
});

// ---------------------------------------------------------------------------
// Emits
// ---------------------------------------------------------------------------

export interface BadgeEditorEmits {
  'update:model': [model: Pick<BadgeModel, 'label' | 'icon'>];
}

const emit = defineEmits<BadgeEditorEmits>();

// ---------------------------------------------------------------------------
// ARIA IDs
// ---------------------------------------------------------------------------

const iconGroupId = useId();

// ---------------------------------------------------------------------------
// Internal reactive state
// ---------------------------------------------------------------------------

const label = ref<string>(props.model.label);
const icon = ref<string>(props.model.icon);

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

function handleLabelInput(value: string | number): void {
  label.value = String(value);
  scheduleEmit();
}

function setIcon(newIcon: string): void {
  if (newIcon === icon.value) return;
  icon.value = newIcon;
  scheduleEmit();
}
</script>

<template>
  <div class="badge-editor">
    <!-- Label field — UFormField handles <label for="…"> association -->
    <UFormField name="badge-label" label="Badge label" size="md">
      <UInput
        :model-value="label"
        type="text"
        :disabled="disabled ?? false"
        class="w-full"
        @update:model-value="handleLabelInput"
      />
    </UFormField>

    <!-- Icon picker slot — role="group" aria-labelledby groups the slot content -->
    <div>
      <p :id="iconGroupId" class="badge-editor__icon-label">Badge icon</p>
      <div role="group" :aria-labelledby="iconGroupId" class="badge-editor__icon-slot">
        <slot name="icon-picker" :icon="icon" :on-change="setIcon" :disabled="disabled" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.badge-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.badge-editor__icon-label {
  margin: 0 0 4px 0;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.4;
  color: var(--color-label, #6b7280);
  user-select: none;
}

.badge-editor__icon-slot {
  display: flex;
  align-items: center;
}
</style>
