<!--
  BadgeEditor — editor for the General → Badge section.

  Uses WInput (commits on blur / Enter) so the sandbox only sees one
  update per finished edit — no keystroke debounce.
-->
<script setup lang="ts">
import IconPicker from '../ui/IconPicker.vue';
import WInput from '../ui/WInput.vue';

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
  <UFormField label="Label">
    <template v-if="modelValue.visible !== null" #hint>
      <USwitch
        :model-value="modelValue.visible"
        label="Tonen"
        size="xs"
        :ui="{
          root: 'flex-row-reverse items-center',
          wrapper: 'me-2 ms-0',
          label: 'text-xs font-medium text-muted',
        }"
        @update:model-value="onVisibilityToggle"
      />
    </template>
    <div class="flex items-center gap-2">
      <IconPicker
        :model-value="modelValue.icon"
        :disabled="modelValue.visible === false"
        @update:model-value="onIconChange"
      />
      <WInput
        :model-value="modelValue.label"
        placeholder="Bijv. Belangrijk"
        size="md"
        :disabled="modelValue.visible === false"
        class="flex-1"
        @update:model-value="onLabelCommit"
      />
    </div>
  </UFormField>
</template>
