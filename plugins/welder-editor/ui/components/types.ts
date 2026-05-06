// plugins/welder-editor/ui/components/types.ts
//
// Consolidated component-local type declarations.
//
// These types were previously per-section local declarations (sections/*/src/types.ts).
// They are re-declared here (not imported from @shared/messages) so each component
// remains self-contained and testable in isolation. The shapes match the
// welder-editor message-bus contract v0.1.0. Any structural deviation is a type
// error at the App.vue call site.
//
// Owner: figma-api-engineer.
// ADR-0015: sections/* collapsed into plugins/welder-editor/ui/components/.

/** Figma node-id string (stable within a Figma session). */
export type NodeId = string;

/** Figma image hash — references an image registered with figma.createImage(). */
export type ImageHash = string;

// ---------------------------------------------------------------------------
// TitleDescriptionEditor types
// ---------------------------------------------------------------------------

/**
 * Editable fields of a CopyWrap — heading + optional paragraph.
 * Shape mirrors plugins/welder-editor/shared/messages.ts TitleDescriptionSection.
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

// ---------------------------------------------------------------------------
// BadgeEditor types
// ---------------------------------------------------------------------------

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
   * Passed to the icon-picker slot.
   */
  icon: string;
}

// ---------------------------------------------------------------------------
// ImageEditor types
// ---------------------------------------------------------------------------

/**
 * Figma 2×3 affine transform matrix:
 *   [[a, b, tx], [c, d, ty]]
 */
export type Transform = [[number, number, number], [number, number, number]];

/**
 * Editable state for a single ImageWrap fill slot.
 * Shape mirrors plugins/welder-editor/shared/messages.ts ImageSection.
 */
export interface ImageModel {
  /** Figma node-id of the ImageWrap INSTANCE. */
  imageWrapId: NodeId;
  /**
   * Figma ImagePaint hash for the current fill.
   * - string — fill is present.
   * - null  — ImageWrap still has a placeholder fill.
   */
  imageHash: ImageHash | null;
  /** Crop transform applied to the fill. */
  cropTransform?: Transform;
}

// ---------------------------------------------------------------------------
// SlidePicker types
// ---------------------------------------------------------------------------

/**
 * Summary of a single Welder Slide instance on the current page.
 * Shape mirrors plugins/welder-editor/shared/messages.ts SlideSummary.
 */
export interface SlideSummary {
  /** Figma node-id of the Slide INSTANCE. */
  id: NodeId;
  /** 1-based sort index in page order. */
  number: number;
  /** Display name. */
  name: string;
  /**
   * Whether this slide is skipped in Figma Slides presentation mode.
   *   - true/false — Slides editor.
   *   - null — Figma Design editor.
   */
  isSkipped: boolean | null;
}

// ---------------------------------------------------------------------------
// CardList / CardEditor types
// ---------------------------------------------------------------------------

/**
 * A single card within a CardWrap.
 * Shape mirrors plugins/welder-editor/shared/messages.ts CardItem.
 */
export interface CardItem {
  /** Figma node-id of the Card INSTANCE. */
  cardNodeId: NodeId;
  heading: string;
  paragraph: string;
  /**
   * Lucide icon key. null = icon absent.
   */
  icon: string | null;
  /**
   * ImagePaint hash for the card's visual slot.
   * - string — has image fill.
   * - null — placeholder fill.
   * - undefined — card has no visual slot.
   */
  visualHash: ImageHash | null | undefined;
}

/**
 * Top-level content-tab data for a slide.
 * Shape mirrors plugins/welder-editor/shared/messages.ts ContentItems.
 */
export interface ContentItems {
  cardWrapId: NodeId;
  cards: CardItem[];
  timelineItems: TimelineItem[];
}

// ---------------------------------------------------------------------------
// TimelineEditor types
// ---------------------------------------------------------------------------

/**
 * A single editable item within a TimelineWrap.
 * Shape mirrors plugins/welder-editor/shared/messages.ts TimelineItem.
 */
export interface TimelineItem {
  /** Figma node-id of the CopyWrap INSTANCE within TimelineWrap. */
  copyWrapNodeId: NodeId;
  heading: string;
  paragraph: string;
}

// ---------------------------------------------------------------------------
// TableEditor types
// ---------------------------------------------------------------------------

export interface TableCellModel {
  cellNodeId: string;
  value: string;
}

export interface TableRowModel {
  rowNodeId: string;
  cells: TableCellModel[];
}

export interface TableWrapModel {
  slotId: string;
  width: 'sm' | 'md' | 'lg';
  hasColumnHeader: boolean;
  textSize: 'sm' | 'md' | 'lg';
  rows: TableRowModel[];
}

// ---------------------------------------------------------------------------
// JourneyEditor types
// ---------------------------------------------------------------------------

export interface JourneyColumnModel {
  header: string;
  subheader: string;
}

export interface JourneyItemModel {
  itemNodeId: NodeId;
  icon: string;
  label: string;
  startPct: number;
  endPct: number;
}

export interface JourneyWrapModel {
  slotId: NodeId;
  columns: JourneyColumnModel[];
  items: JourneyItemModel[];
}
