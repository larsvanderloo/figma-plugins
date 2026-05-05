// sections/CardEditor/src/types.ts
//
// Local type declarations for CardEditor.
//
// CardItem is intentionally re-declared here (not imported from @shared/messages)
// so the CardEditor section remains portable across plugins. The shape mirrors
// plugins/welder-editor/shared/messages.ts CardItem v0.1.0 — any structural
// deviation is a type error at the call site in the consuming plugin.
//
// Owner: ui-engineer.

/** Figma node-id string (stable within a Figma session). */
export type NodeId = string;

/** Figma image hash — references an image registered with figma.createImage(). */
export type ImageHash = string;

/**
 * A single card within a CardWrap.
 * Shape mirrors plugins/welder-editor/shared/messages.ts CardItem.
 */
export interface CardItem {
  /** Figma node-id of the Card INSTANCE. */
  cardNodeId: NodeId;
  /** Card heading characters. */
  heading: string;
  /** Card paragraph characters. */
  paragraph: string;
  /**
   * Lucide icon key for the card's icon INSTANCE child.
   * - string — icon present and visible; IconPicker is shown.
   * - null — icon absent or visible=false; IconPicker is hidden.
   */
  icon: string | null;
  /**
   * ImagePaint hash for the card's visual slot.
   * - string — slot present, has an image fill.
   * - null — slot present, still a placeholder.
   * - undefined — card has no visual slot; ImageEditor does not render.
   */
  visualHash: ImageHash | null | undefined;
}
