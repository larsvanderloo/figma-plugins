// sections/TimelineEditor/src/index.ts — barrel export.
//
// Consumer usage (from a plugin):
//   import { TimelineEditor } from '@figma-plugins/sections-timeline-editor/TimelineEditor';
//   import type {
//     TimelineItem,
//     TimelineEditorProps,
//     TimelineEditorEmits,
//   } from '@figma-plugins/sections-timeline-editor/TimelineEditor';
//
// Owner: ui-engineer.

export { default as TimelineEditor } from './TimelineEditor.vue';
export type { TimelineEditorProps, TimelineEditorEmits } from './TimelineEditor.vue';
export type { TimelineItem, NodeId } from './types.js';
