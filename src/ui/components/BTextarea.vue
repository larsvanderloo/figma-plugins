<!--
  BTextarea — UTextarea wrapper that commits on blur instead of on every
  keystroke. Holds local state internally so typing is instant on-screen;
  the parent only sees `update:modelValue` when focus leaves the field.

  Enter is intentionally NOT bound — multi-line textareas keep Enter for
  inserting newlines. Click elsewhere (or Tab) to commit.

  Drop-in replacement for `<UTextarea v-model="x" />`. All other UTextarea
  props (rows, autoresize, placeholder, …) pass through via $attrs.
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

const isDirty = computed<boolean>(() => local.value !== props.modelValue);

function commit(): void {
  if (local.value !== props.modelValue) {
    emit('update:modelValue', local.value);
  }
}
</script>

<template>
  <UTextarea
    v-bind="$attrs"
    :model-value="local"
    :class="isDirty ? '[&_textarea]:text-toned' : ''"
    @update:model-value="(v: string) => (local = v)"
    @blur="commit"
  />
</template>
