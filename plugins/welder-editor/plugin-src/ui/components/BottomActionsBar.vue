<!--
  BottomActionsBar — sticky toolbar at the bottom of the plugin panel.

  Four icon-only actions:
    1. Export presentation as PDF (current page → multi-page PDF)
    2. Export current slide as PDF
    3. Undo                 → figma.triggerUndo() (== Cmd+Z)
    4. Redo                 → tooltip / info-toast: Cmd+Shift+Z
                              (Figma's plugin API has no triggerRedo;
                              we don't fake it.)
-->
<script setup lang="ts">
import { computed } from 'vue';
import { usePluginBridge } from '../composables/usePluginBridge';
import { usePluginView } from '../stores/usePluginView';
import { useNotifications } from '../stores/useNotifications';

const bridge = usePluginBridge();
const view = usePluginView();
const notifications = useNotifications();

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
  bridge.post({ type: 'trigger-undo' });
}

function onRedo(): void {
  // Figma's plugin API exposes no triggerRedo. Best honest UX: hint the
  // user toward the native shortcut and let them use it.
  notifications.pushInfo(
    'Redo niet beschikbaar in plugin',
    'Gebruik Cmd+Shift+Z (Mac) of Ctrl+Y (Windows) in Figma.',
  );
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
    <UButton
      icon="i-lucide-redo-2"
      color="neutral"
      variant="ghost"
      size="md"
      title="Opnieuw — gebruik Cmd+Shift+Z (Mac) / Ctrl+Y (Windows)"
      @click="onRedo"
    />
  </div>
</template>
