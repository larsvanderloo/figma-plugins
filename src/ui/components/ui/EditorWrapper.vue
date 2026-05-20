<script setup lang="ts">
defineProps<{
  title: string;
}>();
</script>

<template>
  <section class="space-y-2">
    <h2 class="text-lg font-semibold">{{ title }}</h2>
    <slot />
  </section>
</template>
