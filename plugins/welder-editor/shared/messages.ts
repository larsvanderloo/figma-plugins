// Welder Editor — message-bus contract v0.1.0
//
// The single source of truth for what crosses between code/ and ui/.
// Owned by figma-api-engineer. Modifying this file requires an ADR or a
// MESSAGE_BUS_VERSION bump (with migration tests).
//
// Every message has:
//   - type: discriminator
//   - version: MESSAGE_BUS_VERSION at time of send (validated on receive)
//   - payload: typed per message
//   - correlationId (for request-response messages): UUID-v4 string
//
// Conventions:
//   - Request messages (ui → code): named by operation (e.g. 'slide-load:request')
//   - Result messages (code → ui): operation + ':result' (e.g. 'slide-load:result')
//   - Progress messages (code → ui): operation + ':progress' (correlationId-tagged)
//   - Fire-and-forget messages: no correlationId required
//
// Source data models ported from:
//   welder-slide-editor/widget-src/types.ts (external build v0.2.1)
//   welder-slide-editor/spec.md §3 (data models)
//
// ChartWrap is intentionally absent — see ADR-0007.

export const MESSAGE_BUS_VERSION = 1 as const;

// ---------------------------------------------------------------------------
// Shared scalar types
// ---------------------------------------------------------------------------

/** Figma node-id string (stable within a Figma session). */
export type NodeId = string;

/** UUID-v4 string for request-response correlation. */
export type CorrelationId = string;

/**
 * Figma editor type values returned by figma.editorType.
 * Only 'figma' and 'slides' are enabled for this plugin (ADR-0002).
 * 'figjam', 'dev', and 'buzz' are passed through for completeness;
 * code/main.ts should branch or close-plugin on unsupported types.
 */
export type EditorType = 'figma' | 'slides' | 'figjam' | 'dev' | 'buzz';

/** Figma image hash — references an image registered with figma.createImage(). */
export type ImageHash = string;

/** Tab discriminator. */
export type TabId = 'general' | 'content' | 'graphs';

// ---------------------------------------------------------------------------
// Slide list model
// ---------------------------------------------------------------------------

/**
 * Summary of a single Welder Slide instance on the current page.
 * Ported from welder-slide-editor/widget-src/types.ts SlideSummary.
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
   *   - true/false — Slides editor; derived from SlideNode.isSkippedSlide.
   *   - null — Figma Design editor; SlideNode parent not available.
   */
  isSkipped: boolean | null;
}

// ---------------------------------------------------------------------------
// General tab data models
// ---------------------------------------------------------------------------

/**
 * CopyWrap — heading + optional paragraph text fields.
 * Ported from welder-slide-editor/widget-src/types.ts TitleDescriptionSection.
 */
export interface TitleDescriptionSection {
  /** Figma node-id of the CopyWrap INSTANCE. */
  copyWrapId: NodeId;
  /** Current heading characters. */
  heading: string;
  /** Paragraph characters; null when CopyWrap has no Paragraph text node. */
  paragraph: string | null;
  /**
   * Accent dim-ranges on the heading (Text Dimmer variable).
   * - Array<[start, end]> — sorted, non-overlapping ranges. Empty array = no accent.
   * - null — library variables unreachable (free plan or library unlinked). UI hides accent controls.
   *
   * NOTE: accent-range editing is deferred to a backlog epic (ADR-0008).
   * This field is read-only in v0.1.0 — the plugin reads and reports existing dim ranges
   * but does not expose editing controls for them.
   */
  headingDim: Array<[number, number]> | null;
}

/** Badge — label text + icon variant. */
export interface BadgeSection {
  /** Figma node-id of the Badge INSTANCE. */
  badgeNodeId: NodeId;
  /** Badge label characters. */
  label: string;
  /** Lucide icon key (e.g. 'sparkles', 'arrow-right'). */
  icon: string;
}

/** ImageWrap — image fill slot. */
export interface ImageSection {
  /** Figma node-id of the ImageWrap INSTANCE. */
  imageWrapId: NodeId;
  /** Figma ImagePaint hash; null when still a placeholder fill. */
  imageHash: ImageHash | null;
  /**
   * Crop transform — v0.2.0+ only. Undefined in v0.1.0.
   * Inline tuple matches Figma Transform = [[a,b,tx],[c,d,ty]].
   */
  cropTransform?: [[number, number, number], [number, number, number]];
}

