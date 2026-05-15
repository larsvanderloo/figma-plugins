// useCardEditor — binds the Content → Cards list to the store + bridge,
// and manages the sandbox-driven card-visual previews.

import { computed, onUnmounted, reactive, ref, watch } from 'vue';
import { usePluginView } from '../stores/usePluginView';
import { useBridgePending, usePluginBridge } from './usePluginBridge';
import type { CardItem } from '../../types';

function bytesToDataUrl(bytes: Uint8Array): string {
  let mime = 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    mime = 'image/jpeg';
  }
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunkSize)) as unknown as number[],
    );
  }
  return 'data:' + mime + ';base64,' + btoa(binary);
}

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
      style?: 'Default' | 'Outline';
    } = {};
    if (prev === undefined || prev.heading !== value.heading) {
      payload.heading = value.heading;
    }
    if (prev === undefined || prev.paragraph !== value.paragraph) {
      payload.paragraph = value.paragraph;
    }
    // T32: icon may be null (icon-instance hidden) — omit when null.
    if ((prev === undefined || prev.icon !== value.icon) && value.icon !== null) {
      payload.icon = value.icon;
    }
    if ((prev === undefined || prev.style !== value.style) && value.style !== null) {
      payload.style = value.style;
    }
    if (Object.keys(payload).length === 0) return;

    // Optimistic local update — always write all fields so the store
    // matches what the user sees, even when we only emit a delta.
    const list = view.state.content?.cards ?? null;
    if (list !== null) {
      const idx = list.findIndex((c) => c.cardNodeId === value.cardNodeId);
      if (idx >= 0) {
        list[idx].heading = value.heading;
        list[idx].paragraph = value.paragraph;
        list[idx].icon = value.icon;
        list[idx].style = value.style;
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
    // based on card-parent (see code.ts upload-image handler).
    tracker.register();
    bridge.post({
      type: 'upload-image',
      targetNodeId: cardNodeId,
      bytes: bytes,
    });
  }

  return reactive({
    cards,
    pending: tracker.pending,
    previewUrls,
    previewSizes,
    update,
    uploadVisual,
  });
}
