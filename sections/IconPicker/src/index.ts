// sections/IconPicker/src/index.ts — barrel export.
//
// Consumer usage (from a plugin):
//   import { IconPicker } from '@figma-plugins/sections-icon-picker';
//   import type { IconPickerProps, IconPickerEmits } from '@figma-plugins/sections-icon-picker';
//
// Owner: ui-engineer.
// Resolves: MON-2894474937 (Sprint 5 Wave 3, Task 5.5).

export { default as IconPicker } from './IconPicker.vue';
export type { IconPickerProps, IconPickerEmits } from './IconPicker.vue';
