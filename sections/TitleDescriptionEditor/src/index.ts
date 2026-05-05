// sections/TitleDescriptionEditor/src/index.ts — barrel export.
//
// Consumer usage (from a plugin):
//   import { TitleDescriptionEditor } from '@figma-plugins/sections-title-description-editor';
//   import type {
//     TitleDescriptionModel,
//     TitleDescriptionEditorProps,
//     TitleDescriptionEditorEmits,
//   } from '@figma-plugins/sections-title-description-editor';
//
// Owner: ui-engineer.

export { default as TitleDescriptionEditor } from './TitleDescriptionEditor.vue';
export type { TitleDescriptionModel, NodeId } from './types.js';
export type {
  TitleDescriptionEditorProps,
  TitleDescriptionEditorEmits,
} from './TitleDescriptionEditor.vue';
