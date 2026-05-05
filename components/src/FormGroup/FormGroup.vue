<script setup lang="ts">
/**
 * FormGroup — label + control layout wrapper for Figma plugin panel forms.
 *
 * ## Purpose
 *
 * Encapsulates the repeated pattern found identically in:
 *   - TitleDescriptionEditor: two `<div class="…__field">` wrappers each
 *     containing a `<label>` + an input or textarea.
 *   - BadgeEditor: a label + input field wrapper AND a `role="group"` + span
 *     label + icon-picker slot wrapper — both share the same flex-col/gap-1
 *     layout and label styling.
 *
 * Both sections use:
 *   • A flex-col container with a 4 px gap between label and control.
 *   • A compact label: 11 px / weight 500 / var(--color-label) / user-select:none.
 *   • The control rendered into a default slot.
 *
 * ## Usage
 *
 * Provide a `label` prop and place the control in the default slot:
 *
 *   <FormGroup label="Heading">
 *     <input type="text" … />
 *   </FormGroup>
 *
 *   <FormGroup label="Badge icon" group>
 *     <IconPicker … />
 *   </FormGroup>
 *
 * ## Props
 *
 * | Prop     | Type    | Default | Description                                                 |
 * | -------- | ------- | ------- | ----------------------------------------------------------- |
 * | label    | string  | —       | Visible label text shown above the control.                 |
 * | labelFor | string  | —       | id of the control for <label for="…">. Omit when group=true.|
 * | group    | boolean | false   | When true: renders <div role="group"> + <span> instead of   |
 * |          |         |         | <label for="…">. Use for icon-picker / composite controls.  |
 *
 * ## Slots
 *
 * | Slot    | Bindings              | Description                                   |
 * | ------- | --------------------- | --------------------------------------------- |
 * | default | { labelId: string }   | The form control. labelId is the stable id    |
 * |          |                      | of the label element — pass it as             |
 * |          |                      | aria-labelledby on the control if needed.     |
 *
 * ## Accessibility
 *
 * - `labelFor` mode: the `<label>` has `for="<labelFor>"`. The control in the
 *   default slot must have `id="<labelFor>"` for the association to be valid.
 *   This is the standard form-label pattern (WCAG 1.3.1 Info and Relationships,
 *   Technique H44).
 * - `group` mode: the wrapper becomes `<div role="group">` with the label text
 *   in a `<span>` that is referenced by `aria-labelledby`. Use this for
 *   composite controls (e.g. icon pickers, radio groups) where a `<label for>`
 *   would be semantically incorrect (aria-prohibited-attr on the inner control).
 *
 * ## Design tokens used
 *
 * | CSS custom prop         | Fallback | Role           |
 * | ----------------------- | -------- | -------------- |
 * | --color-label           | #6b7280  | Label text     |
 *
 * ## When NOT to use
 *
 * - Do not use FormGroup when the label is visually hidden (use `InputField`
 *   with the `hideLabel` prop instead, or `sr-only` on the label).
 * - Do not use FormGroup when the control needs its own container with padding
 *   or background — add that to the slot content, not here.
 *
 * Owner: ui-engineer.
 * Resolves: MON-2893895110 (Sprint 2, Task 2.13 — component extraction).
 */

import { useId } from 'vue';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface FormGroupProps {
  /**
   * Visible label text displayed above the control.
   */
  label: string;
  /**
   * id of the control element, used for `<label for="…">`.
   * Required in default (non-group) mode for a valid label association.
   * Omit when `group` is true.
   */
  labelFor?: string;
  /**
   * When true the wrapper is `<div role="group" aria-labelledby="…">` and the
   * label is a `<span>` rather than a `<label for="…">`. Use for composite or
   * icon-picker controls where a <label for> would be semantically incorrect.
   * @default false
   */
  group?: boolean;
}

// labelFor is genuinely optional (undefined = not provided); specifying
// `undefined` as a withDefaults value is incompatible with
// exactOptionalPropertyTypes. Use defineProps directly and let group default
// to false via optional chaining in the template.
defineProps<FormGroupProps>();

// ---------------------------------------------------------------------------
// Stable label id for aria-labelledby in group mode
// ---------------------------------------------------------------------------

const labelId = useId();
</script>

<template>
  <!--
    group=false: standard <label for="…"> + default slot.
    group=true:  <div role="group" aria-labelledby="…"> + <span> label.
  -->
  <div v-if="!group" class="form-group">
    <label :for="labelFor" class="form-group__label">{{ label }}</label>
    <!--
      Slot binding `labelId` lets the consumer pass it as aria-labelledby
      on the control if the element type cannot be associated via <label for>.
    -->
    <slot :label-id="labelId" />
  </div>

  <div v-else role="group" :aria-labelledby="labelId" class="form-group">
    <span :id="labelId" class="form-group__label">{{ label }}</span>
    <slot :label-id="labelId" />
  </div>
</template>

<style scoped>
/*
 * Compact density — matches Figma plugin iframe context.
 * All colours are CSS custom properties (design tokens) so the component
 * adapts to light/dark themes without hard-coded hex codes.
 */

.form-group {
  display: flex;
  flex-direction: column;
  gap: 4px; /* tokens.spacing[1] */
}

.form-group__label {
  font-size: 11px;
  font-weight: 500;
  line-height: 1.4;
  color: var(--color-label, #6b7280);
  user-select: none;
}
</style>
