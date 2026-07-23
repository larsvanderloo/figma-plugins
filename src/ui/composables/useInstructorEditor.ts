// The instructor picker switches the design-system `Instructor` variant
// (photo + name follow the variant); the list items are free text.

import { computed, reactive } from 'vue';
import { usePluginView } from '../stores/usePluginView';
import { useBridgePending, usePluginBridge } from './usePluginBridge';
import type { InstructorCardItem } from '../../shared/types';

export function useInstructorEditor() {
  const view = usePluginView();
  const bridge = usePluginBridge();
  const tracker = useBridgePending(bridge);

  const items = computed<InstructorCardItem[]>(
    () => view.state.content?.instructorCards ?? [],
  );

  function update(value: InstructorCardItem): void {
    const slideId = view.state.currentSlideId;
    if (slideId === null) return;

    // Delta payload — instructor switches and list edits arrive from
    // separate controls, so only send what changed vs the store.
    const list = view.state.content?.instructorCards ?? null;
    const idx = list !== null ? list.findIndex((c) => c.cardNodeId === value.cardNodeId) : -1;
    const prev = idx >= 0 && list !== null ? list[idx] : null;

    const payload: { instructor?: string; items?: string[]; visible?: boolean } = {};
    if (prev === null || prev.instructor !== value.instructor) {
      payload.instructor = value.instructor;
    }
    if (prev === null || prev.items.join('\u0000') !== value.items.join('\u0000')) {
      payload.items = value.items;
    }
    if (prev === null || prev.visible !== value.visible) {
      payload.visible = value.visible;
    }
    if (Object.keys(payload).length === 0) return;

    // Optimistic local update — the store mirrors what the user sees.
    if (prev !== null && list !== null) {
      list[idx].instructor = value.instructor;
      list[idx].items = [...value.items];
      list[idx].visible = value.visible;
    }

    tracker.register();
    bridge.post({
      type: 'update-instructor-card',
      slideId: slideId,
      cardNodeId: value.cardNodeId,
      payload: payload,
    });
  }

  return reactive({ items, pending: tracker.pending, update });
}
