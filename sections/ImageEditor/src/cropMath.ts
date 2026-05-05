// sections/ImageEditor/src/cropMath.ts
//
// Pure math utilities for converting between CropRect (normalised image-space
// coordinates) and Figma's 2×3 Transform matrix (imageTransform).
//
// These are separate from the Vue components so that:
//   1. They can be imported into tests without instantiating a Vue component.
//   2. They can be exported from the barrel (index.ts) without triggering
//      the @vue/compiler-sfc restriction on named exports inside <script setup>.
//
// Owner: ui-engineer.

import type { Transform, CropRect } from './types.js';

/**
 * Convert a normalised CropRect to a Figma ImagePaint Transform.
 *
 * Figma's imageTransform maps from fill-space [0..1 × 0..1] to image-space.
 * A crop region [x, y, w, h] in image-normalised coordinates means:
 *   - The fill origin (0,0) maps to image point (x, y).
 *   - The fill spans w × h of the image.
 *
 * The forward transform (fill → image) is:
 *   [[w, 0, x],
 *    [0, h, y]]
 */
export function cropRectToTransform(rect: CropRect): Transform {
  return [
    [rect.w, 0, rect.x],
    [0, rect.h, rect.y],
  ];
}

/**
 * Convert a Figma ImagePaint Transform back to a CropRect.
 * Inverse of cropRectToTransform.
 * Assumes the transform was produced by cropRectToTransform (no rotation/shear).
 */
export function transformToCropRect(t: Transform): CropRect {
  const a = t[0][0];
  const tx = t[0][2];
  const d = t[1][1];
  const ty = t[1][2];
  return {
    x: tx,
    y: ty,
    w: a,
    h: d,
  };
}
