// plugins/welder-editor/ui/components/cropMath.ts
//
// Pure math utilities for CropRect ↔ Figma Transform conversion.
// Lifted from sections/ImageEditor/src/cropMath.ts with path updated.

import type { Transform, CropRect } from './imageEditorTypes.js';

export function cropRectToTransform(rect: CropRect): Transform {
  return [
    [rect.w, 0, rect.x],
    [0, rect.h, rect.y],
  ];
}

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
