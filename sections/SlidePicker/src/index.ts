// sections/SlidePicker/src/index.ts — barrel export.
//
// Consumer usage (from a plugin):
//   import { SlidePicker } from '@figma-plugins/sections-slide-picker';
//   import type { SlideSummary, SlidePickerProps, SlidePickerEmits } from '@figma-plugins/sections-slide-picker';
//
// Owner: ui-engineer.

export { default as SlidePicker } from './SlidePicker.vue';
export type { SlideSummary, NodeId } from './types.js';
export type { SlidePickerProps, SlidePickerEmits } from './SlidePicker.vue';
