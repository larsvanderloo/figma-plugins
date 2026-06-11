// useCardEditor — binds the Content → Cards list to the store + bridge,
// and manages the sandbox-driven card-visual previews.

import { computed, onUnmounted, reactive, ref, watch } from 'vue';
import { usePluginView } from '../stores/usePluginView';
import { useBridgePending, usePluginBridge } from './usePluginBridge';
import { getLucideSvg } from '../lucide-svgs';
import { bytesToDataUrl } from '../utils/bytes-to-data-url';
import type { CardItem } from '../../shared/types';

// Card-size picker state lives at module scope so it survives ContentPanel
// remounts (the panel is v-if'd against `view.hasContent`, which briefly
// flips false during slide-switch — re-instantiating the composable and
// resetting any function-local refs). One-iframe-session sticky.
type CardSize = 'SM' | 'LG' | 'NO_ICON';
const cardSize = ref<CardSize>('LG');

export function useCardEditor() {
  const view = usePluginView();
  const bridge = usePluginBridge();
  const tracker = useBridgePending(bridge);

  const cards = computed<CardItem[]>(() => view.state.content?.cards ?? []);

  const previewUrls = ref<Record<string, string>>({});
  const previewSizes = ref<Record<string, number>>({});

  const unsubscribe = bridge.onMessage((msg) => {
    if (msg.type !== 'card-visual-preview') return;
    previewUrls.value = {
      ...previewUrls.value,
      [msg.cardNodeId]: bytesToDataUrl(msg.bytes),
    };
    previewSizes.value = {
      ...previewSizes.value,
      [msg.cardNodeId]: msg.bytes.length,
    };
  });
  onUnmounted(unsubscribe);

  // Per-card snapshot of what we last emitted to the sandbox. Lets the
  // update() function include only changed fields in the payload — and
  // skip the bridge call entirely when nothing changed. Cleared on
  // slide-switch so cardNodeIds from a previous slide don't leak.
  const lastSent: Record<string, CardItem> = {};

  watch(
    () => view.state.currentSlideId,
    () => {
      previewUrls.value = {};
      previewSizes.value = {};
      for (const key in lastSent) delete lastSent[key];
    },
  );

  function update(value: CardItem): void {
    const slideId = view.state.currentSlideId;
    if (slideId === null) return;

    // Build a delta payload — only include fields that actually changed
    // since the last emit for this card. Saves a bridge round-trip and a
    // sandbox tree walk per keystroke when the user is just typing into
    // one field and the others (icon, style) are unchanged.
    const prev = lastSent[value.cardNodeId];
    const payload: {
      heading?: string;
      paragraph?: string;
      icon?: string;
      iconSvg?: string;
      style?: 'Default' | 'Outline';
    } = {};
    if (prev === undefined || prev.heading !== value.heading) {
      payload.heading = value.heading;
    }
    if (prev === undefined || prev.paragraph !== value.paragraph) {
      payload.paragraph = value.paragraph;
    }
    // T32: icon may be null (icon-instance hidden) — omit when null.
    const iconChanged =
      (prev === undefined || prev.icon !== value.icon) && value.icon !== null;
    const styleChanged =
      (prev === undefined || prev.style !== value.style) && value.style !== null;

    if (iconChanged) {
      payload.icon = value.icon as string;
      const svg = getLucideSvg(value.icon as string);
      if (svg !== null) payload.iconSvg = svg;
    }
    if (styleChanged) {
      payload.style = value.style as 'Default' | 'Outline';
      // Each Card variant binds the icon's stroke to a different theme
      // variable (Default → background, Outline → text). Toggling the
      // variant alone leaves the slot's previously-inserted SVG with the
      // old paint binding — the icon disappears or renders in the wrong
      // color. Re-send icon+iconSvg so the sandbox can re-render the slot
      // and recapture the new variant's stroke paint.
      if (!iconChanged && value.icon !== null) {
        payload.icon = value.icon;
        const svg = getLucideSvg(value.icon);
        if (svg !== null) payload.iconSvg = svg;
      }
    }
    if (Object.keys(payload).length === 0) return;

    // Optimistic local update — always write all fields so the store
    // matches what the user sees, even when we only emit a delta. Also
    // sync `iconIntended` so the reconcile watcher (further down)
    // doesn't see a spurious mismatch on the next tick.
    const list = view.state.content?.cards ?? null;
    if (list !== null) {
      const idx = list.findIndex((c) => c.cardNodeId === value.cardNodeId);
      if (idx >= 0) {
        list[idx].heading = value.heading;
        list[idx].paragraph = value.paragraph;
        list[idx].icon = value.icon;
        list[idx].style = value.style;
        if (value.icon !== null) {
          list[idx].iconIntended = value.icon;
        }
      }
    }

    tracker.register();
    bridge.post({
      type: 'update-card',
      slideId: slideId,
      cardNodeId: value.cardNodeId,
      payload: payload,
    });
    lastSent[value.cardNodeId] = { ...value };
  }

  function uploadVisual(cardNodeId: string, bytes: Uint8Array): void {
    const slideId = view.state.currentSlideId;
    if (slideId === null) return;
    // Reuses the `upload-image` channel; sandbox routes to applyCardVisual
    // based on card-parent (see sandbox/handlers/image.ts upload-image handler).
    tracker.register();
    bridge.post({
      type: 'upload-image',
      targetNodeId: cardNodeId,
      bytes: bytes,
    });
  }

  // Card size — three-way picker that controls icon visibility, icon
  // size, heading text style, and spacing-variable rebind. `cardSize` is
  // module-scoped (declared above) so it survives ContentPanel remounts
  // during slide-switch; the last pick sticks for the whole iframe session.
  //
  //   SM     : icon visible, 58px, Heading4-sm, gap=4
  //   LG     : icon visible, 68px, Heading4,    gap=6  (design default)
  //   NO_ICON: icon hidden,  -,    Heading4-sm, gap=4

  const ICON_SIZE_BY: Record<CardSize, number> = { SM: 58, LG: 68, NO_ICON: 58 };
  const HEADING_STYLE_BY: Record<CardSize, 'Heading4' | 'Heading4-sm'> = {
    SM: 'Heading4-sm',
    LG: 'Heading4',
    NO_ICON: 'Heading4-sm',
  };
  // Card itemSpacing is bound to one of 9 variables in the Spacing
  // collection (named "1"–"9", values 4–36px). SM/NO_ICON pick the
  // tighter step; LG matches the design default.
  const GAP_MODE_BY: Record<CardSize, string> = { SM: '4', LG: '6', NO_ICON: '4' };
  const ICON_VISIBLE_BY: Record<CardSize, boolean> = { SM: true, LG: true, NO_ICON: false };

  function commitCardSize(value: CardSize): void {
    // No-op when the same size is re-selected — avoids a round-trip
    // and prevents the canvas from re-rendering unchanged content.
    if (cardSize.value === value) return;
    cardSize.value = value;
    const slideId = view.state.currentSlideId;
    if (slideId === null) return;
    isApplyingCardSize.value = true;
    if (cardSizeClearTimer !== null) clearTimeout(cardSizeClearTimer);
    cardSizeClearTimer = setTimeout(() => {
      isApplyingCardSize.value = false;
      cardSizeClearTimer = null;
    }, 2000);
    tracker.register();
    bridge.post({
      type: 'set-card-size',
      slideId: slideId,
      iconSize: ICON_SIZE_BY[value],
      headingStyleName: HEADING_STYLE_BY[value],
      gapModeName: GAP_MODE_BY[value],
      iconVisible: ICON_VISIBLE_BY[value],
    });
  }

  // Dedicated busy-flag for the card-size picker so its visual loading
  // state isn't driven by `tracker.pending` (which also fires for text
  // commits, image uploads, etc.). Cleared on the next `target-updated`
  // or after a 2-second fallback to guarantee it never sticks.
  const isApplyingCardSize = ref<boolean>(false);
  let cardSizeClearTimer: ReturnType<typeof setTimeout> | null = null;
  const unsubCardSizeAck = bridge.onMessage((msg) => {
    if (msg.type === 'target-updated' && isApplyingCardSize.value) {
      isApplyingCardSize.value = false;
      if (cardSizeClearTimer !== null) {
        clearTimeout(cardSizeClearTimer);
        cardSizeClearTimer = null;
      }
    }
  });
  onUnmounted(unsubCardSizeAck);

  // NOTE: card-icon reconcile lives at App.vue scope (useIconReconcile)
  // so it runs regardless of which tab is mounted. Previously this
  // watcher sat here and required the user to open the Onderdelen tab
  // before stale icons would restore.

  return reactive({
    cards,
    pending: tracker.pending,
    previewUrls,
    previewSizes,
    cardSize,
    isApplyingCardSize,
    update,
    uploadVisual,
    commitCardSize,
  });
}
