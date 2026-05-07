<!--
  BottomActionsBar — sticky toolbar at the bottom of the plugin panel.

  One action:
    1. Exporteer (dropdown) → Slide PDF / Presentatie PDF

  Undo/redo intentionally absent. Native Cmd+Z / Cmd+Shift+Z still
  works for plugin-driven edits (commitUndo() checkpoints stay in
  place sandbox-side); we just don't surface a toolbar button for it.
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
    class="sticky bottom-0 z-30 flex items-center justify-center gap-2 border-t border-[var(--ui-border)] bg-default/95 px-3 py-2 backdrop-blur"
  >
    <UDropdownMenu :items="exportItems" :content="{ align: 'start', side: 'top' }">
      <UButton
        icon="i-lucide-download"
        trailing-icon="i-lucide-chevron-down"
        color="neutral"
        variant="ghost"
        size="md"
      >
        Exporteer
      </UButton>
    </UDropdownMenu>
  </div>
</template>
