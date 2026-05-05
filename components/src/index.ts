// @figma-plugins/components — barrel export.
//
// Atomic Vue primitives built atop Nuxt UI v4, themed for the Figma
// plugin iframe context. Add component re-exports here as they land.
//
// Usage from a plugin:
//   import { InputField, FormGroup, StatusMessage } from "@figma-plugins/components";

// Sprint 2 — extracted from 6 merged sections (Task 2.13).
export { FormGroup } from './FormGroup/index.js';
export type { FormGroupProps } from './FormGroup/index.js';

export { InputField } from './InputField/index.js';
export type { InputFieldProps, InputFieldEmits } from './InputField/index.js';

export { StatusMessage } from './StatusMessage/index.js';
export type { StatusMessageProps, StatusMessageVariant } from './StatusMessage/index.js';
