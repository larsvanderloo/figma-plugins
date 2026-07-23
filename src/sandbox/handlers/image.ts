import { markSelfWrite, postToUI } from '../bridge';
import { findSlideAncestor, summaryForSlide } from '../slides';
import { scanSlide } from '../scan/slide-scan';
import { findCardWrap } from '../slide-machine';
import { applyImage } from '../editors/general/image';
import { applyCardVisual } from '../editors/content/card';
import { findImageSlot } from '../editors/_shared/node-finders';
import { lastSentPreviewHash } from '../scan/previews';
import type { UIToPluginMessage } from '../../shared/types';

export async function handleUploadImage(
  msg: Extract<UIToPluginMessage, { type: 'upload-image' }>,
): Promise<void> {
  // `documentAccess: "dynamic-page"` requires the async node lookup.
  const target = await figma.getNodeByIdAsync(msg.targetNodeId);
  if (target === null) {
    postToUI({
      type: 'target-updated',
      ok: false,
      error: 'Target node not found: ' + msg.targetNodeId,
    });
    return;
  }
  const slide = findSlideAncestor(target);
  if (slide === null) {
    postToUI({
      type: 'target-updated',
      ok: false,
      error: 'No enclosing slide for target: ' + msg.targetNodeId,
    });
    return;
  }

  const cardWrap = findCardWrap(slide);
  const targetParent = 'parent' in target ? (target as SceneNode).parent : null;
  const isCardChild =
    cardWrap !== null && targetParent !== null && targetParent.id === cardWrap.id;

  figma.commitUndo();
  // Mark before AND after the mutation: the fill write fires documentchange, whose
  // debounced full re-scan is redundant — the explicit scan+post below re-syncs the store.
  markSelfWrite();

  if (isCardChild) {
    const newHash = await applyCardVisual(slide, msg.targetNodeId, msg.bytes);
    if (newHash === null) {
      postToUI({
        type: 'target-updated',
        ok: false,
        error: 'Card visual slot not found: ' + msg.targetNodeId,
      });
      return;
    }
    markSelfWrite();
    // Reuse the just-uploaded bytes for the preview — no getBytesAsync round-trip.
    // fillW/fillH come from the visual slot so the thumbnail keeps its aspect ratio.
    let cardFillW = 0;
    let cardFillH = 0;
    if (target.type === 'INSTANCE') {
      const cardSlot = findImageSlot(target as InstanceNode, false);
      if (cardSlot !== null && 'width' in cardSlot && 'height' in cardSlot) {
        const w = (cardSlot as LayoutMixin).width;
        const h = (cardSlot as LayoutMixin).height;
        if (w > 0 && h > 0) {
          cardFillW = w;
          cardFillH = h;
        }
      }
    }
    postToUI({
      type: 'card-visual-preview',
      cardNodeId: msg.targetNodeId,
      bytes: msg.bytes,
      fillW: cardFillW,
      fillH: cardFillH,
    });
    postToUI({
      type: 'target-updated',
      ok: true,
      targetId: msg.targetNodeId,
    });
    await postSlideLoadedAfterUpload(slide);
    return;
  }

  const newHash = await applyImage(slide, { bytes: msg.bytes });
  if (newHash === null) {
    postToUI({
      type: 'target-updated',
      ok: false,
      error: 'ImageWrap not found on slide: ' + slide.id,
    });
    return;
  }
  markSelfWrite();

  // Same as the card branch: reuse the uploaded bytes, no getBytesAsync round-trip.
  var previewFillW = 0;
  var previewFillH = 0;
  try {
    if (target.type === 'INSTANCE') {
      var previewSlot = findImageSlot(target as InstanceNode, true);
      if (previewSlot !== null && 'width' in previewSlot && 'height' in previewSlot) {
        var previewSlotW = (previewSlot as LayoutMixin).width;
        var previewSlotH = (previewSlot as LayoutMixin).height;
        if (previewSlotW > 0 && previewSlotH > 0) {
          previewFillW = previewSlotW;
          previewFillH = previewSlotH;
        }
      }
    }
  } catch (_e) {
    // Dims stay 0; the UI renders its fixed-height thumbnail fallback.
  }
  postToUI({
    type: 'image-preview',
    imageWrapId: msg.targetNodeId,
    bytes: msg.bytes,
    fillW: previewFillW,
    fillH: previewFillH,
  });
  // Update the dedup cache so a documentchange-triggered pick-slide
  // does not resend the preview with the stale hash.
  lastSentPreviewHash.set(msg.targetNodeId, newHash);

  postToUI({
    type: 'target-updated',
    ok: true,
    targetId: msg.targetNodeId,
  });
  await postSlideLoadedAfterUpload(slide);
  return;
}

/**
 * markSelfWrite() suppressed the documentchange re-scan and the preview posts carry
 * only thumbnail bytes — the store's imageHash/visualHash arrive solely via slide-loaded,
 * so without this post a first upload into an empty slot never updates its status label.
 */
async function postSlideLoadedAfterUpload(slide: InstanceNode): Promise<void> {
  try {
    const scan = await scanSlide(slide);
    postToUI({
      type: 'slide-loaded',
      summary: summaryForSlide(slide),
      general: scan.general,
      content: scan.content,
      graphs: scan.graphs,
    });
  } catch (err) {
    console.log('[welder-slide-editor] post-upload scanSlide failed:', err);
  }
}
