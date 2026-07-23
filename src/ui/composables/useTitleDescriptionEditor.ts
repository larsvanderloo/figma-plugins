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

    const headingChanged = next.heading !== td.heading;
    const nextHeadingDim =
      td.headingDim !== null &&
      next.headingDim !== null &&
      !rangesEqual(td.headingDim, next.headingDim)
        ? next.headingDim
        : null;
    // A characters write wipes the range fills on canvas, so a changed heading
    // must always carry the (remapped) ranges for the sandbox to re-apply after
    // the write — even when the ranges themselves are unchanged.
    const dimForPayload =
      nextHeadingDim !== null
        ? nextHeadingDim
        : headingChanged && next.headingDim !== null && next.headingDim.length > 0
          ? next.headingDim
          : null;

    // Live typing already flushed on every pause, so the blur/unmount commit
    // often matches the store; a redundant post costs a sandbox font-load + text write.
    if (
      next.heading === td.heading &&
      next.paragraph === td.paragraph &&
      nextHeadingDim === null
    ) {
      return;
    }

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
        headingDim: dimForPayload === null ? undefined : dimForPayload,
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

    // Optimistic flip so the switch doesn't snap back during the sandbox round-trip.
    if (field === 'heading') {
      if (td.headingVisible === next) return;
      td.headingVisible = next;
      postVisibility(slideId, 'heading', next);
      // Invariant: paragraph visible implies heading visible — a
      // paragraph-only slide reads as a layout bug to the audience.
      if (next === false && td.paragraphVisible === true) {
        td.paragraphVisible = false;
        postVisibility(slideId, 'paragraph', false);
      }
    } else {
      if (td.paragraphVisible === null) return;
      if (td.paragraphVisible === next) return;
      td.paragraphVisible = next;
      postVisibility(slideId, 'paragraph', next);
      // Symmetric invariant; the UI disables this path when heading is off,
      // but stay defensive and flip heading back on too.
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

    // Optimistic flip so the slider holds its position during the round-trip.
    td.size = { current: next, options: td.size.options };

    tracker.register();
    bridge.post({
      type: 'set-copywrap-size',
      slideId: slideId,
      size: next,
    });
  }

  // Per-click update-accent posts each cost a sandbox font-load + per-segment
  // fill write, so rapid edits coalesce locally into one apply; leaving the
  // control or switching slides flushes the draft.
  // `accentPending` holds from the first click of a burst until the sandbox
  // acks the last apply — it drives the "saving" dot during 1-5s bridge transport.
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

  // Other editors also emit target-updated, so only matching accent request
  // ids may clear the "saving" dot.
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

  // reactive() unwraps `model` so callers read editor.model without `.value`.
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
