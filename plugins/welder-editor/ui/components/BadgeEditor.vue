<script setup lang="ts">
/**
 * BadgeEditor — badge label text + icon slot.
 *
 * Lifted from sections/BadgeEditor/src/BadgeEditor.vue.
 * Uses UFormField + UInput (Nuxt UI v4) replacing InputField primitive.
 * FormGroup group wrapper replaced by a plain div + role="group".
 *
 * Icon picker is decoupled via named slot "icon-picker".
 * Props-only renderer. Emits update:model. Does NOT import store.
 * Debounces 300 ms.
 * Owner: ui-engineer.
 */

import { ref, watch, onBeforeUnmount } from 'vue';
import type { BadgeSection } from '@shared/messages.js';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface BadgeEditorProps {
  model: BadgeSection;
  disabled?: boolean;
}

const props = withDefaults(defineProps<BadgeEditorProps>(), {
  disabled: false,
});

// ---------------------------------------------------------------------------
// Emits
// ---------------------------------------------------------------------------

const emit = defineEmits<{
  'update:model': [model: Pick<BadgeSection, 'label' | 'icon'>];
}>();

// ---------------------------------------------------------------------------
// Local state
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
    <!-- Label field -->
    <UFormField name="badge-label" label="Badge label" size="md">
      <UInput
        :model-value="label"
        type="text"
        :disabled="disabled ?? false"
        class="w-full"
        @update:model-value="handleLabelInput"
      />
    </UFormField>

    <!-- Icon picker slot: role="group" + aria-labelledby -->
    <div role="group" aria-label="Badge icon" class="badge-editor__icon-group">
      <span class="badge-editor__icon-label">Badge icon</span>
      <!--
        Slot contract:
          icon     — current Lucide key string
          onChange — callback with new Lucide key
          disabled — forwarded from BadgeEditor's disabled prop
      -->
      <slot name="icon-picker" :icon="icon" :on-change="setIcon" :disabled="disabled" />
    </div>
  </div>
</template>

<style scoped>
.badge-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.badge-editor__icon-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.badge-editor__icon-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--color-label, #6b7280);
  user-select: none;
}
</style>
