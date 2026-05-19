<script setup lang="ts">
import { ref, watch } from 'vue';

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
    @update:model-value="(v: string) => (local = v)"
    @blur="commit"
  />
</template>
