// ============================================================
// Bridge-messages
//
// Discriminated unions per richting (FIG-MSG-01). Beide bundels
// (main + UI) importeren deze types zodat send- en receive-kant altijd
// over dezelfde shape praten.
// ============================================================

import type { TitleDescriptionPayload, BadgePayload, GeneralSections } from './general';
import type { ContentItems } from './content';
import type { GraphItems } from './graphs';
import type { TableWrapModel } from './table';
import type { ChartWrapModel } from './chart';
import type { SlideSummary, PluginRuntimeInfo } from './runtime';

/**
 * UI-iframe → main-thread (`parent.postMessage({ pluginMessage })`).
 * Main-thread ontvangt via `figma.ui.onmessage`.
 */
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
       * Muteert alleen fills op de heading via Text Dimmer-variable.
       * Characters blijven ongemoeid; zie `update-general`
       * voor tekst-mutaties.
       *
       * Heading-only — geen `field`-discriminator. Paragraph-accent is
       * permanent out-of-scope.
       */
      type: 'update-accent';
      slideId: string;
      /** UI correlation id so high-frequency accent edits only ack themselves. */
      requestId?: string;
      /** Canonical ranges (zie `TitleDescriptionSection.headingDim`). */
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
         * Full SVG document string for the chosen Lucide icon, generated
         * iframe-side from the bundled Lucide body map. Sent alongside
         * `icon` so the sandbox can replace the icon node directly via
         * `figma.createNodeFromSvg` — no INSTANCE_SWAP, no library import.
         */
        iconSvg: string;
        visualHash: string;
        /** `Default` = filled card; `Outline` = bordered card. */
        style: 'Default' | 'Outline';
      }>;
    }
  | {
      /**
       * Muteert één InstructorCard: switcht de `Instructor` VARIANT
       * (foto + naam volgen de variant) en/of de list-item-teksten.
       * `items` is de volledige lijst in document-volgorde; de sandbox
       * skipt ongewijzigde teksten per index.
       */
      type: 'update-instructor-card';
      slideId: string;
      cardNodeId: string;
      payload: Partial<{
        instructor: string;
        items: string[];
        /** Card-zichtbaarheid — hidden collapst uit de CardWrap-auto-layout. */
        visible: boolean;
      }>;
    }
  | {
      /**
       * Muteert heading en/of paragraph van één timeline-item binnen de
       * TimelineWrap. `copyWrapNodeId` identificeert de
       * target-CopyWrap-instance. Debounced 200ms in TimelineItemEditor.
       */
      type: 'update-timeline-item';
      slideId: string;
      copyWrapNodeId: string;
      payload: Partial<{
        heading: string;
        paragraph: string;
      }>;
    }
  | {
      /**
       * Full-state PUT van een TableWrap. `slotId` identificeert
       * de SlotNode binnen de TableWrap-INSTANCE; `desired` is het complete
       * gewenste model inclusief alle rows + cells.
       */
      type: 'update-table';
      slideId: string;
      slotId: string;
      desired: TableWrapModel;
    }
  | {
      /**
       * Full-state PUT van een ChartWrap. `slotId` identificeert de
       * SlotNode binnen de ChartWrap-INSTANCE; `desired` is het complete
       * gewenste chart-model (type, categories, series, weergave-opties).
       */
      type: 'update-chart';
      slideId: string;
      slotId: string;
      desired: ChartWrapModel;
    }
  | {
      /**
       * CSV-import voor een ChartWrap. Main-thread parseert de CSV
       * (rij 0 = koprij met serienamen, kolom 0 = categorie-labels) en
       * roept applyChart aan.
       */
      type: 'import-chart-csv';
      slideId: string;
      slotId: string;
      csv: string;
    }
  | {
      /**
       * CSV-import voor een TableWrap. Main-thread parseert de CSV-
       * string, trunceert op TABLE_MAX_ROWS / TABLE_MAX_COLS (flat max)
       * en roept applyTable aan.
       */
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
       * Apply a global card size to every Card on the slide in one pass:
       * resize each card's icon-slot child to `iconSize` × `iconSize`
       * pixels AND apply the named text style to its Heading TextNode AND
       * switch the slide's explicit-variable mode for the collection that
       * owns the CardWrap's `itemSpacing` binding (so the gap follows).
       * One sandbox walk + one commitUndo for all three mutations.
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
      /**
       * Toggle visibility of the Heading or Paragraph subtree on the
       * slide's CopyWrap. Heading routes through the whole CopyWrap's
       * `.visible` flag; Paragraph through the `showParagraph` BOOLEAN
       * component property on CopyWrap. Text content is preserved on both
       * sides so toggling off-then-on doesn't lose what the user typed.
       */
      type: 'set-typography-visibility';
      slideId: string;
      field: 'heading' | 'paragraph' | 'badge';
      visible: boolean;
    }
  | {
      /**
       * Set the CopyWrap's `Size` VARIANT property (Display/H1/.../H4).
       * The variant master holds the per-size text style, so swapping the
       * variant value re-renders the Heading automatically — no separate
       * text-style rebind needed. Fired on slider release (commit).
       */
      type: 'set-copywrap-size';
      slideId: string;
      size: string;
    }
  /**
   * Persist the user's recently-picked icon list. Sandbox writes the
   * array to `figma.clientStorage` so it survives plugin restarts and
   * is shared across all `IconPicker` instances. Capped at 8 entries
   * client-side; sandbox writes verbatim.
   */
  | { type: 'set-icon-recents'; items: string[] }
  /**
   * Persist that the user has seen the first-run onboarding walkthrough.
   * Single-shot command (no payload) — sandbox writes `true` to
   * `figma.clientStorage` under `ONBOARDING_SEEN_KEY`. UI never un-sets
   * during normal use; bumping the storage key suffix is how we
   * re-trigger onboarding on a future version.
   */
  | { type: 'set-onboarding-seen' }
  /**
   * Resize the plugin iframe. Fired continuously while the user drags
   * the resize handle; sandbox calls `figma.ui.resize` and persists the
   * final size via `figma.clientStorage` so subsequent plugin opens
   * restore the last picked dimensions.
   */
  | { type: 'resize-ui'; width: number; height: number }
  /**
   * Pin (or clear) a slide's explicit Theme-collection mode. `modeId =
   * null` clears the explicit binding so the slide inherits the page-
   * level mode. Sandbox calls `setExplicitVariableModeForCollection`
   * on the slide instance and re-posts the resulting `slide-loaded`
   * payload so the picker UI reflects the resolved state.
   */
  | { type: 'set-slide-theme'; slideId: string; modeId: string | null }
  /**
   * Export the active slide OR the entire presentation as PDF or PNG.
   * Target=slide uses `slideId`; target=presentation exports the
   * current page (PDF→multi-page on Figma Slides; PNG→one wide image).
   * Sandbox replies with a `document-ready` message carrying bytes
   * + a suggested filename; the iframe triggers a blob-download.
   */
  | {
      type: 'export-document';
      target: 'slide' | 'presentation';
      format: 'PDF' | 'PNG';
      slideId?: string;
    }
  /**
   * Plugin-API trigger for native undo. No redo equivalent in the API.
   *
   * `slideId` is the iframe's currently-displayed slide. The sandbox
   * uses it to re-scan and re-emit `slide-loaded` after triggerUndo,
   * so iframe-side optimistic state (e.g. the picker's localIcon
   * watch on view.state.general.badge.icon) gets re-synced from the
   * post-undo canvas. Without this the picker would still show the
   * pre-undo value and the user reads the toolbar Undo as a no-op.
   */
  | { type: 'trigger-undo'; slideId?: string }
  | { type: 'close' };

