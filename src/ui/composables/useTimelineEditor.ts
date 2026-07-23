import { computed, reactive } from 'vue';
import { usePluginView } from '../stores/usePluginView';
import { useBridgePending, usePluginBridge } from './usePluginBridge';
import type { TimelineItem } from '../../shared/types';

export function useTimelineEditor() {
  const view = usePluginView();
  const bridge = usePluginBridge();
  const tracker = useBridgePending(bridge);

  const items = computed<TimelineItem[]>(() => view.state.content?.timelineItems ?? []);

  function update(copyWrapNodeId: string, value: TimelineItem): void {
    const slideId = view.state.currentSlideId;
    if (slideId === null) return;

    const list = view.state.content?.timelineItems ?? null;
    const idx = list !== null ? list.findIndex((t) => t.copyWrapNodeId === copyWrapNodeId) : -1;
    const prev = idx >= 0 && list !== null ? list[idx] : null;

    // Live typing and blur/Enter share this handler, so a blur after a debounced live
    // post would repost the identical payload. The store is updated optimistically
    // below and resynced by scans, so comparing against it stays honest after undo.
    if (prev !== null && prev.heading === value.heading && prev.paragraph === value.paragraph) {
      return;
    }

    if (prev !== null && list !== null) {
      list[idx].heading = value.heading;
      list[idx].paragraph = value.paragraph;
    }

    tracker.register();
    bridge.post({
      type: 'update-timeline-item',
      slideId: slideId,
      copyWrapNodeId: copyWrapNodeId,
      payload: {
        heading: value.heading,
        paragraph: value.paragraph,
      },
    });
  }

  return reactive({ items, pending: tracker.pending, update });
}
