// useTitleDescriptionEditor — binds the General → Title & Description
// section to the store + bridge. Exposes the v-model payload, the
// debounced-text update handler, and the heading-accent update handler.
// Consumers don't see the message-bus contract.

import { computed, reactive } from 'vue';
import { usePluginView } from '../stores/usePluginView';
import { useBridgePending, usePluginBridge } from './usePluginBridge';
import type { TitleDescriptionValue } from '../components/TitleDescriptionEditor.vue';

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
  // a 250ms idle wait, rapid edits coalesce to a single sandbox apply
  // carrying the final set of ranges. The local store update happens
  // immediately so the chip UI reacts to every click.
  const ACCENT_DEBOUNCE_MS = 250;
  let accentTimer: ReturnType<typeof setTimeout> | null = null;
  let accentPending: { slideId: string; ranges: Array<[number, number]> } | null = null;

  let accentPostedAt = 0;

  function flushAccent(): void {
    if (accentTimer !== null) {
      clearTimeout(accentTimer);
      accentTimer = null;
    }
    if (accentPending === null) return;
    const p = accentPending;
    accentPending = null;
    accentPostedAt = performance.now();
    console.log('[accent-perf] debounce fired → bridge.post · ranges=' + p.ranges.length);
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

    accentPending = { slideId: slideId, ranges: ranges };
    if (accentTimer !== null) clearTimeout(accentTimer);
    accentTimer = setTimeout(flushAccent, ACCENT_DEBOUNCE_MS);
    console.log('[accent-perf] composable received · scheduled flush in ' + ACCENT_DEBOUNCE_MS + 'ms');
  }

  // Surface roundtrip latency for the user-visible apply.
  bridge.onMessage(function (msg) {
    if (msg.type === 'target-updated' && accentPostedAt > 0) {
      const dt = performance.now() - accentPostedAt;
      accentPostedAt = 0;
      console.log('[accent-perf] target-updated received · bridge+apply ' + dt.toFixed(1) + 'ms');
    }
  });

  // reactive() wrapper unwraps `model` so `editor.model` returns the
  // current value directly in both script and template — no `.value`
  // dance at the call site.
  return reactive({
    model,
    pending: tracker.pending,
    update,
    updateHeadingDim,
    commitSize,
    commitVisibility,
  });
}
