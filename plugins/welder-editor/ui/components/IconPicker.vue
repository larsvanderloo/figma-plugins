<script setup lang="ts">
/**
 * IconPicker — Lucide icon picker.
 *
 * Lifted from sections/IconPicker/src/IconPicker.vue.
 * Uses UInput (replacing InputField) for search.
 * UAlert (replacing StatusMessage) for status live region.
 *
 * Icon data lazy-loaded via iconPickerIcons.ts (ADR-0003 §1).
 * Props-only renderer. Emits update:modelValue. Does NOT import store.
 *
 * Accessibility: UInput (role="textbox") for search, role="listbox" grid.
 * Each icon button: role="option", aria-label, aria-selected.
 *
 * Owner: ui-engineer. Sprint 5 Task 5.5.
 */

import { ref, computed, onMounted, useId } from 'vue';
import { Icon } from '@iconify/vue';
import { ICON_KEYS, loadIconManifest } from './iconPickerIcons.js';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface IconPickerProps {
  modelValue: string;
  disabled?: boolean;
  placeholder?: string;
}

const props = withDefaults(defineProps<IconPickerProps>(), {
  disabled: false,
  placeholder: 'Search icons...',
});

// ---------------------------------------------------------------------------
// Emits
// ---------------------------------------------------------------------------

const emit = defineEmits<{
  'update:modelValue': [iconKey: string];
}>();

// ---------------------------------------------------------------------------
// IDs
// ---------------------------------------------------------------------------

const gridId = useId();

// ---------------------------------------------------------------------------
// Manifest loading
// ---------------------------------------------------------------------------

const manifestReady = ref(false);

onMounted(async () => {
  await loadIconManifest();
  manifestReady.value = true;
});

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

const searchQuery = ref('');

const filteredIcons = computed<readonly string[]>(() => {
  const query = searchQuery.value.trim().toLowerCase();
  if (!query) return ICON_KEYS;
  return ICON_KEYS.filter((key) => key.includes(query));
});

// ---------------------------------------------------------------------------
// Status message
// ---------------------------------------------------------------------------

const statusMessage = computed<string>(() => {
  if (!manifestReady.value) return 'Loading icons…';
  if (filteredIcons.value.length === 0) return `No icons match "${searchQuery.value}"`;
  return '';
});

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

function handleSelect(key: string): void {
  if (props.disabled) return;
  emit('update:modelValue', key);
}

function iconName(key: string): string {
  return `lucide:${key}`;
}
</script>

<template>
  <div class="icon-picker flex flex-col gap-2">
    <!-- Search input -->
    <UInput
      v-model="searchQuery"
      type="search"
      :placeholder="placeholder ?? 'Search icons...'"
      :disabled="disabled ?? false"
      aria-label="Search icons"
      class="w-full"
    />

    <!--
      Status live region: always in DOM so live region is registered before
      first announcement. Lives outside the listbox (aria-required-children).
    -->
    <div
      v-if="statusMessage"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      class="icon-picker__status"
    >
      {{ statusMessage }}
    </div>
    <!-- Always-rendered hidden live region when no message (prevents region re-registration) -->
    <div v-else role="status" aria-live="polite" aria-atomic="true" class="sr-only" />

    <!-- Populated grid: role="listbox" only when options exist -->
    <div
      v-if="manifestReady && filteredIcons.length > 0"
      :id="gridId"
      role="listbox"
      aria-label="Icon options"
      aria-multiselectable="false"
      :aria-disabled="disabled ? 'true' : undefined"
      class="icon-picker__grid"
    >
      <button
        v-for="key in filteredIcons"
        :key="key"
        type="button"
        role="option"
        :aria-label="key"
        :aria-selected="key === modelValue"
        :disabled="disabled"
        class="icon-picker__cell"
        :class="{ 'icon-picker__cell--selected': key === modelValue }"
        @click="handleSelect(key)"
      >
        <Icon
          :icon="iconName(key)"
          width="16"
          height="16"
          aria-hidden="true"
          class="icon-picker__icon"
        />
      </button>
    </div>

    <!-- Empty placeholder (no listbox when empty) -->
    <div
      v-else
      :id="gridId"
      :aria-busy="!manifestReady ? 'true' : undefined"
      class="icon-picker__grid icon-picker__grid--empty"
      aria-hidden="true"
    />
  </div>
</template>

<style scoped>
.icon-picker__status {
  font-size: 11px;
  color: var(--color-label, #6b7280);
}

.icon-picker__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(28px, 1fr));
  gap: 2px;
  max-height: 160px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #d1d5db transparent;
}

.icon-picker__cell {
  appearance: none;
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 4px;
  color: #374151;
  transition:
    background-color 100ms ease,
    color 100ms ease;
}

@media (prefers-reduced-motion: reduce) {
  .icon-picker__cell {
    transition: none;
  }
}

.icon-picker__cell:hover:not(:disabled) {
  background-color: #f3f4f6;
  color: #111827;
}

.icon-picker__cell:focus-visible {
  outline: 2px solid #3b82f6;
  outline-offset: -1px;
}

.icon-picker__cell--selected {
  background-color: #eff6ff;
  color: #2563eb;
  outline: 2px solid #3b82f6;
  outline-offset: -2px;
}

.icon-picker__cell:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.icon-picker__icon {
  flex-shrink: 0;
}

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