/** All general-tab sub-sections for a slide. Null fields = wrapper absent on slide. */
export interface GeneralSections {
  titleDescription: TitleDescriptionSection | null;
  badge: BadgeSection | null;
  image: ImageSection | null;
}

// ---------------------------------------------------------------------------
// Content tab data models
// ---------------------------------------------------------------------------

/**
 * A single card within a CardWrap.
 * Ported from welder-slide-editor/widget-src/types.ts CardItem.
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
   * - null — icon absent or visible=false; icon picker is hidden in ui.
   */
  icon: string | null;
  /**
   * ImagePaint hash for the card's visual slot.
   * - string — slot present, has an image fill.
   * - null — slot present, still a placeholder.
   * - undefined — card has no visual slot; visual editor does not render.
   */
  visualHash: ImageHash | null | undefined;
}

/**
 * A single editable item within a TimelineWrap.
 * Ported from welder-slide-editor/widget-src/types.ts TimelineItem.
 */
export interface TimelineItem {
  /** Figma node-id of the CopyWrap INSTANCE within TimelineWrap. */
  copyWrapNodeId: NodeId;
  /** Timeline step heading. */
  heading: string;
  /** Timeline step paragraph; empty string when Paragraph text node is absent. */
  paragraph: string;
}

/** All content-tab data for a slide. */
export interface ContentItems {
  /** Figma node-id of the CardWrap INSTANCE. Empty string when no CardWrap. */
  cardWrapId: NodeId;
  /** Cards within the CardWrap. Empty array when no CardWrap or no cards. */
  cards: CardItem[];
  /** Timeline items from TimelineWrap. Empty array when no TimelineWrap. */
  timelineItems: TimelineItem[];
  /**
   * Journey model. Null when no JourneyWrap on this slide.
   * NOTE: JourneyWrap is in ContentItems because the journey renderer lives
   * on the Graphs tab but the items are conceptually content — this matches
   * the ui tab layout where journey appears under Graphs but is loaded with
   * content data.
   */
  journeyModel: JourneyWrapModel | null;
}

// ---------------------------------------------------------------------------
// Graphs tab data models — Table
// ---------------------------------------------------------------------------

/**
 * A single cell within a table row.
 * Ported from welder-slide-editor/widget-src/types.ts TableCellModel.
 */
export interface TableCellModel {
  /** FRAME node-id of the cell within the row; empty string for new cells. */
  cellNodeId: NodeId;
  /** Cell text content. */
  value: string;
}

/**
 * A single row within a table.
 * Ported from welder-slide-editor/widget-src/types.ts TableRowModel.
 */
export interface TableRowModel {
  /** FRAME node-id of the row within the SlotNode; empty string for new rows. */
  rowNodeId: NodeId;
  cells: TableCellModel[];
}

/**
 * Top-level model for an editable TableWrap instance (v0.2.0+ Slot-based).
 * Ported from welder-slide-editor/widget-src/types.ts TableWrapModel.
 */
export interface TableWrapModel {
  /** Figma SlotNode ID within the TableWrap INSTANCE. */
  slotId: NodeId;
  /** Column width preset. */
  width: 'sm' | 'md' | 'lg';
  /**
   * Whether row 0 is treated as a column header.
   * When true: HUG-vertical, centered text, dimmer color, divider below.
   */
  hasColumnHeader: boolean;
  /**
   * Text size multiplier on row height formula.
   * sm=0.75×, md=1.0× (default), lg=1.25×.
   */
  textSize: 'sm' | 'md' | 'lg';
  rows: TableRowModel[];
}

// ---------------------------------------------------------------------------
// Graphs tab data models — Journey
// ---------------------------------------------------------------------------

/**
 * A single pill item within a JourneyWrap.
 * Ported from welder-slide-editor/widget-src/types.ts JourneyItemModel.
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
 * A single column header above the journey pills.
 * Ported from welder-slide-editor/widget-src/types.ts JourneyColumnModel.
 */
export interface JourneyColumnModel {
  /** Top line — large, theme-color, centered. */
  header: string;
  /** Middle line — small, theme-color, centered. */
  subheader: string;
}

