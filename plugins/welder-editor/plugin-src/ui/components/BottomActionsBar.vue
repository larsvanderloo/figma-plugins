<!--
  BottomActionsBar — sticky toolbar at the bottom of the plugin panel.

  Four icon-only actions:
    1. Export presentation as PDF (current page → multi-page PDF)
    2. Export current slide as PDF
    3. Undo plugin edit  → popForUndo() + sandbox `trigger-undo`
    4. Redo plugin edit  → popForRedo() + replay the original
                            bridge message

  Plugin Undo/Redo only covers tracked plugin actions (currently
  update-general, update-card, set-slide-theme — see
  `useEditHistory`). Native Cmd+Z / Cmd+Shift+Z still works for
  everything else; that's the keyboard escape hatch.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { usePluginBridge } from '../composables/usePluginBridge';
import { usePluginView } from '../stores/usePluginView';
import { useEditHistory } from '../stores/useEditHistory';

const bridge = usePluginBridge();
const view = usePluginView();
const editHistory = useEditHistory();

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
  // Move the most-recent tracked action onto the undone stack and ask
  // the sandbox to revert. The sandbox commits an undo checkpoint
  // before each tracked mutation, so triggerUndo reverts exactly
  // that one action. Stack is auto-cleared when the slide changes
  // (App.vue watches currentSlideId), so anything that's still on
  // the stack belongs to the current slide.
  const msg = editHistory.popForUndo();
  if (msg === null) return;
  bridge.post({ type: 'trigger-undo' });
}

function onRedo(): void {
  // Replay the most-recently-undone bridge message verbatim. The
  // sandbox handler runs commitUndo + the apply, so the redone state
  // becomes a fresh undo checkpoint on top.
  const msg = editHistory.popForRedo();
  if (msg === null) return;
  bridge.post(msg);
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
      :disabled="!editHistory.canUndo"
      title="Plugin-wijziging ongedaan maken"
      @click="onUndo"
    />
    <UButton
      icon="i-lucide-redo-2"
      color="neutral"
      variant="ghost"
      size="md"
      :disabled="!editHistory.canRedo"
      title="Plugin-wijziging opnieuw toepassen"
      @click="onRedo"
    />
  </div>
</template>
