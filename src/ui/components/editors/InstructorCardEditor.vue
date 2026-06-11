<script setup lang="ts">
import type { InstructorCardItem } from '../../../shared/types';
import WTextarea from '../ui/WTextarea.vue';

interface Props {
  modelValue: InstructorCardItem;
  index: number;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: InstructorCardItem];
}>();

function emitWith(patch: Partial<InstructorCardItem>): void {
  emit('update:modelValue', { ...props.modelValue, ...patch });
}

function onInstructorChange(value: string | undefined): void {
  if (typeof value !== 'string' || value.length === 0) return;
  if (value === props.modelValue.instructor) return;
  emitWith({ instructor: value });
}

function onVisibleToggle(value: boolean): void {
  emitWith({ visible: value });
}

function onItemCommit(itemIndex: number, value: string): void {
  const next = [...props.modelValue.items];
  next[itemIndex] = value;
  emitWith({ items: next });
}
</script>

<template>
  <div class="space-y-4">
    <UFormField :label="'Instructeur ' + index">
      <template #hint>
        <USwitch
          :model-value="modelValue.visible"
          label="Tonen"
          size="xs"
          :ui="{ root: 'flex-row-reverse gap-2' }"
          @update:model-value="onVisibleToggle"
        />
      </template>
      <USelect
        v-if="modelValue.visible"
        :model-value="modelValue.instructor"
        :items="modelValue.instructorOptions"
        :disabled="modelValue.instructorOptions.length === 0"
        icon="i-lucide-user-round"
        class="w-full"
        @update:model-value="onInstructorChange"
      />
    </UFormField>

    <template v-if="modelValue.visible">
      <UFormField
        v-for="(item, itemIdx) in modelValue.items"
        :key="itemIdx"
        :label="'Punt ' + (itemIdx + 1)"
      >
        <WTextarea
          :model-value="item"
          :rows="2"
          autoresize
          class="w-full"
          @update:model-value="(v: string) => onItemCommit(itemIdx, v)"
        />
      </UFormField>
    </template>
  </div>
</template>
