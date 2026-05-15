// useJourneyEditor — binds the Content → Journey section to the store + bridge.

import { computed, reactive } from 'vue';
import { usePluginView } from '../stores/usePluginView';
import { usePluginBridge } from './usePluginBridge';
import type { JourneyWrapModel } from '../../types';

export function useJourneyEditor() {
  const view = usePluginView();
  const bridge = usePluginBridge();

  const model = computed<JourneyWrapModel | null>(
    () => view.state.content?.journeyModel ?? null,
  );

  function update(value: JourneyWrapModel): void {
    const slideId = view.state.currentSlideId;
    if (slideId === null) return;

    if (view.state.content !== null) {
      view.state.content.journeyModel = value;
    }

    bridge.post({
      type: 'update-journey',
      slideId: slideId,
      slotId: value.slotId,
      desired: value,
    });
  }

  return reactive({ model, update });
}
