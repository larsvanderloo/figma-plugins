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

    // Live typing already posted this value on the last pause; skipping the
    // unchanged commit also keeps a pending iconIntended reconcile intact.
    if (next.label === b.label && next.icon === b.icon) return;

    b.label = next.label;
    b.icon = next.icon;
    // Sync iconIntended so the reconcile watcher does not fire on this optimistic update.
    b.iconIntended = next.icon;

    // Resolved SVG lets the sandbox render the icon without an INSTANCE_SWAP +
    // library import; it falls back to the legacy swap when iconSvg is absent.
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

  // Badge-icon reconcile lives at App.vue scope (useIconReconcile) so it runs whichever tab is mounted.

  function commitVisibility(next: boolean): void {
    const slideId = view.state.currentSlideId;
    const b = view.state.general?.badge;
    if (slideId === null || b === null || b === undefined) return;
    if (b.visible === null) return;
    if (b.visible === next) return;

    // Optimistic flip so the switch stays put through the round-trip.
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
