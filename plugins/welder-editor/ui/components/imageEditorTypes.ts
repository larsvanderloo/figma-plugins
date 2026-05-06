// plugins/welder-editor/ui/components/imageEditorTypes.ts
//
// Type definitions for ImageEditor + CropperCanvas.
// Lifted from sections/ImageEditor/src/types.ts with path updated.

export type NodeId = string;
export type ImageHash = string;

export type Transform = [[number, number, number], [number, number, number]];

export const IDENTITY_TRANSFORM: Transform = [
  [1, 0, 0],
  [0, 1, 0],
];

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ImageModel {
  imageWrapId: NodeId;
  imageHash: ImageHash | null;
  cropTransform?: Transform;
}

export type HandlePosition =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'right'
  | 'bottom-right'
  | 'bottom'
  | 'bottom-left'
  | 'left';
