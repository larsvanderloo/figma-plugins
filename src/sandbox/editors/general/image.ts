// The `'fills' in slot` guard looks redundant (the slot is an instance and
// exposes fills today) but protects against future wrapper variants.

import { findImageWrap } from '../../slide-machine';
import { findImageSlot } from '../_shared/node-finders';

export interface ImageUploadPayload {
  bytes: Uint8Array;
}

/**
 * Returns the new image hash, or null when nothing was mutated (missing
 * wrapper/slot): a silent skip — the UI keeps stale state until a slide switch.
 */
export async function applyImage(
  slide: InstanceNode,
  payload: ImageUploadPayload,
): Promise<string | null> {
  const imageWrap = findImageWrap(slide);
  if (imageWrap === null) return null;

  const slot = findImageSlot(imageWrap, true);
  if (slot === null) return null;
  if (!('fills' in slot)) return null;

  // figma.createImage throws on corrupt or unsupported bytes (PNG/JPG/GIF only).
  const image = figma.createImage(payload.bytes);
  const imageHash = image.hash;

  const paint: ImagePaint = {
    type: 'IMAGE',
    imageHash: imageHash,
    scaleMode: 'FILL',
  };

  // Replace all fills — the image slot conceptually carries exactly one image.
  (slot as GeometryMixin).fills = [paint];

  return imageHash;
}

