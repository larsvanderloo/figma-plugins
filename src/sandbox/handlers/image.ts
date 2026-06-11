// ============================================================
// sandbox/handlers/image.ts
//
// Image-upload: routeert bytes naar de card-visual-slot (CardWrap-
// child) of de slide-level ImageWrap, en pusht direct een thumbnail-
// preview naar de iframe.
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import { postToUI } from '../bridge';
import { findSlideAncestor } from '../slides';
import { findCardWrap } from '../slide-machine';
import { applyImage } from '../editors/general/image';
import { applyCardVisual } from '../editors/content/card';
import { findImageSlot } from '../editors/_shared/node-finders';
import { lastSentPreviewHash } from '../scan/previews';
import type { UIToPluginMessage } from '../../shared/types';

export async function handleUploadImage(
  msg: Extract<UIToPluginMessage, { type: 'upload-image' }>,
): Promise<void> {
  // Target-node lookup — `documentAccess: "dynamic-page"` vereist de
  // async-variant. Bytes komen als Uint8Array via structured-cloning
  // binnen en hoeven niet geconverteerd te worden.
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

  // Routing: wanneer de target een directe child is van CardWrap gaan
  // de bytes naar de card-slot; anders naar de slide-level ImageWrap.
  const cardWrap = findCardWrap(slide);
  const targetParent = 'parent' in target ? (target as SceneNode).parent : null;
  const isCardChild =
    cardWrap !== null && targetParent !== null && targetParent.id === cardWrap.id;

  figma.commitUndo();

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
    // Refresh thumbnail in iframe immediately — bytes are already in
    // scope (the user just uploaded them), so no getBytesAsync round-
    // trip. fillW/fillH come from the card's visual slot for aspect-
    // ratio matching in the thumbnail box.
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

  // Refresh thumbnail in UI immediately — no need for getBytesAsync, we
  // already have the bytes that were just uploaded (FIG-ASYNC-01 compliant:
  // no fire-and-forget; this is synchronous within the async handler).
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
    // Fallback: laat dims op 0 staan; UI toont h-36 fallback.
  }
  postToUI({
    type: 'image-preview',
    imageWrapId: msg.targetNodeId,
    bytes: msg.bytes,
    fillW: previewFillW,
    fillH: previewFillH,
  });
  // Update dedup-cache so that een documentchange-triggered pick-slide
  // de preview niet opnieuw verstuurt met de verouderde hash.
  lastSentPreviewHash.set(msg.targetNodeId, newHash);

  postToUI({
    type: 'target-updated',
    ok: true,
    targetId: msg.targetNodeId,
  });
  return;
}
