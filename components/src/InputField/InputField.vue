<script setup lang="ts">
/**
 * InputField — labelled text input (single-line or multi-line) for Figma
 * plugin panels.
 *
 * ## Purpose
 *
 * Extracts the repeated label + input/textarea primitive from:
 *   - TitleDescriptionEditor (heading input, paragraph textarea) — explicit
 *     <label for> + <input>/<textarea>, focus ring, disabled state.
 *   - BadgeEditor (label input) — same structure; also uses `appearance:none`,
 *     transition: border-color, disabled styling.
 *   - IconPicker (search input) — `type="search"`, visually-hidden label,
 *     focus ring.
 *
 * All three sections share the same contract:
 *   • `useId()`-stable id pairing between <label> and <input>.
 *   • Visible focus ring via :focus-visible (no removal of outline).
 *   • Disabled state via the `disabled` HTML attribute.
 *   • Compact sizing: 12 px text, 4 px/8 px padding, 4 px border-radius.
 *   • Design-token colours (CSS custom props, never hard-coded hex).
 *
 * The variation across sections (single-line vs textarea, visible vs
 * sr-only label) is handled by two props: `multiline` and `hideLabel`.
 *
 * ## UInput rejection rationale
 *
 * Nuxt UI v4's UInput relies on `#build/ui/*` virtual module aliases generated
 * by Nuxt's build pipeline. Section packages and the components/ package run
 * under standalone Vite configs with no Nuxt app context — those aliases are
 * not available. Using UInput or UTextarea here would produce unresolvable
 * module errors in vitest and at build time.
 *
 * Decision: native <input>/<textarea> with explicit ARIA wiring. When the
 * plugin's vite.config.ts is wired with the Nuxt UI vite plugin (future sprint),
 * this component can be replaced with UInput/UTextarea behind the same
 * props/emits contract.
 *
 * ## Props
 *
 * | Prop        | Type    | Default | Description                                        |
 * | ----------- | ------- | ------- | -------------------------------------------------- |
 * | label       | string  | —       | Label text. Always present for screen readers.     |
 * | modelValue  | string  | ''      | Current input value (v-model).                     |
 * | type        | string  | 'text'  | <input> type. Ignored when multiline=true.         |
 * | placeholder | string  | —       | Placeholder text.                                  |
 * | disabled    | boolean | false   | Disables the input.                                |
 * | multiline   | boolean | false   | Renders <textarea> instead of <input>.             |
 * | rows        | number  | 3       | Textarea row count. Only used when multiline=true. |
 * | hideLabel   | boolean | false   | Visually hides the label (sr-only); still present  |
 * |             |         |         | for screen readers.                                |
 * | autocomplete| string  | 'off'   | Forwarded to the input/textarea.                   |
 *
 * ## Emits
 *
 * | Event             | Payload | Description                    |
 * | ----------------- | ------- | ------------------------------ |
 * | update:modelValue | string  | On every input event.          |
 *
 * ## Accessibility
 *
 * - Every instance has an explicit `<label>` associated to the input via
 *   `for`/`id` (WCAG 1.3.1, Technique H44).
 * - `hideLabel=true` renders the label with `.sr-only` — present in the
 *   accessibility tree, absent from the visual layout.
 * - Focus ring is always visible via `:focus-visible`. No override removes it.
 * - `disabled` is set on the native element; AT announces the state.
 * - No host Figma shortcuts (Cmd-Z, Cmd-D, Cmd-A) are captured in keydown
 *   handlers. Native browser text-editing handles them.
 * - `prefers-reduced-motion`: the border-color transition is suppressed.
 *
 * ## Design tokens used
 *
 * | CSS custom prop              | Fallback | Role                       |
 * | ---------------------------- | -------- | -------------------------- |
 * | --color-label                | #6b7280  | Label text                 |
 * | --color-input-text           | #111827  | Input text                 |
 * | --color-input-bg             | #ffffff  | Input background           |
 * | --color-input-border         | #d1d5db  | Default border             |
 * | --color-input-focus          | #2563eb  | Focus border colour        |
 * | --color-input-focus-ring     | rgba(37,99,235,0.2) | Focus ring shadow |
 * | --color-input-disabled-text  | #9ca3af  | Disabled text              |
 * | --color-input-disabled-bg    | #f9fafb  | Disabled background        |
 * | --color-input-disabled-border| #e5e7eb  | Disabled border            |
 *
 * ## When NOT to use
 *
 * - If you only need the label style, use FormGroup (which wraps any control).
 * - If the project's vite config has Nuxt UI's vite plugin wired, prefer UInput.
 *
 * Owner: ui-engineer.
 * Resolves: MON-2893895110 (Sprint 2, Task 2.13 — component extraction).
 */

