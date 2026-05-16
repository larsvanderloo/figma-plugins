// useJourneyEditor — binds the Content → Journey section to the store + bridge.

import { computed, reactive } from 'vue';
import { usePluginView } from '../stores/usePluginView';
import { useBridgePending, usePluginBridge } from './usePluginBridge';
import { getLucideSvg } from '../lucide-svgs';
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

    // Build a `name → svgString` map so the sandbox can render every
    // distinct icon via its slot without an INSTANCE_SWAP + library import.
    // Missing names just stay out of the map; sandbox falls back to legacy.
    const iconSvgs: Record<string, string> = {};
    for (let i = 0; i < value.items.length; i++) {
      const name = value.items[i].icon;
      if (typeof name === 'string' && name.length > 0 && iconSvgs[name] === undefined) {
        const svg = getLucideSvg(name);
        if (svg !== null) iconSvgs[name] = svg;
      }
    }

    tracker.register();
    bridge.post({
      type: 'update-journey',
      slideId: slideId,
      slotId: value.slotId,
      desired: value,
      iconSvgs: iconSvgs,
    });
  }

  return reactive({ model, pending: tracker.pending, update });
}
