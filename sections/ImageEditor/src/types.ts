// sections/ImageEditor/src/types.ts
//
// Minimal type definitions for ImageEditor.
//
// Transform and ImageModel are intentionally re-declared here (not imported
// from @shared/messages) so the ImageEditor section remains portable across
// plugins. The shapes match messages.ts in welder-editor v0.1.0 — any
// deviation is a type error at the call site.
//
// Owner: ui-engineer.

/** Figma node-id string (stable within a Figma session). */
export type NodeId = string;

/** Figma image hash — references an image registered with figma.createImage(). */
export type ImageHash = string;

/**
 * Figma 2×3 affine transform matrix expressed as two rows of three values:
 *   [[a, b, tx], [c, d, ty]]
 *
 * In the context of ImagePaint.imageTransform this matrix maps the image's
 * normalised coordinate space (0..1 × 0..1) to the fill bounding box.
 * A no-op crop uses the identity: [[1, 0, 0], [0, 1, 0]].
 *
 * Shape mirrors the `cropTransform` field in
 * plugins/welder-editor/shared/messages.ts ImageSection.
 */
export type Transform = [[number, number, number], [number, number, number]];

/**
 * The identity transform — fills the entire image with no crop.
 */
export const IDENTITY_TRANSFORM: Transform = [
  [1, 0, 0],
  [0, 1, 0],
];

/**
 * A crop rectangle in normalised image coordinates.
 * All values are in the range [0, 1].
 * - x, y: top-left corner of the crop region.
 * - w, h: width and height of the crop region.
 *
 * Derived from and convertible to a Transform via
 * cropRectToTransform() / transformToCropRect() in CropperCanvas.vue.
 */
export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Editable state for a single ImageWrap fill slot.
 * Shape mirrors plugins/welder-editor/shared/messages.ts ImageSection,
 * minus fields not consumed by this section (no re-export of message types).
 */
export interface ImageModel {
  /** Figma node-id of the ImageWrap INSTANCE. */
  imageWrapId: NodeId;
  /**
   * Figma ImagePaint hash for the current fill.
   * - string — fill is present.
   * - null  — ImageWrap still has a placeholder fill; no image to crop.
   */
  imageHash: ImageHash | null;
  /**
   * Crop transform applied to the fill.
   * - Transform — a crop is active.
   * - undefined — no crop (full image visible), treated as identity.
   */
  cropTransform?: Transform;
}

/**
 * The eight drag-handle positions on the crop box.
 * Corner handles resize on both axes; edge handles resize on one axis.
 */
export type HandlePosition =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'right'
  | 'bottom-right'
  | 'bottom'
  | 'bottom-left'
  | 'left';