/**
 * Top-level model for an editable JourneyWrap instance.
 * Ported from welder-slide-editor/widget-src/types.ts JourneyWrapModel.
 */
export interface JourneyWrapModel {
  /** Figma SlotNode ID within the JourneyWrap INSTANCE. */
  slotId: NodeId;
  /** Column headers (typically 4–7 columns). */
  columns: JourneyColumnModel[];
  /** Journey pill items (0..JOURNEY_MAX_ITEMS). */
  items: JourneyItemModel[];
}

// ---------------------------------------------------------------------------
// Graphs tab — aggregate
// ---------------------------------------------------------------------------

/** GraphItems carries the table and/or journey model for a slide. */
export interface GraphItems {
  /** TableWrap model; null when slide has no TableWrap. */
  tableModel: TableWrapModel | null;
  /** JourneyWrap model; null when slide has no JourneyWrap. */
  journeyModel: JourneyWrapModel | null;
}

// ---------------------------------------------------------------------------
// Result envelope
// ---------------------------------------------------------------------------

/** Typed result envelope for all request-response operations. */
export type Result<T, E = WelderError> = { ok: true; data: T } | { ok: false; error: E };

/** Discriminated error type for all welder-editor operations. */
export interface WelderError {
  code: WelderErrorCode;
  message: string;
}

export type WelderErrorCode =
  | 'NOT_FOUND'            // target node no longer exists on canvas
  | 'INVALID_INPUT'        // payload failed Zod validation at code-side boundary
  | 'LIBRARY_VAR_MISSING'  // importVariableByKeyAsync failed (free plan / library unlinked)
  | 'NODE_TYPE_MISMATCH'   // found node is not the expected type
  | 'MUTATION_FAILED'      // figma.* call threw (read-only file, collaborative conflict)
  | 'TIMEOUT'              // withTimeout guard expired
  | 'UNEXPECTED';          // unhandled exception caught by top-level handler

// ---------------------------------------------------------------------------
// Message union
// ---------------------------------------------------------------------------

