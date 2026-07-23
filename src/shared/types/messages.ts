import type { TitleDescriptionPayload, BadgePayload, GeneralSections } from './general';
import type { ContentItems } from './content';
import type { GraphItems } from './graphs';
import type { TableWrapModel } from './table';
import type { ChartWrapModel } from './chart';
import type { SlideSummary, PluginRuntimeInfo } from './runtime';

/** UI iframe → main thread via `parent.postMessage({ pluginMessage })`; received in `figma.ui.onmessage`. */
export type UIToPluginMessage =
  | { type: 'ui-ready' }
  | {
      type: 'update-general';
      slideId: string;
      section: 'titleDescription';
      payload: TitleDescriptionPayload;
    }
  | {
      type: 'update-general';
      slideId: string;
      section: 'badge';
      payload: BadgePayload;
    }
  | {
      /**
       * Mutates only fills on the heading via the Text Dimmer variable; characters stay
       * untouched (text edits go through `update-general`). Heading-only by design —
       * paragraph accent is permanently out of scope, hence no `field` discriminator.
       */
      type: 'update-accent';
      slideId: string;
      /** UI correlation id so high-frequency accent edits only ack themselves. */
      requestId?: string;
      /** Canonical ranges (see `TitleDescriptionSection.headingDim`). */
      dimRanges: Array<[number, number]>;
    }
  | {
      type: 'update-card';
      slideId: string;
      cardNodeId: string;
      payload: Partial<{
        heading: string;
        paragraph: string;
        icon: string;
        /**
         * Full SVG generated iframe-side from the bundled Lucide map, so the sandbox can
         * swap the icon via `figma.createNodeFromSvg` — no INSTANCE_SWAP or library import.
         */
        iconSvg: string;
        visualHash: string;
        /** `Default` = filled card; `Outline` = bordered card. */
        style: 'Default' | 'Outline';
      }>;
    }
  | {
      /**
       * `instructor` switches the Instructor VARIANT (photo + name follow it). `items`
       * is the full list in document order; the sandbox skips unchanged texts per index.
       */
      type: 'update-instructor-card';
      slideId: string;
      cardNodeId: string;
      payload: Partial<{
        instructor: string;
        items: string[];
        /** Hidden cards collapse out of the CardWrap auto-layout. */
        visible: boolean;
      }>;
    }
  | {
      type: 'update-timeline-item';
      slideId: string;
      copyWrapNodeId: string;
      payload: Partial<{
        heading: string;
        paragraph: string;
      }>;
    }
  | {
      /** Full-state PUT: `desired` is the complete table model (all rows + cells), not a patch. */
      type: 'update-table';
      slideId: string;
      slotId: string;
      desired: TableWrapModel;
      /**
       * true → skip the in-place fast path and render full, so font-fit/column-autofit/
       * padding reconcile with the edits the fast path skipped. Sent once after ~1s of
       * typing idle; no new undo step (merges with the edit).
       */
      settle?: boolean;
    }
  | {
      /** Full-state PUT: `desired` is the complete chart model, not a patch. */
      type: 'update-chart';
      slideId: string;
      slotId: string;
      desired: ChartWrapModel;
    }
  | {
      /** CSV contract: row 0 = header row with series names, column 0 = category labels. */
      type: 'import-chart-csv';
      slideId: string;
      slotId: string;
      csv: string;
    }
  | {
      /** Sandbox truncates at TABLE_MAX_ROWS / TABLE_MAX_COLS (flat max). */
      type: 'import-csv';
      slideId: string;
      slotId: string;
      csv: string;
    }
  | {
      type: 'upload-image';
      targetNodeId: string;
      bytes: Uint8Array;
    }
  | {
      /**
       * Applies to every Card on the slide in one pass: icon-slot resize, Heading text
       * style, and the mode switch on the collection owning the CardWrap's `itemSpacing`
       * binding (so the gap follows). One sandbox walk + one commitUndo for all three.
       */
      type: 'set-card-size';
      slideId: string;
      iconSize: number;
      headingStyleName: 'Heading4' | 'Heading4-sm' | 'Heading4-xs';
      /** Mode name on the spacing variable's collection (e.g. "5", "6"). */
      gapModeName: string;
      /** When false, the icon node inside each card's icon-slot is hidden. */
      iconVisible: boolean;
    }
  | {
      type: 'set-slide-skipped';
      slideId: string;
      /** UI correlation id so rapid skip toggles can ignore stale acks. */
      requestId?: string;
      skipped: boolean;
    }
  | {
      type: 'set-slide-confidential';
      slideId: string;
      /** UI correlation id so rapid toggles can ignore stale acks. */
      requestId?: string;
      /** New value for the Slide's "Show Confidental" boolean property. */
      show: boolean;
      /**
       * When set, also switches the nested ConfidentalBadge's `Variant` (e.g.
       * 'Vertrouwelijk', 'Intern'); omitted on a plain show/hide toggle so the badge
       * keeps its current variant.
       */
      variant?: string;
    }
  | {
      /**
       * Heading toggles the whole CopyWrap's `.visible`; paragraph toggles CopyWrap's
       * `showParagraph` BOOLEAN component property. Text is preserved either way, so
       * off-then-on never loses what the user typed.
       */
      type: 'set-typography-visibility';
      slideId: string;
      field: 'heading' | 'paragraph' | 'badge';
      visible: boolean;
    }
  | {
      /**
       * Sets the CopyWrap `Size` VARIANT; the variant master carries the per-size text
       * style, so swapping the value re-renders the Heading — no text-style rebind needed.
       */
      type: 'set-copywrap-size';
      slideId: string;
      size: string;
    }
  /** Persisted to `figma.clientStorage`. Capped at 8 entries UI-side; sandbox writes verbatim. */
  | { type: 'set-icon-recents'; items: string[] }
  /**
   * Writes `true` to `figma.clientStorage`; never un-set in normal use — re-triggering
   * onboarding on a future version is done by bumping the storage-key suffix.
   */
  | { type: 'set-onboarding-seen' }
  /** Fired continuously during drag; the sandbox persists the final size so later opens restore it. */
  | { type: 'resize-ui'; width: number; height: number }
  /**
   * `modeId = null` clears the explicit Theme-collection binding so the slide inherits
   * the page-level mode; the sandbox re-posts `slide-loaded` so the picker shows the
   * resolved state.
   */
  | { type: 'set-slide-theme'; slideId: string; modeId: string | null }
  /**
   * target='presentation' exports the current page: PDF becomes multi-page on Figma
   * Slides, PNG one wide image. Reply arrives as `document-ready`.
   */
  | {
      type: 'export-document';
      target: 'slide' | 'presentation';
      format: 'PDF' | 'PNG';
      slideId?: string;
    }
  /**
   * No redo equivalent in the plugin API. `slideId` is the iframe's current slide: the
   * sandbox re-scans and re-emits `slide-loaded` after undo so optimistic UI state
   * re-syncs — otherwise the picker keeps the pre-undo value and Undo reads as a no-op.
   */
  | { type: 'trigger-undo'; slideId?: string }
  | { type: 'close' };

