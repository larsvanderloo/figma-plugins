<!--
  BadgeEditor — editor for the General → Badge section.

  Uses BInput (commits on blur / Enter) so the sandbox only sees one
  update per finished edit — no keystroke debounce.
-->
<script setup lang="ts">
import IconPicker from './IconPicker.vue';
import BInput from './BInput.vue';
import VisibilityPill from './VisibilityPill.vue';

export interface BadgeValue {
  label: string;
  icon: string;
  visible: boolean | null;
}

interface Props {
  modelValue: BadgeValue;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: BadgeValue];
  'commit:visibility': [visible: boolean];
}>();

function onLabelCommit(value: string): void {
  emit('update:modelValue', {
    label: value,
    icon: props.modelValue.icon,
    visible: props.modelValue.visible,
  });
}

function onIconChange(value: string): void {
  emit('update:modelValue', {
    label: props.modelValue.label,
    icon: value,
    visible: props.modelValue.visible,
  });
}

function onVisibilityToggle(next: boolean): void {
  emit('commit:visibility', next);
}
</script>

<template>
  <div class="space-y-1.5">
    <div class="flex items-center justify-between gap-2">
      <label class="text-xs font-medium text-default">Badge</label>
      <VisibilityPill
        v-if="modelValue.visible !== null"
        :model-value="modelValue.visible"
        :title="modelValue.visible ? 'Verberg badge' : 'Toon badge'"
        @update:model-value="onVisibilityToggle"
      />
    </div>
    <div class="flex items-center gap-2">
      <IconPicker
        :model-value="modelValue.icon"
        :disabled="modelValue.visible === false"
        @update:model-value="onIconChange"
      />
      <BInput
        :model-value="modelValue.label"
        placeholder="Bijv. Belangrijk"
        size="md"
        :disabled="modelValue.visible === false"
        class="flex-1"
        @update:model-value="onLabelCommit"
      />
    </div>
  </div>
</template>
