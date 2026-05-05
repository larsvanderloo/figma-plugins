// sections/IconPicker/src/index.ts — barrel export.
//
// Consumer usage (from a plugin):
//   import { IconPicker } from '@figma-plugins/sections-icon-picker';
//   import type { IconPickerProps, IconPickerEmits } from '@figma-plugins/sections-icon-picker';
//   import { ICON_KEYS } from '@figma-plugins/sections-icon-picker';
//   import type { IconKey } from '@figma-plugins/sections-icon-picker';
//
// Owner: ui-engineer.

export { default as IconPicker } from './IconPicker.vue';
export type { IconPickerProps, IconPickerEmits } from './IconPicker.vue';
export { ICON_KEYS, loadIconManifest, isManifestLoaded } from './icons.js';
export type { IconKey } from './icons.js';
