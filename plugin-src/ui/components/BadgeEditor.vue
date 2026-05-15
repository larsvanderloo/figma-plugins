<!--
  BadgeEditor — v-model-gebonden editor voor de
  General → Badge sectie (spec §9 T9).

  Props:
    modelValue: { label: string; icon: string }

  Emits:
    update:modelValue — het volledige object, debounced op 200ms
      sinds de laatste edit in label of icon-picker.

  Gedrag:
    - `<UInput>` voor label (altijd aanwezig).
    - `<USelect searchable>` met BADGE_ICON_OPTIONS; trigger toont
      gekozen icon + naam via `<UIcon :name="'i-lucide-' + icon" />`
      (zelfde pattern als welder-table BadgeCellInput).
    - Debounce-timer in een lokale ref; clear + reset bij elke edit
      zodat we pas na 200ms stilte één emit firen (idem
      TitleDescriptionEditor).
    - Externe prop-wijzigingen (slide-wissel / main-echo) resetten
      de lokale refs via watch(props, ...).
-->
<script setup lang="ts">
import { ref, watch } from 'vue';
import IconPicker from './IconPicker.vue';

export interface BadgeValue {
  label: string;
  icon: string;
}

interface Props {
  modelValue: BadgeValue;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: BadgeValue];
}>();

// Lokale reactieve kopie zodat de user type-snelheid niet door de
// 200ms-debounce wordt afgeknepen.
const localLabel = ref<string>(props.modelValue.label);
const localIcon = ref<string>(props.modelValue.icon);

// Slide-wissel of main-echo: sync lokale refs met prop.
watch(
  () => props.modelValue,
  (next) => {
    localLabel.value = next.label;
    localIcon.value = next.icon;
  },
);

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleEmit(): void {
  if (debounceTimer !== null) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    emit('update:modelValue', {
      label: localLabel.value,
      icon: localIcon.value,
    });
  }, 200);
}

function onLabelInput(value: string): void {
  localLabel.value = value;
  scheduleEmit();
}

function onIconChange(value: string): void {
  localIcon.value = value;
  scheduleEmit();
}
</script>

<template>
  <div class="space-y-3">
    <UFormField name="icon" label="Icoon" size="md">
      <IconPicker :model-value="localIcon" class="w-full" @update:model-value="onIconChange" />
    </UFormField>

    <UFormField name="label" label="Label" size="md">
      <UInput
        :model-value="localLabel"
        placeholder="Badge tekst"
        class="w-full"
        @update:model-value="onLabelInput"
      />
    </UFormField>
  </div>
</template>
