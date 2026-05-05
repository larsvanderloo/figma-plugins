<script setup lang="ts">
// Component template — copy this folder to components/src/<Name>/ and
// rename the file. Replace this comment with the component's purpose.
//
// Owner: ui-engineer

defineProps<{
  // Replace with real props
  label: string;
}>();

defineEmits<{
  click: [];
}>();
</script>

<template>
  <button type="button" class="text-sm" @click="$emit('click')">
    <slot>{{ label }}</slot>
  </button>
</template>
