// sections/CardList/src/types.ts
//
// Local type declarations for CardList.
//
// CardItem and ContentItems are intentionally re-declared here (not imported
// from @shared/messages) so the CardList section remains portable across
// plugins. The shapes mirror CardItem and ContentItems in the welder-editor
// message-bus contract v0.1.0 — any structural deviation is a type error at
// the call site in the consuming plugin.
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
   * - string — icon present and visible.
   * - null — icon absent or visible=false; icon thumbnail is hidden.
   */
  icon: string | null;
  /**
   * ImagePaint hash for the card's visual slot.
   * - string — slot present, has an image fill.
   * - null — slot present, still a placeholder.
   * - undefined — card has no visual slot.
   */
  visualHash: ImageHash | null | undefined;
}

/**
 * Top-level content-tab data for a slide, scoped to what CardList needs.
 * Shape mirrors plugins/welder-editor/shared/messages.ts ContentItems.
 */
export interface ContentItems {
  /** Figma node-id of the CardWrap INSTANCE. Empty string when no CardWrap. */
  cardWrapId: NodeId;
  /** Cards within the CardWrap. Empty array when no CardWrap or no cards. */
  cards: CardItem[];
}
