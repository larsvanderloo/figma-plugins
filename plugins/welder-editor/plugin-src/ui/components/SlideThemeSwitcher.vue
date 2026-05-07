<!--
  SlideThemeSwitcher — slide-level Theme-collection mode picker.

  Shows the modes of the file's `Theme` variable collection (as scanned
  by sandbox-side `scanTheme`) plus an "Auto" option that clears the
  slide's explicit binding and inherits from the page.

  Hidden entirely when no Theme collection exists in the file (older
  Welder libraries or files where the collection has been removed).

  Mutation flow:
    user picks → emit `update:modelValue` (string | null, where null
    means inherit) → parent posts `set-slide-theme` over the bridge →
    sandbox calls `setExplicitVariableModeForCollection` and replies
    with a fresh `slide-loaded` so the picker re-syncs.
-->
<script setup lang="ts">
import { computed } from 'vue';
import type { ThemeSection } from '../../types';

interface Props {
  theme: ThemeSection;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: string | null];
}>();

const AUTO_VALUE = '__auto__';

interface Item {
  label: string;
  value: string;
}

const items = computed<Item[]>(() => {
  const inheritedName =
    props.theme.modes.find((m) => m.id === props.theme.resolvedModeId)?.name ?? 'page default';
  const result: Item[] = [
    { label: `Auto (${inheritedName})`, value: AUTO_VALUE },
  ];
  for (const mode of props.theme.modes) {
    result.push({ label: mode.name, value: mode.id });
  }
  return result;
});

const selected = computed<string>(() =>
  props.theme.explicitModeId === null ? AUTO_VALUE : props.theme.explicitModeId,
);

function onSelect(value: string): void {
  if (value === AUTO_VALUE) {
    emit('update:modelValue', null);
  } else {
    emit('update:modelValue', value);
  }
}
</script>

<template>
  <USelect
    :model-value="selected"
    :items="items"
    value-key="value"
    size="md"
    class="w-full"
    @update:model-value="onSelect"
  />
</template>
