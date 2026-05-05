// sections/TitleDescriptionEditor/src/types.ts
//
// Minimal type definitions for TitleDescriptionEditor.
//
// TitleDescriptionModel is intentionally re-declared here (not imported from
// @shared/messages) so the TitleDescriptionEditor section remains portable
// across plugins. The shape matches TitleDescriptionSection in the
// welder-editor message-bus contract v0.1.0 — any deviation is a type error
// at the call site.
//
// Owner: ui-engineer.

/** Figma node-id string (stable within a Figma session). */
export type NodeId = string;

/**
 * Editable fields of a CopyWrap — heading + optional paragraph.
 * Shape mirrors plugins/welder-editor/shared/messages.ts TitleDescriptionSection,
 * minus headingDim (read-only in v0.1.0, deferred to ADR-0008 epic).
 */
export interface TitleDescriptionModel {
  /** Figma node-id of the CopyWrap INSTANCE. */
  copyWrapId: NodeId;
  /** Current heading characters. Required; never empty after a valid load. */
  heading: string;
  /**
   * Paragraph characters.
   * - string — paragraph text node is present on the CopyWrap.
   * - null  — CopyWrap has no Paragraph text node; paragraph field is hidden.
   */
  paragraph: string | null;
}
