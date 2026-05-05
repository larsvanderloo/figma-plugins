// sections/JourneyEditor/src/index.ts — barrel export.
//
// Consumer usage (from a plugin):
//   import { JourneyEditor } from '@figma-plugins/sections-journey-editor';
//   import type {
//     JourneyEditorProps,
//     JourneyEditorEmits,
//     JourneyWrapModel,
//     JourneyItemModel,
//     JourneyColumnModel,
//   } from '@figma-plugins/sections-journey-editor';
//
// Owner: ui-engineer.
// Resolves: MON-2893983016 (Sprint 4, Task 4.2).

export { default as JourneyEditor } from './JourneyEditor.vue';
export type { JourneyEditorProps, JourneyEditorEmits } from './JourneyEditor.vue';
export type { JourneyWrapModel, JourneyItemModel, JourneyColumnModel, NodeId } from './types.js';
