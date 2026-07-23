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

  // Rapid toggles coalesce: while one sandbox write is in-flight, only the
  // latest requested state is kept and sent after the ack.
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

  // Optimistic flip; a short local override clamps stale slide-summary /
  // slide-loaded echoes until the matching sandbox ack drains.
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

  // `modeId = null` clears the pin. Optimistic local flip is safe: the sandbox
  // acks via `target-updated` and does not re-emit the slide payload.
  function setTheme(slideId: string, modeId: string | null): void {
    const theme = view.state.general?.theme;
    if (theme) {
      theme.explicitModeId = modeId;
      if (modeId !== null) theme.resolvedModeId = modeId;
    }
    bridge.post({ type: 'set-slide-theme', slideId: slideId, modeId: modeId });
  }

  // `show` drives the Slide's "Show Confidental" boolean; `variant` switches the
  // nested ConfidentalBadge's `Variant`. Sandbox no-ops when the component lacks
  // the property.
  let confidentialSeq = 0;
  function setConfidential(slideId: string, show: boolean, variant?: string): void {
    const confidential = view.state.general?.confidential;
    if (confidential) {
      confidential.show = show;
      if (typeof variant === 'string') confidential.variant = variant;
    }
    confidentialSeq += 1;
    bridge.post({
      type: 'set-slide-confidential',
      slideId: slideId,
      requestId: 'confidential-' + confidentialSeq,
      show: show,
      ...(typeof variant === 'string' ? { variant: variant } : {}),
    });
  }

  return reactive({ isApplyingSkip, setSkipped, setTheme, setConfidential });
}
