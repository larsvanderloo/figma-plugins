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

function onEnter(event: KeyboardEvent): void {
  (event.target as HTMLElement).blur();
}

// Getypte-maar-niet-geblurde tekst mag niet verdwijnen bij tab-switch
// (panels zijn v-if, dus unmount zonder blur). Flushen als commit is
// veilig: panels unmounten níét bij slide-wissel, dus dit kan nooit naar
// een andere slide posten.
onUnmounted(commit);
</script>

<template>
  <UInput
    v-bind="$attrs"
    :model-value="local"
    @update:model-value="onInput"
    @blur="commit"
    @keydown.enter="onEnter"
  />
</template>
