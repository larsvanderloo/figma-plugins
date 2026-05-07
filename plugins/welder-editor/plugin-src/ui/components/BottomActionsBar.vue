<!--
  BottomActionsBar — sticky toolbar at the bottom of the plugin panel.

  Two actions:
    1. Exporteer (dropdown) → Slide PDF / Presentatie PDF
    2. Undo                 → figma.triggerUndo() (== Cmd+Z)

  Redo is intentionally absent — Figma's plugin API exposes
  triggerUndo but no triggerRedo. Users redo via the native
  Cmd+Shift+Z (Mac) / Ctrl+Y (Windows) shortcut.
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

function onUndo(): void {
  // Sandbox calls figma.triggerUndo() — same effect as Cmd+Z.
  // Pass the currently-displayed slideId so the sandbox can re-scan
  // and re-emit slide-loaded; otherwise iframe-side optimistic
  // updates (e.g. the picker's view.state mutation on click) keep
  // showing the pre-undo value and the toolbar Undo reads as a no-op.
  bridge.post({
    type: 'trigger-undo',
    slideId: view.state.currentSlideId ?? undefined,
  });
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
    <span class="mx-1 h-5 w-px bg-[var(--ui-border)]" aria-hidden />
    <UButton
      icon="i-lucide-undo-2"
      color="neutral"
      variant="ghost"
      size="md"
      title="Ongedaan maken (Cmd+Z)"
      @click="onUndo"
    />
  </div>
</template>
