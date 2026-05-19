<!--
  SlideThemeSwitcher — slide-level Theme-collection mode picker. The
  panel-level affordance is a compact "drill-down row" showing the
  current theme as a swatch + name + chevron; clicking opens a modal
  with the full preview-tile grid. iOS Settings → Wallpaper pattern:
  everyday view stays compact, the rich picker is one tap away.

  No "Auto" option: every selection pins an explicit mode. Hidden
  entirely (by parent v-if) when no Theme collection exists.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import type { ThemeSection, ThemeMode } from '../../types';

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
</script>

<template>
  <UModal v-model:open="open" :ui="{ content: 'sm:max-w-md' }">
    <!--
      Trigger row — looks like an iOS settings cell. Whole row tappable.
    -->
    <button
      type="button"
      class="w-full flex items-center justify-between gap-3 -mx-2 px-2 py-1 rounded-md hover:bg-elevated/60 transition-colors focus:outline-none"
      :aria-label="activeMode ? 'Kleurthema: ' + activeMode.name + ' — wijzigen' : 'Kleurthema kiezen'"
    >
      <span class="text-sm font-medium text-default">Kleurthema</span>
      <span class="flex items-center gap-2 min-w-0 text-muted">
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
    </button>

    <template #content>
      <div class="p-5 space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-semibold text-default">Kleurthema</h3>
          <button
            type="button"
            class="size-7 rounded-full text-muted hover:bg-elevated transition-colors flex items-center justify-center"
            aria-label="Sluiten"
            @click="open = false"
          >
            <UIcon name="i-lucide-x" class="size-4" />
          </button>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <button
            v-for="mode in props.theme.modes"
            :key="mode.id"
            type="button"
            class="relative flex flex-col items-stretch gap-2.5 p-3 rounded-xl bg-muted/30 transition-colors focus:outline-none"
            :class="
              mode.id === activeId
                ? 'ring-1 ring-primary bg-primary/5'
                : 'hover:bg-muted/60'
            "
            :aria-label="mode.name"
            :aria-pressed="mode.id === activeId"
            @click="select(mode.id)"
          >
            <!--
              Inner "page" preview — subtle frame with the theme color
              softened by a low-opacity wireframe. Tile wrapper provides
              the breathing room; the preview itself is calm, not loud.
            -->
            <div
              class="relative aspect-5/4 rounded-md overflow-hidden ring-1 ring-black/4"
              :style="{ background: previewBg(mode) }"
            >
              <div
                class="absolute left-2.5 right-3 top-2.5 h-1.5 rounded-full"
                :style="{ background: previewLine(mode), opacity: 0.35 }"
              />
              <div
                class="absolute left-2.5 w-3/5 top-5 h-1 rounded-full"
                :style="{ background: previewLine(mode), opacity: 0.22 }"
              />
              <div
                class="absolute left-2.5 w-2/5 top-7 h-1 rounded-full"
                :style="{ background: previewLine(mode), opacity: 0.22 }"
              />
            </div>
            <div class="flex items-center justify-between gap-2">
              <span
                class="text-xs font-medium leading-none truncate"
                :class="mode.id === activeId ? 'text-primary' : 'text-default'"
              >
                {{ mode.name }}
              </span>
              <span
                v-if="mode.id === activeId"
                class="size-4 rounded-full bg-primary text-inverted flex items-center justify-center shrink-0"
                aria-hidden="true"
              >
                <UIcon name="i-lucide-check" class="size-2.5" />
              </span>
            </div>
          </button>
        </div>
      </div>
    </template>
  </UModal>
</template>
