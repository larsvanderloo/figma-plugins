// sections/JourneyEditor/src/types.ts
//
// Local type declarations for JourneyEditor.
//
// JourneyItemModel and JourneyColumnModel are intentionally re-declared here
// (not imported from @shared/messages) so the JourneyEditor section remains
// portable across plugins. The shapes mirror
// plugins/welder-editor/shared/messages.ts JourneyItemModel / JourneyColumnModel
// / JourneyWrapModel v0.1.0 — any structural deviation is a type error at the
// call site in the consuming plugin.
//
// Owner: ui-engineer.
// Resolves: MON-2893983016 (Sprint 4, Task 4.2).

/** Figma node-id string (stable within a Figma session). */
export type NodeId = string;

/**
 * A single column header above the journey pills.
 * Shape mirrors plugins/welder-editor/shared/messages.ts JourneyColumnModel.
 */
export interface JourneyColumnModel {
  /** Top line — large, theme-color, centered. */
  header: string;
  /** Middle line — small, theme-color, centered. */
  subheader: string;
}

/**
 * A single pill item within a JourneyWrap.
 * Shape mirrors plugins/welder-editor/shared/messages.ts JourneyItemModel.
 */
export interface JourneyItemModel {
  /** Figma node-id; empty string for new items. */
  itemNodeId: NodeId;
  /** Lucide icon name. */
  icon: string;
  /** Pill label text. */
  label: string;
  /** Start position as percentage 0–95. */
  startPct: number;
  /** End position as percentage; >= startPct + minimum span, <= 100. */
  endPct: number;
}

/**
 * Top-level model for an editable JourneyWrap instance.
 * Shape mirrors plugins/welder-editor/shared/messages.ts JourneyWrapModel.
 */
export interface JourneyWrapModel {
  /** Figma SlotNode ID within the JourneyWrap INSTANCE. */
  slotId: NodeId;
  /** Column headers (typically 4–7 columns). */
  columns: JourneyColumnModel[];
  /** Journey pill items (0..JOURNEY_MAX_ITEMS). */
  items: JourneyItemModel[];
}
