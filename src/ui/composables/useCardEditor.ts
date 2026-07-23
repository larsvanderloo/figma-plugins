import { computed, onUnmounted, reactive, ref, watch } from 'vue';
import { usePluginView } from '../stores/usePluginView';
import { useBridgePending, usePluginBridge } from './usePluginBridge';
import { getLucideSvg } from '../lucide-svgs';
import { bytesToDataUrl } from '../utils/bytes-to-data-url';
import type { CardItem } from '../../shared/types';

// Module scope so the picker survives ContentPanel remounts (the panel is
// v-if'd on hasContent, which briefly flips false during slide-switch).
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

  const lastSent: Record<string, CardItem> = {};

  watch(
    () => view.state.currentSlideId,
    () => {
      previewUrls.value = {};
      previewSizes.value = {};
    },
  );

  // A canvas rescan (slide-loaded, native undo, external edit) can roll the
  // canvas back behind lastSent; a re-commit would then diff to an empty delta
  // and be dropped, diverging store and canvas until the next slide-switch.
  watch(
    () => view.state.content,
    () => {
      for (const key in lastSent) delete lastSent[key];
    },
  );

  function update(value: CardItem): void {
    const slideId = view.state.currentSlideId;
    if (slideId === null) return;

    // Delta payload: only fields changed since the last emit — saves a bridge
    // round-trip and a sandbox tree walk per keystroke.
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
    // icon may be null (icon-instance hidden) — omit when null.
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
      // Each Card variant binds the icon stroke to a different theme variable
      // (Default → background, Outline → text); toggling the variant alone keeps
      // the old paint binding, so re-send the icon to re-render the slot.
      if (!iconChanged && value.icon !== null) {
        payload.icon = value.icon;
        const svg = getLucideSvg(value.icon);
        if (svg !== null) payload.iconSvg = svg;
      }
    }
    if (Object.keys(payload).length === 0) return;

    // Optimistic store write of all fields even when emitting a delta; sync
    // `iconIntended` so the icon-reconcile watcher sees no spurious mismatch.
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
    // Reuses the `upload-image` channel; the sandbox routes to applyCardVisual
    // based on the card parent (handlers/image.ts).
    tracker.register();
    bridge.post({
      type: 'upload-image',
      targetNodeId: cardNodeId,
      bytes: bytes,
    });
  }

  const ICON_SIZE_BY: Record<CardSize, number> = { SM: 58, LG: 68, NO_ICON: 58 };
  const HEADING_STYLE_BY: Record<CardSize, 'Heading4' | 'Heading4-sm'> = {
    SM: 'Heading4-sm',
    LG: 'Heading4',
    NO_ICON: 'Heading4-sm',
  };
  // Values are Spacing-collection variable names ("1"–"9", 4–36px), not px.
  const GAP_MODE_BY: Record<CardSize, string> = { SM: '4', LG: '6', NO_ICON: '4' };
  const ICON_VISIBLE_BY: Record<CardSize, boolean> = { SM: true, LG: true, NO_ICON: false };

  function commitCardSize(value: CardSize): void {
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

  // tracker.pending also fires for text commits and uploads, so the size
  // picker gets its own busy flag; the 2s fallback guarantees it never sticks.
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

  // Card-icon reconcile lives at App.vue scope (useIconReconcile) so it runs
  // regardless of which tab is mounted.

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
