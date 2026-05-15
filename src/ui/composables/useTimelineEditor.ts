// useTimelineEditor — binds the Content → Timeline items to the store + bridge.

import { computed, reactive } from 'vue';
import { usePluginView } from '../stores/usePluginView';
import { usePluginBridge } from './usePluginBridge';
import type { TimelineItem } from '../../types';

export function useTimelineEditor() {
  const view = usePluginView();
  const bridge = usePluginBridge();

  const items = computed<TimelineItem[]>(() => view.state.content?.timelineItems ?? []);

  function update(copyWrapNodeId: string, value: TimelineItem): void {
    const slideId = view.state.currentSlideId;
    if (slideId === null) return;

    const list = view.state.content?.timelineItems ?? null;
    if (list !== null) {
      const idx = list.findIndex((t) => t.copyWrapNodeId === copyWrapNodeId);
      if (idx >= 0) {
        list[idx].heading = value.heading;
        list[idx].paragraph = value.paragraph;
      }
    }

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

  return reactive({ items, update });
}
