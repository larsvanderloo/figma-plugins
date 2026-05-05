// wrappers/ImageWrap.ts — ImageWrap detector, extractor, and applier (1.11)
//
// Finds the ImageWrap INSTANCE within a slide and extracts the ImageSection
// model. Also handles the apply-image mutation (upload bytes → create ImagePaint).
//
// Detection: name === 'ImageWrap' (exact match).
//
// Image slot discovery (three strategies):
//   1. Descendant named 'Image', 'Visual', or 'ImageSlot' with fills property.
//   2. Descendant with an existing IMAGE fill (placeholder pattern).
//   3. The wrapper node itself as last resort.
//
// cropTransform: always undefined in v0.1.0 (crop deferred).
//
// Wave 1 wrapper usage: none — applyImage uses figma.createImage directly
// because no wrapper covers image-paint creation.
//
// No Zod — hand-rolled type guards per ADR-0003 §A.
//
// Owner: figma-api-engineer

import type { ImageSection, ImageHash } from '@shared/messages';
import { findImageWrap } from '../slide-machine';

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/** Finds the ImageWrap INSTANCE within a slide. */
export function findImageWrapWrapper(slide: InstanceNode): InstanceNode | null {
  return findImageWrap(slide);
}

// ---------------------------------------------------------------------------
// Image slot helper (exported for main.ts preview fetch)
// ---------------------------------------------------------------------------

/**
 * Finds the fill-bearing child within an ImageWrap that carries the ImagePaint.
 *
 * Strategy 1: descendant named 'Image', 'Visual', or 'ImageSlot' that has fills.
 * Strategy 2: descendant with an existing IMAGE fill (placeholder pattern).
 * Strategy 3: the wrapper itself as fallback.
 *
 * Exported so main.ts can read slot dimensions for preview aspect-ratio matching.
 */
export function findImageSlot(imageWrap: InstanceNode): SceneNode | null {
  if (!('findOne' in imageWrap)) return null;

  // Strategy 1: name-based.
  const byName = imageWrap.findOne(function (n: SceneNode) {
    if (n.name !== 'Image' && n.name !== 'Visual' && n.name !== 'ImageSlot') return false;
    return 'fills' in n;
  });
  if (byName !== null) return byName;

  // Strategy 2: existing IMAGE fill.
  const byFill = imageWrap.findOne(function (n: SceneNode) {
    if (!('fills' in n)) return false;
    const fills = (n as GeometryMixin).fills;
    if (fills === figma.mixed) return false;
    if (!Array.isArray(fills)) return false;
    for (let i = 0; i < fills.length; i++) {
      if (fills[i]!.type === 'IMAGE') return true;
    }
    return false;
  });
  if (byFill !== null) return byFill;

  // Strategy 3: wrapper itself.
  return imageWrap;
}

// ---------------------------------------------------------------------------
// Extraction
// ---------------------------------------------------------------------------

/**
 * Extracts the ImageSection model from an ImageWrap instance.
 * Reads the current ImagePaint hash from the image slot.
 * imageHash is null when the slot still has a placeholder fill.
 */
export function extractImageWrap(imageWrap: InstanceNode): ImageSection {
  return {
    imageWrapId: imageWrap.id,
    imageHash: readImageHash(imageWrap),
    // cropTransform: undefined in v0.1.0 (crop deferred).
  };
}

function readImageHash(imageWrap: InstanceNode): ImageHash | null {
  const slot = findImageSlot(imageWrap);
  if (slot === null || !('fills' in slot)) return null;

  const fills = (slot as GeometryMixin).fills;
  if (fills === figma.mixed || !Array.isArray(fills)) return null;

  for (let i = 0; i < fills.length; i++) {
    if (fills[i]!.type === 'IMAGE') {
      const hash = (fills[i]! as ImagePaint).imageHash;
      return hash !== null ? hash : null;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Mutation (apply-image handler)
// ---------------------------------------------------------------------------

/**
 * Applies uploaded image bytes to the ImageWrap within slide.
 * Creates a fresh ImagePaint with scaleMode='FILL' (crop deferred to v0.2.0).
 *
 * @figma-direct: figma.createImage — no wrapper covers image-paint creation.
 *
 * Returns { imageWrapId, imageHash } on success, null when no ImageWrap found.
 */
export async function applyImageWrap(
  slide: InstanceNode,
  bytes: Uint8Array,
): Promise<{ imageWrapId: string; imageHash: ImageHash } | null> {
  const imageWrap = findImageWrap(slide);
  if (imageWrap === null) return null;

  const slot = findImageSlot(imageWrap);
  if (slot === null || !('fills' in slot)) return null;

  // @figma-direct: figma.createImage — image-paint creation has no wrapper equivalent.
  const image = figma.createImage(bytes);
  const imageHash = image.hash;

  const paint: ImagePaint = {
    type: 'IMAGE',
    imageHash: imageHash,
    scaleMode: 'FILL',
  };

  (slot as GeometryMixin).fills = [paint];

  return { imageWrapId: imageWrap.id, imageHash };
}

/**
 * Fetches raw bytes for the current ImagePaint in the slot, plus slot dimensions
 * (for preview aspect-ratio rendering in the ui).
 *
 * Returns null when no ImageWrap, no image hash, or getBytesAsync fails.
 *
 * @figma-direct: figma.getImageByHash — no wrapper covers image hash lookup.
 */
export async function getImagePreviewBytes(
  imageWrap: InstanceNode,
): Promise<{ bytes: Uint8Array; fillW: number; fillH: number } | null> {
  const hash = readImageHash(imageWrap);
  if (hash === null) return null;

  // @figma-direct: figma.getImageByHash — no wrapper covers image hash lookup.
  const img = figma.getImageByHash(hash);
  if (img === null) return null;

  let bytes: Uint8Array;
  try {
    bytes = await img.getBytesAsync();
  } catch (_e) {
    return null;
  }

  // Slot dimensions for aspect-ratio matching in the ui preview.
  let fillW = 0;
  let fillH = 0;
  const slot = findImageSlot(imageWrap);
  if (slot !== null && 'width' in slot && 'height' in slot) {
    const slotW = (slot as LayoutMixin).width;
    const slotH = (slot as LayoutMixin).height;
    if (slotW > 0 && slotH > 0) {
      fillW = slotW;
      fillH = slotH;
    }
  }

  return { bytes, fillW, fillH };
}
