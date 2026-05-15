// useBadgeEditor — binds the General → Badge section to the store + bridge.

import { computed, reactive } from 'vue';
import { usePluginView } from '../stores/usePluginView';
import { useBridgePending, usePluginBridge } from './usePluginBridge';
import type { BadgeValue } from '../components/BadgeEditor.vue';

export function useBadgeEditor() {
  const view = usePluginView();
  const bridge = usePluginBridge();
  const tracker = useBridgePending(bridge);

  const model = computed<BadgeValue | null>(() => {
    const b = view.state.general?.badge;
    if (b === null || b === undefined) return null;
    return { label: b.label, icon: b.icon };
  });

  function update(next: BadgeValue): void {
    const slideId = view.state.currentSlideId;
    const b = view.state.general?.badge;
    if (slideId === null || b === null || b === undefined) return;

    b.label = next.label;
    b.icon = next.icon;

    tracker.register();
    bridge.post({
      type: 'update-general',
      slideId: slideId,
      section: 'badge',
      payload: {
        label: next.label,
        icon: next.icon,
      },
    });
  }

  return reactive({ model, pending: tracker.pending, update });
}
