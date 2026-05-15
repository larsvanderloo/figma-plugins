// useJourneyEditor — binds the Content → Journey section to the store + bridge.

import { computed, reactive } from 'vue';
import { usePluginView } from '../stores/usePluginView';
import { useBridgePending, usePluginBridge } from './usePluginBridge';
import type { JourneyWrapModel } from '../../types';

export function useJourneyEditor() {
  const view = usePluginView();
  const bridge = usePluginBridge();
  const tracker = useBridgePending(bridge);

  const model = computed<JourneyWrapModel | null>(
    () => view.state.content?.journeyModel ?? null,
  );

  function update(value: JourneyWrapModel): void {
    const slideId = view.state.currentSlideId;
    if (slideId === null) return;

    if (view.state.content !== null) {
      view.state.content.journeyModel = value;
    }

    tracker.register();
    bridge.post({
      type: 'update-journey',
      slideId: slideId,
      slotId: value.slotId,
      desired: value,
    });
  }

  return reactive({ model, pending: tracker.pending, update });
}
