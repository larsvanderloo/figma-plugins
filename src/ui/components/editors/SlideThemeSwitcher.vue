<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ThemeSection, ThemeMode } from '../../../types';

interface Props {
  theme: ThemeSection;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const open = ref<boolean>(false);

const activeId = computed<string>(function () {
  return props.theme.explicitModeId !== null
    ? props.theme.explicitModeId
    : props.theme.resolvedModeId;
});

const activeMode = computed<ThemeMode | null>(function () {
  for (let i = 0; i < props.theme.modes.length; i++) {
    if (props.theme.modes[i].id === activeId.value) return props.theme.modes[i];
  }
  return props.theme.modes.length > 0 ? props.theme.modes[0] : null;
});

const themeModeItems = computed<Array<{ value: string; label: string; mode: ThemeMode }>>(() =>
  props.theme.modes.map((mode) => ({ value: mode.id, label: mode.name, mode })),
);

function swatchBackground(mode: ThemeMode): string {
  if (mode.swatchPrimary !== null && mode.swatchSecondary !== null) {
    return (
      'linear-gradient(135deg, ' +
      mode.swatchPrimary +
      ' 0%, ' +
      mode.swatchPrimary +
      ' 50%, ' +
      mode.swatchSecondary +
      ' 50%, ' +
      mode.swatchSecondary +
      ' 100%)'
    );
  }
  return mode.swatchPrimary !== null ? mode.swatchPrimary : '#e5e7eb';
}

function previewBg(mode: ThemeMode): string {
  return mode.swatchPrimary !== null ? mode.swatchPrimary : '#e5e7eb';
}

function previewLine(mode: ThemeMode): string {
  if (mode.swatchSecondary !== null) return mode.swatchSecondary;
  if (mode.swatchPrimary !== null) return mode.swatchPrimary;
  return '#9ca3af';
}

function select(modeId: string): void {
  emit('update:modelValue', modeId);
  open.value = false;
}

function onThemeChange(value: string | number | undefined): void {
  if (typeof value === 'string') select(value);
}
</script>

<template>
  <UModal v-model:open="open">
    <UButton
      type="button"
      color="neutral"
      variant="ghost"
      block
      class="-mx-2 w-[calc(100%+1rem)] px-2 py-1"
      :aria-label="activeMode ? 'Kleurthema: ' + activeMode.name + ' — wijzigen' : 'Kleurthema kiezen'"
    >
      <span class="text-sm font-medium text-default">Kleurthema</span>
      <span class="flex min-w-0 items-center gap-2 text-muted">
        <span
          v-if="activeMode"
          class="size-4 rounded-full ring-1 ring-black/5 shrink-0"
          :style="{ background: swatchBackground(activeMode) }"
        />
        <span class="text-sm truncate">
          {{ activeMode ? activeMode.name : 'Kies een thema' }}
        </span>
        <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0" />
      </span>
    </UButton>

    <template #content>
      <div class="space-y-4 p-5">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-medium text-default">Kleurthema</h3>
          <UButton
            color="neutral"
            variant="ghost"
            square
            icon="i-lucide-x"
            aria-label="Sluiten"
            @click="open = false"
          />
        </div>
        <URadioGroup
          :model-value="activeId"
          :items="themeModeItems"
          value-key="value"
          variant="card"
          orientation="horizontal"
          indicator="hidden"
          @update:model-value="onThemeChange"
        >
          <template #label="{ item }">
            <span
              class="relative flex flex-col items-stretch gap-2.5 p-3 transition-colors"
              :class="
                item.value === activeId
                  ? 'bg-primary/5 text-primary'
                  : 'bg-muted/30 text-default hover:bg-muted/60'
              "
              :aria-label="item.label"
            >
              <span
                class="relative aspect-5/4 rounded-md overflow-hidden ring-1 ring-black/4"
                :style="{ background: previewBg(item.mode) }"
              >
                <span
                  class="absolute left-2.5 right-3 top-2.5 h-1.5 rounded-full"
                  :style="{ background: previewLine(item.mode), opacity: 0.35 }"
                />
                <span
                  class="absolute left-2.5 w-3/5 top-5 h-1 rounded-full"
                  :style="{ background: previewLine(item.mode), opacity: 0.22 }"
                />
                <span
                  class="absolute left-2.5 w-2/5 top-7 h-1 rounded-full"
                  :style="{ background: previewLine(item.mode), opacity: 0.22 }"
                />
              </span>
              <span class="flex items-center justify-between gap-2">
                <span
                  class="text-xs font-medium leading-none truncate"
                  :class="item.value === activeId ? 'text-primary' : 'text-default'"
                >
                  {{ item.label }}
                </span>
                <span
                  v-if="item.value === activeId"
                  class="flex size-4 shrink-0 items-center justify-center rounded-full bg-primary text-inverted"
                  aria-hidden="true"
                >
                  <UIcon name="i-lucide-check" class="size-2.5" />
                </span>
              </span>
            </span>
          </template>
        </URadioGroup>
      </div>
    </template>
  </UModal>
</template>
