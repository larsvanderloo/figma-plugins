<!--
  VisibilityPill — eye-icon + Zichtbaar/Verborgen text pill, used as the
  standard show/hide control for editable slide sections. Mirrors the
  slide-skip pill in GeneralPanel so the affordance feels consistent
  across the panel: pressed state (verborgen) lights up in primary so
  hidden sections are easy to spot at a glance.
-->
<script setup lang="ts">
interface Props {
  modelValue: boolean;
  disabled?: boolean;
  /** Tooltip shown on hover; falls back to the active aria-label. */
  title?: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

function toggle(): void {
  if (props.disabled) return;
  emit('update:modelValue', !props.modelValue);
}
</script>

<template>
  <button
    type="button"
    class="relative h-7 rounded-full transition-colors flex items-center gap-1.5 px-2.5 text-xs focus:outline-none overflow-hidden"
    :class="[
      modelValue
        ? 'bg-elevated text-default hover:bg-accented/60'
        : 'bg-primary/10 text-primary ring-1 ring-primary',
      disabled ? 'opacity-50 cursor-not-allowed' : '',
    ]"
    :disabled="disabled"
    :title="title || (modelValue ? 'Verberg' : 'Toon')"
    :aria-pressed="!modelValue"
    @click="toggle"
  >
    <Transition
      mode="out-in"
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 -translate-x-1"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="opacity-0 translate-x-1"
    >
      <UIcon
        :key="modelValue ? 'on' : 'off'"
        :name="modelValue ? 'i-lucide-eye' : 'i-lucide-eye-off'"
        class="size-3.5"
      />
    </Transition>
    <Transition
      mode="out-in"
      enter-active-class="transition-opacity duration-100"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-100"
      leave-to-class="opacity-0"
    >
      <span :key="modelValue ? 'on' : 'off'" class="font-medium">
        {{ modelValue ? 'Zichtbaar' : 'Verborgen' }}
      </span>
    </Transition>
  </button>
</template>
