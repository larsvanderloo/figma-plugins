// sections/ImageEditor/src/index.ts — barrel export.
//
// Consumer usage (from a plugin):
//   import { ImageEditor } from '@figma-plugins/sections-image-editor';
//   import type { ImageEditorProps, ImageEditorEmits } from '@figma-plugins/sections-image-editor';
//
// Owner: ui-engineer.

export { default as ImageEditor } from './ImageEditor.vue';
export type { ImageEditorProps, ImageEditorEmits } from './ImageEditor.vue';
