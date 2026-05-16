<!--
  SlideThemeSwitcher — slide-level Theme-collection mode picker rendered
  as a row of color swatches. Each swatch is a two-tone circle showing
  the mode's primary + secondary color (resolved sandbox-side from the
  Theme collection's first two COLOR variables).

  No "Auto" option: every click pins an explicit mode via
  `setExplicitVariableModeForCollection`. Page-level inheritance is
  still respected if a slide has no explicit mode at the time of scan,
  but the picker doesn't expose a "clear" affordance — the assumption is
  that the user wants per-slide control once they touch the picker.

  Hidden entirely (by parent v-if) when no Theme collection exists.
-->
<script setup lang="ts">
import type { ThemeSection } from '../../types';

interface Props {
  theme: ThemeSection;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

function activeId(): string {
  // Prefer the slide's explicit mode; fall back to the resolved mode
  // (the inherited page-level mode) so the picker always highlights
  // what the user currently sees on the canvas.
  return props.theme.explicitModeId ?? props.theme.resolvedModeId;
}

function select(modeId: string): void {
  emit('update:modelValue', modeId);
}
</script>

<template>
  <div class="flex items-center gap-2">
    <button
      v-for="mode in props.theme.modes"
      :key="mode.id"
      type="button"
      class="size-8 rounded-full transition ring-2 ring-offset-2 ring-offset-default overflow-hidden focus:outline-none"
      :title="mode.name"
      :aria-label="mode.name"
      :class="
        mode.id === activeId()
          ? 'ring-primary'
          : 'ring-transparent hover:ring-default'
      "
      :style="{
        background:
          mode.swatchPrimary && mode.swatchSecondary
            ? `linear-gradient(135deg, ${mode.swatchPrimary} 0%, ${mode.swatchPrimary} 50%, ${mode.swatchSecondary} 50%, ${mode.swatchSecondary} 100%)`
            : mode.swatchPrimary ?? '#e5e7eb',
      }"
      @click="select(mode.id)"
    />
  </div>
</template>
