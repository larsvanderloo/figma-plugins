// sections/BadgeEditor/src/index.ts — barrel export.
//
// Consumer usage (from a plugin):
//   import { BadgeEditor } from '@figma-plugins/sections-badge-editor';
//   import type { BadgeModel, BadgeEditorProps, BadgeEditorEmits } from '@figma-plugins/sections-badge-editor';
//
// Owner: ui-engineer.

export { default as BadgeEditor } from './BadgeEditor.vue';
export type { BadgeModel, NodeId } from './types.js';
export type { BadgeEditorProps, BadgeEditorEmits } from './BadgeEditor.vue';
