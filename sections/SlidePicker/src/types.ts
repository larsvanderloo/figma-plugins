// sections/SlidePicker/src/types.ts
//
// Minimal type definitions for SlidePicker.
//
// SlideSummary is intentionally re-declared here (not imported from
// @shared/messages) so the SlidePicker section remains portable across
// plugins. The shape matches SlideSummary in the welder-editor message-bus
// contract v0.1.0 — any deviation is a type error at the call site.
//
// Owner: ui-engineer.

/** Figma node-id string (stable within a Figma session). */
export type NodeId = string;

/**
 * Summary of a single Welder Slide instance on the current page.
 * Shape mirrors plugins/welder-editor/shared/messages.ts SlideSummary.
 */
export interface SlideSummary {
  /** Figma node-id of the Slide INSTANCE (stable within a session). */
  id: NodeId;
  /** 1-based sort index in page order. */
  number: number;
  /** Display name, e.g. "Slide 3 — Customer Journey". */
  name: string;
  /**
   * Whether this slide is skipped in Figma Slides presentation mode.
   *   - true/false — Slides editor.
   *   - null — Figma Design editor (SlideNode not available).
   */
  isSkipped: boolean | null;
}
