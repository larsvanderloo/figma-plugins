// useIconReconcile — top-level watcher that auto-restores Card and
// Badge icons after a library republish wipes their icon-slot child
// overrides. Lives at App.vue scope (always mounted) so it doesn't
// depend on the user opening the matching tab/panel — earlier it sat
// inside useCardEditor / useBadgeEditor and only fired when those
// panels were already mounted, which meant the user had to click the
// Inhoud tab for cards to reconcile.
//
// Mechanism: watches the per-slide `content.cards` array and the
// `general.badge` object. Both are replaced wholesale by the sandbox
// on every `slide-loaded` message. When `iconIntended !== icon` (the
// slot was reset by a master republish), re-emit the same update path
// a manual pick uses; sandbox refreshes the slot and re-writes plugin
// data (idempotent). The optimistic local sync prevents the next
// slide-load from re-firing while the round-trip is in flight.

import { watch } from 'vue';
import { usePluginView } from '../stores/usePluginView';
import { usePluginBridge } from './usePluginBridge';
import { getLucideSvg } from '../lucide-svgs';

export function useIconReconcile(): void {
  const view = usePluginView();
  const bridge = usePluginBridge();

  // ── Cards ──
  watch(
    () => view.state.content?.cards ?? null,
    function (cards) {
      if (cards === null) return;
      const slideId = view.state.currentSlideId;
      if (slideId === null) return;
      let reconciled = 0;
      for (let i = 0; i < cards.length; i++) {
        const c = cards[i];
        if (c.iconIntended === null || c.iconIntended.length === 0) continue;
        if (c.iconIntended === c.icon) continue;
        const svg = getLucideSvg(c.iconIntended);
        if (svg === null) continue;
        bridge.post({
          type: 'update-card',
          slideId: slideId,
          cardNodeId: c.cardNodeId,
          payload: { icon: c.iconIntended, iconSvg: svg },
        });
        c.icon = c.iconIntended;
        reconciled += 1;
      }
      if (reconciled > 0) {
        console.log('[card-reconcile] re-applied ' + reconciled + ' stale icon(s)');
      }
    },
    { immediate: true },
  );

  // ── Badge ──
  watch(
    () => view.state.general?.badge ?? null,
    function (b) {
      if (b === null) return;
      const slideId = view.state.currentSlideId;
      if (slideId === null) return;
      if (b.iconIntended.length === 0) return;
      if (b.iconIntended === b.icon) return;
      const svg = getLucideSvg(b.iconIntended);
      if (svg === null) return;
      bridge.post({
        type: 'update-general',
        slideId: slideId,
        section: 'badge',
        payload: {
          label: b.label,
          icon: b.iconIntended,
          iconSvg: svg,
        },
      });
      b.icon = b.iconIntended;
      console.log(
        '[badge-reconcile] re-applied "' + b.iconIntended + '" for badge ' + b.badgeNodeId,
      );
    },
    { immediate: true },
  );
}
