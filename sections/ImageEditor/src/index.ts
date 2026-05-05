// sections/ImageEditor/src/index.ts — barrel export.
//
// Consumer usage (from a plugin):
//   import { ImageEditor } from '@figma-plugins/sections-image-editor';
//   import type {
//     ImageModel,
//     Transform,
//     ImageEditorProps,
//     ImageEditorEmits,
//   } from '@figma-plugins/sections-image-editor';
//
// Owner: ui-engineer.

export { default as ImageEditor } from './ImageEditor.vue';
export { default as CropperCanvas } from './CropperCanvas.vue';
export { cropRectToTransform, transformToCropRect } from './cropMath.js';
export type {
  ImageModel,
  Transform,
  CropRect,
  HandlePosition,
  NodeId,
  ImageHash,
} from './types.js';
export { IDENTITY_TRANSFORM } from './types.js';
export type { ImageEditorProps, ImageEditorEmits } from './ImageEditor.vue';
export type { CropperCanvasProps, CropperCanvasEmits } from './CropperCanvas.vue';