/**
 * Main-thread → UI-iframe (`figma.ui.postMessage`).
 * UI-iframe ontvangt via `window.onmessage`.
 */
export type PluginToUIMessage =
  | {
      type: 'init';
      runtime?: PluginRuntimeInfo;
    }
  | {
      /**
       * Posted once on plugin startup after the sandbox has walked
       * every slide and built a list of Card/Badge instances whose
       * persisted-via-plugin-data icon disagrees with their currently-
       * visible slot child. The iframe receives the list, looks up the
       * SVG body for each, and posts one update-card / update-general
       * per entry — sandbox then applies the canonical icon back to
       * each stale slot. This is what makes library-update recovery
       * work for ALL slides instead of just the one the user opens.
       */
      type: 'stale-icons';
      cards: Array<{ slideId: string; cardNodeId: string; iconIntended: string }>;
      badges: Array<{ slideId: string; iconIntended: string }>;
    }
  | {
      /**
       * Posted whenever the focused slide changes (selectionchange) or its
       * content changes (documentchange). Carries both the summary (name,
       * skip-state) and the full content payload. The UI replaces its
       * entire slide-state on receipt.
       */
      type: 'slide-loaded';
      summary: SlideSummary;
      general: GeneralSections | null;
      content: ContentItems | null;
      graphs: GraphItems | null;
    }
  | {
      /**
       * Posted when only the slide's summary fields (name, isSkipped)
       * change — cheaper than a full slide-loaded since content doesn't
       * need to re-scan.
       */
      type: 'slide-summary';
      summary: SlideSummary;
    }
  | {
      /**
       * Posted when the user's selection no longer resolves to a slide
       * (selection cleared, or selected node has no slide ancestor). UI
       * clears its slide-state and shows the empty prompt.
       */
      type: 'slide-deselected';
    }
  | {
      type: 'target-updated';
      ok: boolean;
      requestId?: string;
      targetId?: string;
      error?: string;
    }
  | {
      type: 'icons-ready';
    }
  | {
      type: 'image-preview';
      imageWrapId: string;
      /** PNG/JPG bytes van de huidige ImagePaint; structured-clonable. */
      bytes: Uint8Array;
      /** Breedte van het image-slot (fill-dragende child) in Figma-pixels. 0 als onbekend. */
      fillW: number;
      /** Hoogte van het image-slot (fill-dragende child) in Figma-pixels. 0 als onbekend. */
      fillH: number;
    }
  /**
   * Initial hydration of recently-picked icons after plugin open.
   * Sandbox reads from `figma.clientStorage` and posts the array;
   * `useIconRecents` store calls `setItems(items)`. Empty array on
   * first run.
   */
  | { type: 'icon-recents'; items: string[] }
  /**
   * Hydration of the first-run onboarding flag. Sandbox reads
   * `ONBOARDING_SEEN_KEY` from `figma.clientStorage` on `ui-ready` and
   * posts the boolean. `useOnboarding` opens the modal automatically
   * when `seen === false`. Missing/unreadable storage is treated as
   * `seen: false` (first run).
   */
  | { type: 'onboarding-seen'; seen: boolean }
  /**
   * Result of an `export-document` request. Bytes are PDF or PNG
   * depending on `format`; iframe wraps them in a Blob with the
   * matching mime type and triggers a download with `filename`.
   * Failures still go through `target-updated` (ok=false) and surface
   * via the notifications toast.
   */
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
   * Multi-slide presentation export. Sandbox iterates each non-skipped
   * SLIDE node, runs exportAsync({ format: 'PDF' }) on each, and posts
   * the parts as a single message. Iframe uses `pdf-lib` to merge the
   * single-page PDFs into a multi-page PDF before triggering download.
   * Necessary because Figma's plugin API exportAsync on a PageNode
   * produces one giant single-page PDF spanning the canvas grid, not
   * a multi-page deck.
   */
  | {
      type: 'presentation-pdf-parts';
      parts: Uint8Array[];
      filename: string;
      /** Deck title, used as the merged PDF's /Title metadata field. */
      title: string;
    }
  /**
   * Per-card visual thumbnail bytes — analogue of `image-preview`
   * but keyed by `cardNodeId` instead of `imageWrapId`. Sandbox emits
   * one message per Type=Image (or Type=User) card with a non-null
   * visualHash, after `slide-loaded`. Iframe converts bytes to a data
   * URL and renders it as a thumbnail in the card's editor row.
   * Refreshed on `upload-image` (Vervangen-flow) so the thumbnail
   * keeps up with replaces.
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
   * Na een instructor-switch: de list-teksten zijn sandbox-side gereset
   * naar de defaults van de nieuwe variant. Gericht patch-bericht zodat
   * de iframe alleen deze card bijwerkt — een volledige slide-rescan
   * (incl. preview-exports) is hier onnodig traag.
   */
  | {
      type: 'instructor-card-updated';
      cardNodeId: string;
      instructor: string;
      items: string[];
    };