export type Message =
  // ------------------------------------------------------------------
  // Fire-and-forget: code → ui
  // ------------------------------------------------------------------

  /**
   * Sent once at plugin open. Carries the initial slide list and the
   * pre-selected slide (from canvas selection, if any).
   */
  | {
      type: 'init';
      version: typeof MESSAGE_BUS_VERSION;
      payload: {
        slides: SlideSummary[];
        initialSlideId: NodeId | null;
        editorType: EditorType;
      };
    }

  /**
   * Sent when figma.on('selectionchange') fires.
   * ui should trigger a slide-load:request if the new selection contains a
   * known slide ID.
   */
  | {
      type: 'selection-changed';
      version: typeof MESSAGE_BUS_VERSION;
      payload: {
        selectedNodeIds: NodeId[];
      };
    }

  /**
   * Sent when figma.on('currentpagechange') fires.
   * ui refreshes the slide picker dropdown.
   */
  | {
      type: 'page-changed';
      version: typeof MESSAGE_BUS_VERSION;
      payload: {
        slides: SlideSummary[];
      };
    }

  /**
   * Progress notification for long-running operations (table/journey render).
   * correlationId ties this to the originating request.
   */
  | {
      type: 'progress';
      version: typeof MESSAGE_BUS_VERSION;
      payload: {
        /** 0.0–1.0 completion ratio. */
        ratio: number;
        /** Human-readable status, e.g. "Rendering row 3 of 10". */
        label?: string;
      };
      correlationId: CorrelationId;
    }

  /**
   * Unhandled exception from the code-side top-level handler.
   * ui shows a generic "Something went wrong" toast.
   */
  | {
      type: 'error';
      version: typeof MESSAGE_BUS_VERSION;
      payload: {
        message: string;
        code: WelderErrorCode;
      };
    }

  // ------------------------------------------------------------------
  // Fire-and-forget: ui → code
  // ------------------------------------------------------------------

  /**
   * User or the ui closes the plugin.
   */
  | {
      type: 'close';
      version: typeof MESSAGE_BUS_VERSION;
    }

  // ------------------------------------------------------------------
  // Request-response: ui → code (requests)
  // ------------------------------------------------------------------

  /**
   * Request a fresh slide list scan.
   * Typically sent on plugin open and after page-changed.
   */
  | {
      type: 'slide-list:request';
      version: typeof MESSAGE_BUS_VERSION;
      payload: Record<string, never>;
      correlationId: CorrelationId;
    }

  /**
   * Request full wrapper data for a specific slide.
   * Sent when user picks a slide or when selection-changed matches a slide.
   */
  | {
      type: 'slide-load:request';
      version: typeof MESSAGE_BUS_VERSION;
      payload: {
        slideId: NodeId;
      };
      correlationId: CorrelationId;
    }

  /**
   * Apply title and/or description to a CopyWrap.
   * Debounced 200 ms in TitleDescriptionEditor.
   */
  | {
      type: 'apply-title-description';
      version: typeof MESSAGE_BUS_VERSION;
      payload: {
        copyWrapId: NodeId;
        heading?: string;
        paragraph?: string;
      };
      correlationId: CorrelationId;
    }

  /**
   * Apply label and/or icon to a Badge.
   */
  | {
      type: 'apply-badge';
      version: typeof MESSAGE_BUS_VERSION;
      payload: {
        badgeNodeId: NodeId;
        label?: string;
        /** Lucide icon key. Triggers setProperties INSTANCE_SWAP on the icon child. */
        icon?: string;
      };
      correlationId: CorrelationId;
    }

  /**
   * Apply an uploaded image to an ImageWrap.
   * bytes is the raw image data (PNG/JPG) as a Uint8Array.
   */
  | {
      type: 'apply-image';
      version: typeof MESSAGE_BUS_VERSION;
      payload: {
        imageWrapId: NodeId;
        bytes: Uint8Array;
      };
      correlationId: CorrelationId;
    }

  /**
   * Apply edits to a single card within a CardWrap.
   * Debounced 200 ms in CardItemEditor.
   */
  | {
      type: 'apply-card';
      version: typeof MESSAGE_BUS_VERSION;
      payload: {
        cardNodeId: NodeId;
        heading?: string;
        paragraph?: string;
        /** Lucide icon key. Triggers setProperties INSTANCE_SWAP on the icon child. */
        icon?: string;
      };
      correlationId: CorrelationId;
    }

  /**
   * Apply edits to a single timeline item within a TimelineWrap.
   * Debounced 200 ms in TimelineItemEditor.
   */
  | {
      type: 'apply-timeline';
      version: typeof MESSAGE_BUS_VERSION;
      payload: {
        copyWrapNodeId: NodeId;
        heading?: string;
        paragraph?: string;
      };
      correlationId: CorrelationId;
    }

  /**
   * Full-state PUT for a TableWrap (Slot-based).
   * Code side diffs against existing slot contents and re-renders.
   */
  | {
      type: 'apply-table';
      version: typeof MESSAGE_BUS_VERSION;
      payload: {
        slotId: NodeId;
        desired: TableWrapModel;
      };
      correlationId: CorrelationId;
    }

  /**
   * Full-state PUT for a JourneyWrap (Slot-based).
   */
  | {
      type: 'apply-journey';
      version: typeof MESSAGE_BUS_VERSION;
      payload: {
        slotId: NodeId;
        desired: JourneyWrapModel;
      };
      correlationId: CorrelationId;
    }

  /**
   * Request existing image bytes for preview in ImageEditor.
   * Code side calls figma.getImageByHash and returns raw bytes.
   */
  | {
      type: 'image-upload:request';
      version: typeof MESSAGE_BUS_VERSION;
      payload: {
        imageWrapId: NodeId;
      };
      correlationId: CorrelationId;
    }

  /**
   * Get a value from figma.clientStorage.
   */
  | {
      type: 'persisted-state:get';
      version: typeof MESSAGE_BUS_VERSION;
      payload: {
        key: string;
      };
      correlationId: CorrelationId;
    }

  /**
   * Set a value in figma.clientStorage.
   */
  | {
      type: 'persisted-state:set';
      version: typeof MESSAGE_BUS_VERSION;
      payload: {
        key: string;
        value: unknown;
      };
      correlationId: CorrelationId;
    }

  // ------------------------------------------------------------------
  // Request-response: code → ui (results)
  // ------------------------------------------------------------------

  | {
      type: 'slide-list:result';
      version: typeof MESSAGE_BUS_VERSION;
      payload: Result<{ slides: SlideSummary[] }>;
      correlationId: CorrelationId;
    }

  | {
      type: 'slide-load:result';
      version: typeof MESSAGE_BUS_VERSION;
      payload: Result<{
        slideId: NodeId;
        general: GeneralSections | null;
        content: ContentItems | null;
        graphs: GraphItems | null;
      }>;
      correlationId: CorrelationId;
    }

  | {
      type: 'apply-title-description:result';
      version: typeof MESSAGE_BUS_VERSION;
      payload: Result<{ copyWrapId: NodeId }>;
      correlationId: CorrelationId;
    }

  | {
      type: 'apply-badge:result';
      version: typeof MESSAGE_BUS_VERSION;
      payload: Result<{ badgeNodeId: NodeId }>;
      correlationId: CorrelationId;
    }

  | {
      type: 'apply-image:result';
      version: typeof MESSAGE_BUS_VERSION;
      payload: Result<{ imageWrapId: NodeId; imageHash: ImageHash }>;
      correlationId: CorrelationId;
    }

  | {
      type: 'apply-card:result';
      version: typeof MESSAGE_BUS_VERSION;
      payload: Result<{ cardNodeId: NodeId }>;
      correlationId: CorrelationId;
    }

  | {
      type: 'apply-timeline:result';
      version: typeof MESSAGE_BUS_VERSION;
      payload: Result<{ copyWrapNodeId: NodeId }>;
      correlationId: CorrelationId;
    }

  | {
      type: 'apply-table:result';
      version: typeof MESSAGE_BUS_VERSION;
      payload: Result<{ slotId: NodeId }>;
      correlationId: CorrelationId;
    }

  | {
      type: 'apply-journey:result';
      version: typeof MESSAGE_BUS_VERSION;
      payload: Result<{ slotId: NodeId }>;
      correlationId: CorrelationId;
    }

  | {
      type: 'image-upload:result';
      version: typeof MESSAGE_BUS_VERSION;
      payload: Result<{
        imageWrapId: NodeId;
        /** Raw PNG/JPG bytes of the current image fill. */
        bytes: Uint8Array;
        /** Width of the image slot in Figma pixels. 0 if unknown. */
        fillW: number;
        /** Height of the image slot in Figma pixels. 0 if unknown. */
        fillH: number;
      }>;
      correlationId: CorrelationId;
    }

  | {
      type: 'persisted-state:get:result';
      version: typeof MESSAGE_BUS_VERSION;
      payload: Result<{ key: string; value: unknown }>;
      correlationId: CorrelationId;
    }

  | {
      type: 'persisted-state:set:result';
      version: typeof MESSAGE_BUS_VERSION;
      payload: Result<{ key: string }>;
      correlationId: CorrelationId;
    };

