// sections/TimelineEditor/src/types.ts
//
// Local type declarations for TimelineEditor.
//
// TimelineItem is intentionally re-declared here (not imported from
// @shared/messages) so the TimelineEditor section remains portable across
// plugins. The shape mirrors plugins/welder-editor/shared/messages.ts
// TimelineItem v0.1.0 — any structural deviation is a type error at the
// call site in the consuming plugin.
//
// Owner: ui-engineer.

/** Figma node-id string (stable within a Figma session). */
export type NodeId = string;

/**
 * A single editable item within a TimelineWrap.
 * Shape mirrors plugins/welder-editor/shared/messages.ts TimelineItem.
 *
 * Timeline items have only heading + paragraph — no icon slot, no visual slot.
 * (CardItem has those; TimelineItem is a simpler CopyWrap-backed entry.)
 */
export interface TimelineItem {
  /** Figma node-id of the CopyWrap INSTANCE within TimelineWrap. */
  copyWrapNodeId: NodeId;
  /** Timeline step heading. */
  heading: string;
  /** Timeline step paragraph; empty string when Paragraph text node is absent. */
  paragraph: string;
}
