<!--
  BottomActionsBar — sticky toolbar at the bottom of the plugin panel.

  Layout: Exporteer dropdown on the left, Delen + Start presentatie
  on the right.
-->
<script setup lang="ts">
import { computed } from 'vue';
import type { DropdownMenuItem } from '@nuxt/ui';
import { usePluginBridge } from '../composables/usePluginBridge';
import { usePluginView } from '../stores/usePluginView';

const bridge = usePluginBridge();
const view = usePluginView();

const hasSlide = computed<boolean>(() => view.state.currentSlideId !== null);

function exportPresentation(): void {
  bridge.post({ type: 'export-pdf', target: 'presentation' });
}

function exportSlide(): void {
  const id = view.state.currentSlideId;
  if (id === null) return;
  bridge.post({ type: 'export-pdf', target: 'slide', slideId: id });
}

function onStartPresentation(): void {
  bridge.post({ type: 'start-presentation' });
}

function onShare(): void {}

const exportItems = computed<DropdownMenuItem[]>(() => [
  {
    label: 'Slide PDF',
    icon: 'i-lucide-file-text',
    disabled: !hasSlide.value,
    onSelect: () => exportSlide(),
  },
  {
    label: 'Presentatie PDF',
    icon: 'i-lucide-presentation',
    onSelect: () => exportPresentation(),
  },
]);
</script>

<template>
  <div
    class="sticky bottom-0 z-30 flex items-center justify-between gap-2 border-t border-[var(--ui-border)] bg-default/95 px-3 py-2 backdrop-blur"
  >
    <UDropdownMenu :items="exportItems" :content="{ align: 'start', side: 'top' }">
      <UButton
        trailing-icon="i-lucide-chevron-down"
        color="neutral"
        variant="ghost"
        size="md"
      >
        Exporteer
      </UButton>
    </UDropdownMenu>
    <div class="flex items-center gap-2">
      <UButton color="neutral" variant="ghost" size="md" @click="onShare">
        Delen
      </UButton>
      <UButton color="primary" variant="solid" size="md" @click="onStartPresentation">
        Presenteren
      </UButton>
    </div>
  </div>
</template>