/** Main thread → UI iframe via `figma.ui.postMessage`; received in `window.onmessage`. */
export type PluginToUIMessage =
  | {
      type: 'init';
      runtime?: PluginRuntimeInfo;
    }
  | {
      /**
       * Posted once on startup: instances whose plugin-data icon disagrees with the
       * visible slot child. The iframe looks up each SVG and posts update-card /
       * update-general back — this round-trip recovers ALL slides after a library
       * update, not just the one the user opens.
       */
      type: 'stale-icons';
      cards: Array<{ slideId: string; cardNodeId: string; iconIntended: string }>;
      badges: Array<{ slideId: string; iconIntended: string }>;
    }
  | {
      /**
       * Posted on slide focus (selectionchange) and content change (documentchange).
       * The UI replaces its entire slide state on receipt — no merge.
       */
      type: 'slide-loaded';
      summary: SlideSummary;
      general: GeneralSections | null;
      content: ContentItems | null;
      graphs: GraphItems | null;
    }
  | {
      /** Summary-only change (name, isSkipped) — skips the content re-scan of `slide-loaded`. */
      type: 'slide-summary';
      summary: SlideSummary;
    }
  | {
      /** Selection cleared, or the selected node has no slide ancestor. */
      type: 'slide-deselected';
    }
  | {
      type: 'target-updated';
      ok: boolean;
      requestId?: string;
      targetId?: string;
      error?: string;
      /**
       * Table-only: content can't fit the slot even at minimum font size (clips at the
       * bottom); the editor surfaces a warning.
       */
      tableOverflow?: boolean;
    }
  | {
      type: 'icons-ready';
    }
  | {
      type: 'image-preview';
      imageWrapId: string;
      /** PNG/JPG bytes of the current ImagePaint; structured-clonable. */
      bytes: Uint8Array;
      /** Width of the image slot (the fill-bearing child) in Figma pixels. 0 = unknown. */
      fillW: number;
      /** Height of the image slot (the fill-bearing child) in Figma pixels. 0 = unknown. */
      fillH: number;
    }
  /** Hydration of recent icons from `figma.clientStorage` on plugin open; empty array on first run. */
  | { type: 'icon-recents'; items: string[] }
  /** First-run onboarding flag; missing or unreadable storage is treated as `seen: false`. */
  | { type: 'onboarding-seen'; seen: boolean }
  /** Successful `export-document` result; failures go through `target-updated` (ok=false) instead. */
  | {
      type: 'document-ready';
      target: 'slide' | 'presentation';
      format: 'PDF' | 'PNG';
      bytes: Uint8Array;
      /** Filename suggested for the download (already includes the extension). */
      filename: string;
      /** Document title, used as the PDF's /Title metadata field. */
      title: string;
    }
  /**
   * One single-page PDF per non-skipped slide; the iframe merges them with `pdf-lib`.
   * Needed because exportAsync on a PageNode yields one giant single-page PDF spanning
   * the canvas grid, not a multi-page deck.
   */
  | {
      type: 'presentation-pdf-parts';
      parts: Uint8Array[];
      filename: string;
      /** Deck title, used as the merged PDF's /Title metadata field. */
      title: string;
    }
  /**
   * One per Type=Image/User card with a non-null visualHash, emitted after
   * `slide-loaded`; refreshed on `upload-image` so the thumbnail follows replaces.
   */
  | {
      type: 'card-visual-preview';
      cardNodeId: string;
      bytes: Uint8Array;
      /** Width of the card's image-slot in Figma pixels. 0 = unknown (UI falls back to a fixed h-32). */
      fillW: number;
      /** Height of the card's image-slot in Figma pixels. 0 = unknown. */
      fillH: number;
    }
  /**
   * After an instructor switch: list texts were reset sandbox-side to the new variant's
   * defaults. Targeted patch so the iframe updates only this card — a full slide rescan
   * (incl. preview exports) is needlessly slow here.
   */
  | {
      type: 'instructor-card-updated';
      cardNodeId: string;
      instructor: string;
      items: string[];
    };
