<!--
  BottomActionsBar — sticky toolbar at the bottom of the plugin panel.

  Three icon-only actions:
    1. Export presentation as PDF (current page → multi-page PDF)
    2. Export current slide as PDF
    3. Undo                 → figma.triggerUndo() (== Cmd+Z)

  Redo is intentionally absent — Figma's plugin API exposes
  triggerUndo but no triggerRedo, and we don't fake it. Users redo
  via the native Cmd+Shift+Z (Mac) / Ctrl+Y (Windows) shortcut.
-->
<script setup lang="ts">
import { computed } from 'vue';
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
</script>

<template>
  <div
    class="sticky bottom-0 z-30 flex items-center justify-center gap-2 border-t border-[var(--ui-border)] bg-default/95 px-3 py-2 backdrop-blur"
  >
    <UButton
      icon="i-lucide-file-text"
      color="neutral"
      variant="ghost"
      size="md"
      title="Exporteer presentatie als PDF"
      @click="exportPresentation"
    />
    <UButton
      icon="i-lucide-file"
      color="neutral"
      variant="ghost"
      size="md"
      :disabled="!hasSlide"
      title="Exporteer huidige slide als PDF"
      @click="exportSlide"
    />
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
