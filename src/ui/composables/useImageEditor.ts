// useImageEditor — binds the General → Image section to the store + bridge,
// and manages the sandbox-driven preview bytes that arrive via
// `image-preview` messages.

import { computed, onUnmounted, reactive, ref, watch } from 'vue';
import { usePluginView } from '../stores/usePluginView';
import { useBridgePending, usePluginBridge } from './usePluginBridge';
import type { ImageValue } from '../components/editors/ImageEditor.vue';

/** Uint8Array → data-URL. JPEG sniff via magic bytes; PNG default.
 *  Chunked btoa avoids stack-overflow on large fill bytes (≥2 MB). */
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

export function useImageEditor() {
  const view = usePluginView();
  const bridge = usePluginBridge();
  const tracker = useBridgePending(bridge);

  const model = computed<ImageValue | null>(() => {
    const img = view.state.general?.image;
    if (img === null || img === undefined) return null;
    return { hasImage: img.imageHash !== null, imageHash: img.imageHash };
  });

  const previewUrl = ref<string | null>(null);
  const fillW = ref<number | null>(null);
  const fillH = ref<number | null>(null);
  const sizeBytes = ref<number | null>(null);

  const unsubscribe = bridge.onMessage((msg) => {
    if (msg.type !== 'image-preview') return;
    // Scope-guard: only accept if imageWrapId matches the active section
    // (prevents a stale preview from clobbering a freshly-switched slide).
    const img = view.state.general?.image;
    if (img === null || img === undefined) return;
    if (msg.imageWrapId !== img.imageWrapId) return;
    previewUrl.value = bytesToDataUrl(msg.bytes);
    sizeBytes.value = msg.bytes.length;
    fillW.value = typeof msg.fillW === 'number' && msg.fillW > 0 ? msg.fillW : null;
    fillH.value = typeof msg.fillH === 'number' && msg.fillH > 0 ? msg.fillH : null;
  });
  onUnmounted(unsubscribe);

  // Reset on slide-switch so a stale preview doesn't bleed onto a new slide.
  watch(
    () => view.state.currentSlideId,
    () => {
      previewUrl.value = null;
      fillW.value = null;
      fillH.value = null;
      sizeBytes.value = null;
    },
  );

  function upload(bytes: Uint8Array): void {
    const img = view.state.general?.image;
    if (img === null || img === undefined) return;
    tracker.register();
    bridge.post({
      type: 'upload-image',
      targetNodeId: img.imageWrapId,
      bytes: bytes,
    });
  }

  return reactive({ model, pending: tracker.pending, previewUrl, fillW, fillH, sizeBytes, upload });
}
