// sections/CardEditor/src/index.ts — barrel export.
//
// Consumer usage (from a plugin):
//   import { CardEditor } from '@figma-plugins/sections-card-editor';
//   import type {
//     CardEditorProps,
//     CardEditorEmits,
//     CardItem,
//   } from '@figma-plugins/sections-card-editor';
//
// Owner: ui-engineer.

export { default as CardEditor } from './CardEditor.vue';
export type { CardEditorProps, CardEditorEmits } from './CardEditor.vue';
export type { CardItem, NodeId, ImageHash } from './types.js';
