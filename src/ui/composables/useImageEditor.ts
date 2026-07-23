import { computed, onUnmounted, reactive, ref, watch } from 'vue';
import { usePluginView } from '../stores/usePluginView';
import { useBridgePending, usePluginBridge } from './usePluginBridge';
import { bytesToDataUrl } from '../utils/bytes-to-data-url';
import type { ImageValue } from '../components/editors/ImageEditor.vue';

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
    // A stale preview can arrive after a slide switch; only accept it for the active imageWrap.
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
