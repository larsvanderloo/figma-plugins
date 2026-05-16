// useSlideSettings — slide-level toggles (skip-mode, Theme-collection mode).

import { onUnmounted, reactive, ref } from 'vue';
import { usePluginView } from '../stores/usePluginView';
import { usePluginBridge } from './usePluginBridge';

export function useSlideSettings() {
  const view = usePluginView();
  const bridge = usePluginBridge();

  // Dedicated busy-flag for the visibility toggle so the pill can show
  // a brief loading shimmer while the sandbox is applying the change.
  // Cleared on the next target-updated, or after a 2 s fallback.
  const isApplyingSkip = ref<boolean>(false);
  let skipClearTimer: ReturnType<typeof setTimeout> | null = null;
  const unsubSkipAck = bridge.onMessage((msg) => {
    if (msg.type === 'target-updated' && isApplyingSkip.value) {
      isApplyingSkip.value = false;
      if (skipClearTimer !== null) {
        clearTimeout(skipClearTimer);
        skipClearTimer = null;
      }
    }
  });
  onUnmounted(unsubSkipAck);

  /** Toggle whether the slide is skipped during present mode. Flips the
   *  local summary optimistically so the visibility pill updates the
   *  instant the user clicks; the sandbox no longer echoes slide-summary
   *  back (matching set-slide-theme), so there's no clobber on rapid clicks. */
  function setSkipped(slideId: string, skipped: boolean): void {
    const summary = view.state.currentSummary;
    if (summary !== null && summary.id === slideId && summary.isSkipped !== null) {
      summary.isSkipped = skipped;
    }
    isApplyingSkip.value = true;
    if (skipClearTimer !== null) clearTimeout(skipClearTimer);
    skipClearTimer = setTimeout(() => {
      isApplyingSkip.value = false;
      skipClearTimer = null;
    }, 2000);
    bridge.post({
      type: 'set-slide-skipped',
      slideId: slideId,
      skipped: skipped,
    });
  }

  /**
   * Pin (or clear, with `modeId = null`) the slide's Theme-collection mode.
   * Optimistically flips the picker swatch locally; sandbox confirms via
   * `target-updated` and does not re-emit the slide payload.
   */
  function setTheme(slideId: string, modeId: string | null): void {
    const theme = view.state.general?.theme;
    if (theme) {
      theme.explicitModeId = modeId;
      if (modeId !== null) theme.resolvedModeId = modeId;
    }
    bridge.post({ type: 'set-slide-theme', slideId: slideId, modeId: modeId });
  }

  return reactive({ isApplyingSkip, setSkipped, setTheme });
}
