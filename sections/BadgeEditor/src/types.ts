// sections/BadgeEditor/src/types.ts
//
// Minimal type definitions for BadgeEditor.
//
// BadgeModel is intentionally re-declared here (not imported from
// @shared/messages) so the BadgeEditor section remains portable across
// plugins. The shape mirrors BadgeSection in the welder-editor message-bus
// contract v0.1.0 — any deviation is a type error at the call site.
//
// Owner: ui-engineer.

/** Figma node-id string (stable within a Figma session). */
export type NodeId = string;

/**
 * Model for a single Badge instance on a Welder slide.
 * Shape mirrors plugins/welder-editor/shared/messages.ts BadgeSection.
 */
export interface BadgeModel {
  /** Figma node-id of the Badge INSTANCE. */
  badgeNodeId: NodeId;
  /** Badge label characters. */
  label: string;
  /**
   * Lucide icon key, e.g. 'sparkles', 'arrow-right'.
   * Passed to the icon-picker slot; BadgeEditor does not validate Lucide key
   * correctness — that is the icon picker's responsibility.
   */
  icon: string;
}
