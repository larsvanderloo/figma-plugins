// useTitleDescriptionEditor — binds the General → Title & Description
// section to the store + bridge. Exposes the v-model payload, the
// debounced-text update handler, and the heading-accent update handler.
// Consumers don't see the message-bus contract.

import { computed, reactive, ref } from 'vue';
import { usePluginView } from '../stores/usePluginView';
import { useBridgePending, usePluginBridge } from './usePluginBridge';
import type { TitleDescriptionValue } from '../components/TitleDescriptionEditor.vue';
import { debugLog } from '../../debug';

export function useTitleDescriptionEditor() {
  const view = usePluginView();
  const bridge = usePluginBridge();
  const tracker = useBridgePending(bridge);

  const model = computed<TitleDescriptionValue | null>(() => {
    const td = view.state.general?.titleDescription;
    if (td === null || td === undefined) return null;
    return {
      heading: td.heading,
      paragraph: td.paragraph,
      headingVisible: td.headingVisible,
      paragraphVisible: td.paragraphVisible,
      headingDim: td.headingDim,
      size: td.size,
    };
  });

  function update(next: TitleDescriptionValue): void {
    const slideId = view.state.currentSlideId;
    const td = view.state.general?.titleDescription;
    if (slideId === null || td === null || td === undefined) return;

    td.heading = next.heading;
    td.paragraph = next.paragraph;

    tracker.register();
    bridge.post({
      type: 'update-general',
      slideId: slideId,
      section: 'titleDescription',
      payload: {
        heading: next.heading,
        paragraph: next.paragraph === null ? undefined : next.paragraph,
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

  // Trailing-debounce the bridge post — clicking each word in the
  // accent chip strip used to fire one update-accent message per click,
  // each triggering a sandbox font-load + per-segment fill write. With
  // a 100ms idle wait, rapid edits coalesce to a single sandbox apply
  // carrying the final set of ranges. Local chip flip happens instantly
  // so the user has feedback per-click while the canvas catches up.
  //
  // `accentPending` stays true from the moment the user makes their
  // first click in a burst until the sandbox acks the last apply. It
  // surfaces a subtle "saving" dot in the UI so the user knows work is
  // happening during the (sometimes 1-5s) bridge transport.
  const ACCENT_DEBOUNCE_MS = 100;
  let accentTimer: ReturnType<typeof setTimeout> | null = null;
  let accentPendingPost: { slideId: string; ranges: Array<[number, number]> } | null = null;
  let accentInFlight = 0;
  const accentPending = ref<boolean>(false);

  function scheduleAccentFlush(): void {
    if (accentTimer !== null) clearTimeout(accentTimer);
    accentTimer = setTimeout(flushAccent, ACCENT_DEBOUNCE_MS);
  }

  function clearAccentPendingIfIdle(): void {
    if (accentInFlight === 0 && accentPendingPost === null && accentTimer === null) {
      accentPending.value = false;
    }
  }

  function flushAccent(): void {
    if (accentTimer !== null) {
      clearTimeout(accentTimer);
      accentTimer = null;
    }
    if (accentPendingPost === null) return;
    if (accentInFlight > 0) {
      debugLog('accent', 'flush-deferred', {
        inFlight: accentInFlight,
        rangeCount: accentPendingPost.ranges.length,
      });
      return;
    }
    const p = accentPendingPost;
    accentPendingPost = null;
    accentInFlight += 1;
    debugLog('accent', 'flush', {
      slideId: p.slideId,
      rangeCount: p.ranges.length,
    });
    tracker.register();
    bridge.post({
      type: 'update-accent',
      slideId: p.slideId,
      dimRanges: p.ranges,
    });
  }

  function updateHeadingDim(ranges: Array<[number, number]>): void {
    const slideId = view.state.currentSlideId;
    const td = view.state.general?.titleDescription;
    if (slideId === null || td === null || td === undefined) return;

    td.headingDim = ranges;

    accentPendingPost = { slideId: slideId, ranges: ranges };
    accentPending.value = true;
    debugLog('accent', 'queue', {
      slideId: slideId,
      rangeCount: ranges.length,
      inFlight: accentInFlight,
    });
    scheduleAccentFlush();
  }

  // Clear the "saving" dot as each in-flight accent post is acked.
  // Multiple debounces can fire while the user is mid-edit; we only
  // clear when every in-flight one has come back AND no pending
  // debounce remains.
  bridge.onMessage(function (msg) {
    if (msg.type !== 'target-updated') return;
    if (accentInFlight > 0) {
      accentInFlight -= 1;
      debugLog('accent', 'ack', {
        ok: msg.ok,
        targetId: msg.targetId,
        inFlight: accentInFlight,
        hasPendingPost: accentPendingPost !== null,
      });
      if (accentInFlight === 0 && accentPendingPost !== null) {
        scheduleAccentFlush();
      } else {
        clearAccentPendingIfIdle();
      }
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
    commitSize,
    commitVisibility,
  });
}
