// useBadgeEditor — binds the General → Badge section to the store + bridge.

import { computed, reactive } from 'vue';
import { usePluginView } from '../stores/usePluginView';
import { useBridgePending, usePluginBridge } from './usePluginBridge';
import { getLucideSvg } from '../lucide-svgs';
import type { BadgeValue } from '../components/editors/TitleDescriptionEditor.vue';

export function useBadgeEditor() {
  const view = usePluginView();
  const bridge = usePluginBridge();
  const tracker = useBridgePending(bridge);

  const model = computed<BadgeValue | null>(() => {
    const b = view.state.general?.badge;
    if (b === null || b === undefined) return null;
    return { label: b.label, icon: b.icon, visible: b.visible };
  });

  function update(next: BadgeValue): void {
    const slideId = view.state.currentSlideId;
    const b = view.state.general?.badge;
    if (slideId === null || b === null || b === undefined) return;

    b.label = next.label;
    b.icon = next.icon;
    // Also sync iconIntended so the reconcile watcher (below) doesn't
    // fire on the optimistic update after a user pick.
    b.iconIntended = next.icon;

    // Include the resolved SVG body so the sandbox can render the icon via
    // its slot without an INSTANCE_SWAP + library import. Sandbox falls back
    // to the legacy swap when iconSvg is absent or the lookup misses.
    const iconSvg = getLucideSvg(next.icon);
    tracker.register();
    bridge.post({
      type: 'update-general',
      slideId: slideId,
      section: 'badge',
      payload: {
        label: next.label,
        icon: next.icon,
        iconSvg: iconSvg !== null ? iconSvg : undefined,
      },
    });
  }

  // NOTE: badge-icon reconcile lives at App.vue scope (useIconReconcile)
  // so it runs regardless of which tab is mounted.

  function commitVisibility(next: boolean): void {
    const slideId = view.state.currentSlideId;
    const b = view.state.general?.badge;
    if (slideId === null || b === null || b === undefined) return;
    if (b.visible === null) return;
    if (b.visible === next) return;

    // Optimistic store-flip — switch stays put through the round-trip.
    b.visible = next;

    tracker.register();
    bridge.post({
      type: 'set-typography-visibility',
      slideId: slideId,
      field: 'badge',
      visible: next,
    });
  }

  return reactive({ model, pending: tracker.pending, update, commitVisibility });
}