// ---------------------------------------------------------------------------
// Type helpers for consumers
// ---------------------------------------------------------------------------

/** Extract the payload type of a message by its type discriminator. */
export type MessagePayload<T extends Message['type']> = Extract<Message, { type: T }> extends {
  payload: infer P;
}
  ? P
  : never;

/** All message type discriminator strings. */
export type MessageType = Message['type'];

/** Subset of messages that are requests (carry a correlationId and flow ui → code). */
export type RequestMessage = Extract<
  Message,
  {
    correlationId: CorrelationId;
    type:
      | 'slide-list:request'
      | 'slide-load:request'
      | 'apply-title-description'
      | 'apply-badge'
      | 'apply-image'
      | 'apply-card'
      | 'apply-timeline'
      | 'apply-table'
      | 'apply-journey'
      | 'image-upload:request'
      | 'persisted-state:get'
      | 'persisted-state:set';
  }
>;

/** Subset of messages that are results (carry a correlationId and flow code → ui). */
export type ResultMessage = Extract<
  Message,
  {
    correlationId: CorrelationId;
    type:
      | 'slide-list:result'
      | 'slide-load:result'
      | 'apply-title-description:result'
      | 'apply-badge:result'
      | 'apply-image:result'
      | 'apply-card:result'
      | 'apply-timeline:result'
      | 'apply-table:result'
      | 'apply-journey:result'
      | 'image-upload:result'
      | 'persisted-state:get:result'
      | 'persisted-state:set:result';
  }
>;
