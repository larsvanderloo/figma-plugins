// useTitleDescriptionEditor — binds the General → Title & Description
// section to the store + bridge. Exposes the v-model payload, the
// debounced-text update handler, and the heading-accent update handler.
// Consumers don't see the message-bus contract.

import { computed, onUnmounted, reactive, ref, watch } from 'vue';
import { usePluginView } from '../stores/usePluginView';
import { useBridgePending, usePluginBridge } from './usePluginBridge';
import type { TitleDescriptionValue } from '../components/editors/TitleDescriptionEditor.vue';
import { debugLog } from '../../shared/debug';

export function useTitleDescriptionEditor() {
  const view = usePluginView();
  const bridge = usePluginBridge();
  const tracker = useBridgePending(bridge);
  const accentDraft = ref<{ slideId: string; ranges: Array<[number, number]> } | null>(null);

  function rangesEqual(
    a: Array<[number, number]> | null,
    b: Array<[number, number]>,
  ): boolean {
    if (a === null) return b.length === 0;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i][0] !== b[i][0] || a[i][1] !== b[i][1]) return false;
    }
    return true;
  }

  const model = computed<TitleDescriptionValue | null>(() => {
    const td = view.state.general?.titleDescription;
    if (td === null || td === undefined) return null;
    const draft = accentDraft.value;
    return {
      heading: td.heading,
      paragraph: td.paragraph,
      headingVisible: td.headingVisible,
      paragraphVisible: td.paragraphVisible,
      headingDim:
        draft !== null && draft.slideId === view.state.currentSlideId
          ? draft.ranges
          : td.headingDim,
      size: td.size,
    };
  });

  function update(next: TitleDescriptionValue): void {
    const slideId = view.state.currentSlideId;
    const td = view.state.general?.titleDescription;
    if (slideId === null || td === null || td === undefined) return;

    const nextHeadingDim =
      td.headingDim !== null &&
      next.headingDim !== null &&
      !rangesEqual(td.headingDim, next.headingDim)
        ? next.headingDim
        : null;

    td.heading = next.heading;
    td.paragraph = next.paragraph;
    if (nextHeadingDim !== null) {
      td.headingDim = nextHeadingDim;
      accentDraft.value = { slideId: slideId, ranges: nextHeadingDim };
      if (accentTimer !== null) {
        clearTimeout(accentTimer);
        accentTimer = null;
      }
      if (accentInFlightRequestIds.size === 0) {
        accentPendingPost = null;
        clearAccentPendingIfIdle();
      } else {
        accentPendingPost = { slideId: slideId, ranges: nextHeadingDim };
        accentPending.value = true;
      }
    }

    tracker.register();
    bridge.post({
      type: 'update-general',
      slideId: slideId,
      section: 'titleDescription',
      payload: {
        heading: next.heading,
        paragraph: next.paragraph === null ? undefined : next.paragraph,
        headingDim: nextHeadingDim === null ? undefined : nextHeadingDim,
      },
    });
  }

  function postVisibility(slideId: string, field: 'heading' | 'paragraph', next: boolean): void {
    tracker.register();
    bridge.post({
      type: 'set-typography-visibility',
      slideId: slideId,
      field: field,
      visible: next,
    });
  }

  function commitVisibility(field: 'heading' | 'paragraph', next: boolean): void {
    const slideId = view.state.currentSlideId;
    const td = view.state.general?.titleDescription;
    if (slideId === null || td === null || td === undefined) return;

    // Optimistic — flip the store so the switch UI stays put while the
    // sandbox round-trip happens. Same pattern as theme/skip/size.
    if (field === 'heading') {
      if (td.headingVisible === next) return;
      td.headingVisible = next;
      postVisibility(slideId, 'heading', next);
      // Invariant: paragraph implies heading. Turning the heading off
      // cascades to paragraph so we never sit in a paragraph-only state
      // — that always reads as a layout bug to the audience.
      if (next === false && td.paragraphVisible === true) {
        td.paragraphVisible = false;
        postVisibility(slideId, 'paragraph', false);
      }
    } else {
      if (td.paragraphVisible === null) return;
      if (td.paragraphVisible === next) return;
      td.paragraphVisible = next;
      postVisibility(slideId, 'paragraph', next);
      // Symmetric invariant: turning paragraph on requires heading on.
      // The UI disables the paragraph toggle when heading is off so we
      // shouldn't reach here, but be defensive — flip heading on too.
      if (next === true && td.headingVisible === false) {
        td.headingVisible = true;
        postVisibility(slideId, 'heading', true);
      }
    }
  }

  function commitSize(next: string): void {
    const slideId = view.state.currentSlideId;
    const td = view.state.general?.titleDescription;
    if (slideId === null || td === null || td === undefined) return;
    if (td.size === null) return;
    if (td.size.current === next) return;

    // Optimistic store-flip — slider keeps its position via the bridge
    // round-trip even before the sandbox re-reads the slide. Same pattern
    // as the theme/skip pickers.
    td.size = { current: next, options: td.size.options };

    tracker.register();
    bridge.post({
      type: 'set-copywrap-size',
      slideId: slideId,
      size: next,
    });
  }

  // Trailing-debounce the bridge post — accent chips used to fire one
  // update-accent message per click, each triggering a sandbox font-load
  // + per-segment fill write. With a longer idle wait, rapid edits stay
  // fully local and coalesce to one sandbox apply carrying the final set
  // of ranges. Leaving the control or switching slides flushes the draft.
  //
  // `accentPending` stays true from the moment the user makes their
  // first click in a burst until the sandbox acks the last apply. It
  // surfaces a subtle "saving" dot in the UI so the user knows work is
  // happening during the (sometimes 1-5s) bridge transport.
  const ACCENT_DEBOUNCE_MS = 600;
  let accentTimer: ReturnType<typeof setTimeout> | null = null;
  let accentPendingPost: { slideId: string; ranges: Array<[number, number]> } | null = null;
  let accentRequestSeq = 0;
  let accentLastQueuedAt = 0;
  const accentInFlightRequestIds = new Set<string>();
  const accentPending = ref<boolean>(false);

  function reconcileAccentDraft(): void {
    const draft = accentDraft.value;
    if (draft === null) return;
    if (view.state.currentSlideId !== draft.slideId) {
      accentDraft.value = null;
      return;
    }
    const canonical = view.state.general?.titleDescription?.headingDim;
    if (canonical !== undefined && rangesEqual(canonical, draft.ranges)) {
      accentDraft.value = null;
    }
  }

  watch(
    () => [
      view.state.currentSlideId,
      view.state.general?.titleDescription?.headingDim,
    ] as const,
    reconcileAccentDraft,
  );

  function scheduleAccentFlush(): void {
    if (accentTimer !== null) clearTimeout(accentTimer);
    const elapsed = Date.now() - accentLastQueuedAt;
    const delay = Math.max(0, ACCENT_DEBOUNCE_MS - elapsed);
    accentTimer = setTimeout(flushAccent, delay);
  }

  watch(
    () => view.state.currentSlideId,
    (next, previous) => {
      if (previous !== null && previous !== next) {
        flushAccent();
      }
    },
  );

  function clearAccentPendingIfIdle(): void {
    if (
      accentInFlightRequestIds.size === 0 &&
      accentPendingPost === null &&
      accentTimer === null
    ) {
      accentPending.value = false;
    }
  }

  function flushAccent(): void {
    if (accentTimer !== null) {
      clearTimeout(accentTimer);
      accentTimer = null;
    }
    if (accentPendingPost === null) return;
    if (accentInFlightRequestIds.size > 0) {
      debugLog('accent', 'flush-deferred', {
        inFlight: accentInFlightRequestIds.size,
        rangeCount: accentPendingPost.ranges.length,
      });
      return;
    }
    const p = accentPendingPost;
    accentPendingPost = null;
    accentRequestSeq += 1;
    const requestId = 'accent-' + accentRequestSeq;
    accentInFlightRequestIds.add(requestId);
    debugLog('accent', 'flush', {
      slideId: p.slideId,
      requestId: requestId,
      rangeCount: p.ranges.length,
    });
    tracker.register();
    bridge.post({
      type: 'update-accent',
      slideId: p.slideId,
      requestId: requestId,
      dimRanges: p.ranges,
    });
  }

  function updateHeadingDim(ranges: Array<[number, number]>): void {
    const slideId = view.state.currentSlideId;
    const td = view.state.general?.titleDescription;
    if (slideId === null || td === null || td === undefined) return;

    accentDraft.value = { slideId: slideId, ranges: ranges };

    accentPendingPost = { slideId: slideId, ranges: ranges };
    accentLastQueuedAt = Date.now();
    accentPending.value = true;
    scheduleAccentFlush();
  }

  function flushHeadingDim(): void {
    flushAccent();
  }

  onUnmounted(flushAccent);

  // Clear the "saving" dot only for matching accent request ids. Other
  // editors also emit target-updated, so generic acks are not reliable
  // enough for the high-frequency accent marker.
  bridge.onMessage(function (msg) {
    if (msg.type !== 'target-updated') return;
    if (msg.requestId === undefined || !accentInFlightRequestIds.has(msg.requestId)) return;
    accentInFlightRequestIds.delete(msg.requestId);
    debugLog('accent', 'ack', {
      ok: msg.ok,
      requestId: msg.requestId,
      targetId: msg.targetId,
      inFlight: accentInFlightRequestIds.size,
      hasPendingPost: accentPendingPost !== null,
    });
    if (msg.ok === false) {
      if (accentTimer !== null) {
        clearTimeout(accentTimer);
        accentTimer = null;
      }
      accentPendingPost = null;
      accentDraft.value = null;
    } else {
      reconcileAccentDraft();
    }
    if (accentInFlightRequestIds.size === 0 && accentPendingPost !== null) {
      scheduleAccentFlush();
    } else {
      clearAccentPendingIfIdle();
    }
  });

  // reactive() wrapper unwraps `model` so `editor.model` returns the
  // current value directly in both script and template — no `.value`
  // dance at the call site.
  return reactive({
    model,
    pending: tracker.pending,
    accentPending,
    update,
    updateHeadingDim,
    flushHeadingDim,
    commitSize,
    commitVisibility,
  });
}
