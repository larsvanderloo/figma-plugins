export interface CardItem {
  cardNodeId: string;
  heading: string;
  paragraph: string;
  /** Lucide slug of the card's direct icon-instance child; null = instance absent or hidden (UI hides the icon picker). */
  icon: string | null;
  /**
   * Last user-picked slug, persisted via plugin data — survives library republishes, which reset
   * icon-slot child overrides. Non-null and different from `icon` = stale slot the iframe re-applies; null = never picked.
   */
  iconIntended: string | null;
  /** ImagePaint hash; null = image slot present but empty, undefined = no slot (UI hides the visual editor). */
  visualHash: string | null | undefined;
  /** null = instance exposes no `Style` variant (some CardWrap layouts flatten Cards in without it); UI hides the toggle. */
  style: 'Default' | 'Outline' | null;
}

/**
 * TimelineWrap children are CopyWrap instances (not Cards): heading + paragraph only,
 * no icon swap or visual slot. Decorative `Stepper Item` children are skipped by the scan.
 */
export interface TimelineItem {
  copyWrapNodeId: string;
  heading: string;
  /** Empty string when the Paragraph text node is missing. */
  paragraph: string;
}

/**
 * Photo + name come from the designer-managed `Instructor` variant of the component set;
 * the plugin only switches the variant and edits the list-item texts.
 */
export interface InstructorCardItem {
  cardNodeId: string;
  instructor: string;
  /** Empty when the component set is unreachable; UI disables the picker. */
  instructorOptions: string[];
  items: string[];
  /** Hidden cards stay in the scan so the visibility toggle can restore them. */
  visible: boolean;
}

export interface ContentItems {
  cardWrapId: string;
  cards: CardItem[];
  instructorCards: InstructorCardItem[];
  /** Timeline-only slides have empty `cards` and non-empty `timelineItems`. */
  timelineItems: TimelineItem[];
}