import { useId } from 'vue';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface InputFieldProps {
  /** Label text. Always rendered (as sr-only when hideLabel=true). */
  label: string;
  /** Current value. Bind with v-model. */
  modelValue?: string;
  /**
   * HTML input `type`. Ignored when multiline=true.
   * Accepts any valid <input> type string; 'text' and 'search' are the
   * only values tested in this codebase.
   * @default 'text'
   */
  type?: string;
  /** Placeholder text forwarded to the input/textarea. */
  placeholder?: string;
  /** Disables the input/textarea. @default false */
  disabled?: boolean;
  /**
   * When true renders <textarea rows="rows"> instead of <input>.
   * @default false
   */
  multiline?: boolean;
  /**
   * Row count for textarea (only used when multiline=true).
   * @default 3
   */
  rows?: number;
  /**
   * Visually hides the label (sr-only) but keeps it in the a11y tree.
   * Use when the visual context makes the label redundant but AT users still
   * need it. Example: IconPicker search input.
   * @default false
   */
  hideLabel?: boolean;
  /**
   * Forwarded to the input/textarea autocomplete attribute.
   * @default 'off'
   */
  autocomplete?: string;
}

// placeholder is genuinely optional (absent = undefined); listing it in
// withDefaults with value `undefined` violates exactOptionalPropertyTypes.
// Omit it here — Vue treats unlisted optional props as undefined by default.
withDefaults(defineProps<InputFieldProps>(), {
  modelValue: '',
  type: 'text',
  disabled: false,
  multiline: false,
  rows: 3,
  hideLabel: false,
  autocomplete: 'off',
});

// ---------------------------------------------------------------------------
// Emits
// ---------------------------------------------------------------------------

export interface InputFieldEmits {
  /** Fired on every native `input` event. Payload is the current string value. */
  'update:modelValue': [value: string];
}

const emit = defineEmits<InputFieldEmits>();

// ---------------------------------------------------------------------------
// Stable ids for label/input association
// ---------------------------------------------------------------------------

const inputId = useId();

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

function onInput(event: Event): void {
  const target = event.target as HTMLInputElement | HTMLTextAreaElement;
  emit('update:modelValue', target.value);
}
</script>

<template>
  <div class="input-field">
    <label :for="inputId" class="input-field__label" :class="{ 'sr-only': hideLabel }">{{
      label
    }}</label>

    <textarea
      v-if="multiline"
      :id="inputId"
      class="input-field__control input-field__textarea"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      :rows="rows"
      :autocomplete="autocomplete"
      autocorrect="off"
      autocapitalize="off"
      spellcheck="false"
      @input="onInput"
    />

    <input
      v-else
      :id="inputId"
      class="input-field__control"
      :type="type"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      :autocomplete="autocomplete"
      autocorrect="off"
      autocapitalize="off"
      spellcheck="false"
      @input="onInput"
    />
  </div>
</template>

<style scoped>
/*
 * Compact density — matches Figma plugin iframe context.
 * All colours are CSS custom properties so the component adapts to Figma's
 * light/dark themes without hard-coded hex codes.
 */

.input-field {
  display: flex;
  flex-direction: column;
  gap: 4px; /* tokens.spacing[1] */
}

.input-field__label {
  font-size: 11px;
  font-weight: 500;
  line-height: 1.4;
  color: var(--color-label, #6b7280);
  user-select: none;
}

.input-field__control {
  width: 100%;
  box-sizing: border-box;
  padding: 4px 8px; /* tokens.spacing[1] / tokens.spacing[2] */
  font-size: 12px;
  font-family: inherit;
  line-height: 1.5;
  color: var(--color-input-text, #111827);
  background: var(--color-input-bg, #ffffff);
  border: 1px solid var(--color-input-border, #d1d5db);
  border-radius: 4px; /* tokens.radius.sm */

  /* Remove browser default outline — replaced with :focus-visible below. */
  outline: none;

  /* Prevent native appearance that overrides our border. */
  appearance: none;

  /* Smooth focus transition — suppressed when prefers-reduced-motion is set. */
  transition: border-color 100ms ease;
}

@media (prefers-reduced-motion: reduce) {
  .input-field__control {
    transition: none;
  }
}

.input-field__control:focus-visible {
  border-color: var(--color-input-focus, #2563eb);
  box-shadow: 0 0 0 2px var(--color-input-focus-ring, rgba(37, 99, 235, 0.2));
}

.input-field__control:disabled {
  color: var(--color-input-disabled-text, #9ca3af);
  background: var(--color-input-disabled-bg, #f9fafb);
  border-color: var(--color-input-disabled-border, #e5e7eb);
  cursor: not-allowed;
}

.input-field__textarea {
  resize: vertical;
  min-height: 56px;
}

/* sr-only utility — Tailwind not available in scoped <style>. */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
</style>
