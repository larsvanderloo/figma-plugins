// useSlideSettings — slide-level toggles (skip-mode, Theme-collection mode).

import { onUnmounted, reactive, ref } from 'vue';
import { usePluginView } from '../stores/usePluginView';
import { usePluginBridge } from './usePluginBridge';

interface SkipRequest {
  slideId: string;
  skipped: boolean;
  requestId: string;
}

export function useSlideSettings() {
  const view = usePluginView();
  const bridge = usePluginBridge();

  // Dedicated busy-flag for the visibility toggle so the pill can show
  // a brief loading shimmer while the sandbox is applying the change.
  // Rapid clicks are coalesced: while one sandbox write is in-flight,
  // only the latest requested state is kept and sent after the ack.
  const isApplyingSkip = ref<boolean>(false);
  let skipSeq = 0;
  let activeSkip: SkipRequest | null = null;
  let queuedSkip: SkipRequest | null = null;
  let skipClearTimer: ReturnType<typeof setTimeout> | null = null;

  function makeSkipRequest(slideId: string, skipped: boolean): SkipRequest {
    skipSeq += 1;
    return {
      slideId: slideId,
      skipped: skipped,
      requestId: 'skip-' + skipSeq,
    };
  }

  function scheduleSkipFallback(requestId: string): void {
    if (skipClearTimer !== null) clearTimeout(skipClearTimer);
    skipClearTimer = setTimeout(() => {
      if (activeSkip !== null && activeSkip.requestId === requestId) {
        activeSkip = null;
        const next = queuedSkip;
        queuedSkip = null;
        if (next !== null) {
          postSkip(next);
        } else {
          isApplyingSkip.value = false;
        }
      }
      skipClearTimer = null;
    }, 3000);
  }

  function postSkip(req: SkipRequest): void {
    activeSkip = req;
    isApplyingSkip.value = true;
    scheduleSkipFallback(req.requestId);
    bridge.post({
      type: 'set-slide-skipped',
      slideId: req.slideId,
      requestId: req.requestId,
      skipped: req.skipped,
    });
  }

  const unsubSkipAck = bridge.onMessage((msg) => {
    if (msg.type !== 'target-updated') return;
    if (activeSkip === null) return;
    if (msg.requestId !== activeSkip.requestId) return;

    if (msg.ok) {
      view.settleSkipOverride(activeSkip.slideId, activeSkip.requestId);
    }
    activeSkip = null;

    const next = queuedSkip;
    queuedSkip = null;
    if (next !== null) {
      postSkip(next);
      return;
    }

    if (isApplyingSkip.value) {
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
   *  instant the user clicks. Stale slide-summary / slide-loaded echoes
   *  are clamped by a short local override until the matching sandbox
   *  ack has drained. */
  function setSkipped(slideId: string, skipped: boolean): void {
    const req = makeSkipRequest(slideId, skipped);
    view.setSkipOverride(slideId, skipped, req.requestId);
    if (activeSkip !== null) {
      queuedSkip = req;
      isApplyingSkip.value = true;
      return;
    }
    postSkip(req);
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

  /**
   * Toggle the slide's "Show Confidental" boolean component property (shows/
   * hides the ConfidentalBadgeWrap). Optimistically flips the local switch;
   * the sandbox confirms via `target-updated` and does not re-emit. No-op
   * when the slide's component has no such property (UI hides the toggle).
   */
  let confidentialSeq = 0;
  function setConfidential(slideId: string, show: boolean): void {
    const confidential = view.state.general?.confidential;
    if (confidential) confidential.show = show;
    confidentialSeq += 1;
    bridge.post({
      type: 'set-slide-confidential',
      slideId: slideId,
      requestId: 'confidential-' + confidentialSeq,
      show: show,
    });
  }

  return reactive({ isApplyingSkip, setSkipped, setTheme, setConfidential });
}
