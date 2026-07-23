<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue';

interface Props {
  modelValue: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  'update:modelValue': [value: string];
  live: [value: string];
}>();

const local = ref<string>(props.modelValue);

watch(
  () => props.modelValue,
  (next) => {
    if (next !== local.value) local.value = next;
  },
);

function commit(): void {
  if (local.value !== props.modelValue) {
    emit('update:modelValue', local.value);
  }
}

function onInput(v: string): void {
  local.value = v;
  emit('live', v);
}

// Same unmount-flush as WInput: a tab switch unmounts without blur and must
// not discard typed text; a slide switch does not unmount panels.
onUnmounted(commit);
</script>

<template>
  <UTextarea
    v-bind="$attrs"
    :model-value="local"
    @update:model-value="onInput"
    @blur="commit"
  />
</template>
