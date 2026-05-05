<script setup lang="ts">
/**
 * StatusMessage — ARIA live region for async UI states (loading, error, empty).
 *
 * ## Purpose
 *
 * Extracts the repeated live-region pattern from:
 *   - IconPicker: `<p role="status" aria-live="polite" aria-atomic="true">` —
 *     announces "Loading icons…" while the manifest is fetching, then
 *     "No icons match "…"" for zero-result searches.
 *   - SlidePicker: `<p role="alert">` — immediately announces error messages
 *     when the slide-list request fails.
 *
 * Both patterns are message-bus async responses surfacing in the UI. The
 * same pattern will appear in every new section that has an async data-load
 * path (Sprint 3: TableEditor, ImageEditor, etc.).
 *
 * ## Variant design
 *
 * Two variants are supported:
 *   - `'status'` (default) — `role="status"` + `aria-live="polite"`.
 *     Used for non-urgent updates (loading completion, empty states).
 *   - `'alert'` — `role="alert"` + `aria-live="assertive"`.
 *     Used for error states that interrupt the user's current task.
 *
 * The element is always in the DOM but renders no visible output when no
 * message is active (`message` is empty or null). This keeps the live region
 * registered and ready — moving a live region in/out of the DOM causes AT to
 * miss announcements in some browsers.
 *
 * ## Props
 *
 * | Prop     | Type                  | Default   | Description                             |
 * | -------- | --------------------- | --------- | --------------------------------------- |
 * | message  | string \| null        | null      | Text to announce. Falsy = no output.    |
 * | variant  | 'status' \| 'alert'   | 'status'  | ARIA role + live-region politeness.     |
 * | visuallyHidden | boolean         | false     | Shows only to AT, hides from layout.    |
 *
 * ## Accessibility
 *
 * - `role="status"` implies `aria-live="polite"` + `aria-atomic="true"`.
 *   The `aria-live` is set explicitly for redundancy across AT implementations.
 * - `role="alert"` implies `aria-live="assertive"` + `aria-atomic="true"`.
 * - The element is always present in the DOM (never v-if'd away) to ensure
 *   AT registers the live region before announcements are needed.
 * - `aria-atomic="true"` means AT reads the entire message when any part
 *   changes — correct for single-line status strings.
 * - When `message` is empty/null, the element is empty (no text node) so
 *   AT does not re-announce on re-render.
 *
 * ## Design tokens used
 *
 * | CSS custom prop  | Fallback | Role                          |
 * | ---------------- | -------- | ----------------------------- |
 * | --color-error    | #dc2626  | Error text colour (alert only)|
 * | --color-muted    | #6b7280  | Muted text colour (status)    |
 *
 * ## When NOT to use
 *
 * - Do not use StatusMessage for inline form-field validation errors — those
 *   should be associated via `aria-describedby` on the field. StatusMessage
 *   is for section-level async states.
 * - Do not use `variant="alert"` for non-error status updates — it interrupts
 *   the user's current AT context.
 *
 * Owner: ui-engineer.
 * Resolves: MON-2893895110 (Sprint 2, Task 2.13 — component extraction).
 */

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type StatusMessageVariant = 'status' | 'alert';

export interface StatusMessageProps {
  /**
   * The message to announce to screen readers and display visually.
   * When null or empty string, the element renders empty (no announcement).
   */
  message?: string | null;
  /**
   * Controls ARIA semantics and announcement urgency:
   *   'status' → role="status" aria-live="polite"   (non-urgent)
   *   'alert'  → role="alert"  aria-live="assertive" (urgent/error)
   * @default 'status'
   */
  variant?: StatusMessageVariant;
  /**
   * When true, the element is visually hidden via sr-only but still present
   * in the accessibility tree. Use when the surrounding UI provides equivalent
   * visual feedback (e.g. a spinner) and only AT needs the text.
   * @default false
   */
  visuallyHidden?: boolean;
}

withDefaults(defineProps<StatusMessageProps>(), {
  message: null,
  variant: 'status',
  visuallyHidden: false,
});
</script>

<template>
  <!--
    Always in the DOM — moving live regions in/out of the DOM causes missed
    announcements in some AT/browser combinations.

    The element is empty (no text node) when message is falsy, so AT does not
    re-announce on renders that don't change the message.

    role="status"  → aria-live="polite"    (variant="status", default)
    role="alert"   → aria-live="assertive" (variant="alert")
    aria-atomic    → explicit; implied by both roles but stated for robustness.
    aria-live      → explicit; redundant but defensive across AT implementations.
  -->
  <p
    :role="variant"
    :aria-live="variant === 'alert' ? 'assertive' : 'polite'"
    aria-atomic="true"
    class="status-message"
    :class="{
      'status-message--alert': variant === 'alert',
      'sr-only': visuallyHidden,
    }"
  >
    {{ message ?? '' }}
  </p>
</template>

<style scoped>
/*
 * Base: minimal visual treatment. Compact for plugin iframe context.
 * Colours use CSS custom props so the component adapts to light/dark themes.
 */

.status-message {
  margin: 0;
  padding: 0;
  font-size: 11px;
  line-height: 1.4;
  color: var(--color-muted, #6b7280);
  min-height: 0; /* Do not reserve layout space when empty */
}

.status-message--alert {
  color: var(--color-error, #dc2626);
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
