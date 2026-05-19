<!--
  WInput — UInput wrapper that commits on blur / Enter instead of on
  every keystroke. Holds local state internally so typing is instant
  on-screen; the parent only sees `update:modelValue` once focus leaves
  the field (or Enter is pressed, which also blurs).

  Drop-in replacement for `<UInput v-model="x" />`. All other UInput
  props (placeholder, size, color, icon, …) pass through via $attrs.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';

interface Props {
  modelValue: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const local = ref<string>(props.modelValue);

watch(
  () => props.modelValue,
  (next) => {
    if (next !== local.value) local.value = next;
  },
);

// True while the local text differs from the last-committed prop value.
// Drives a subtle muted-text style so the user can see at a glance which
// fields have uncommitted edits.
const isDirty = computed<boolean>(() => local.value !== props.modelValue);

function commit(): void {
  if (local.value !== props.modelValue) {
    emit('update:modelValue', local.value);
  }
}

function onEnter(event: KeyboardEvent): void {
  (event.target as HTMLElement).blur();
}
</script>

<template>
  <UInput
    v-bind="$attrs"
    :model-value="local"
    :class="isDirty ? '[&_input]:text-toned' : ''"
    @update:model-value="(v: string) => (local = v)"
    @blur="commit"
    @keydown.enter="onEnter"
  />
</template>
