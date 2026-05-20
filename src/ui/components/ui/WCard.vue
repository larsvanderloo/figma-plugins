<script setup lang="ts">
type CardVariant = 'solid' | 'outline' | 'soft' | 'subtle';

interface Props {
  as?: string;
  title?: string;
  description?: string;
  variant?: CardVariant;
}

withDefaults(defineProps<Props>(), {
  variant: 'solid',
});
</script>

<template>
  <UCard v-bind="$props">
    <template v-for="(_, name) in $slots" #[name]="slotData">
      <slot :name="name" v-bind="slotData ?? {}" />
    </template>
  </UCard>
</template>
