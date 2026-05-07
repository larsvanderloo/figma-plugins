// ============================================================
// Welder Slide Editor — Shared Types
//
// Consumed by both main-thread (plugin-src/code.ts, slide-machine.ts,
// editors/**) en UI-iframe (plugin-src/ui/**). Deze types zijn de
// single-source-of-truth voor het plugin-datamodel en de bridge-
// messages tussen UI en main-thread.
//
// Bridge-messages volgen FIG-MSG-01 (typed discriminated unions).
// Zie spec.md §3 (Data-modellen) en §5 (Bridge-messages).
// ============================================================

// ============================================================
// Chart-editor types (T12 — 1-op-1 overgenomen uit chart-builder v0.3.0)
//
// Deze types voeden zowel het UI-iframe (ChartEditor + useChartStore +
// CsvImport) als de main-thread (editors/chart/renderer.ts, T13). De
// shape blijft bewust identiek aan chart-builder's widget-src/types.ts
// zodat de ported UI-components geen refactor nodig hebben.
// ============================================================

export const CHART_DATA_VERSION = 1 as const;

export type ChartType = 'bar' | 'line' | 'pie' | 'donut' | 'progressbar' | 'radial';

/**
 * Persisteerbare CSV-bron: ruwe tekst + mapping-instellingen. File-object
 * wordt NIET opgeslagen (niet serialiseerbaar); UI herstelt alleen uit
 * `text` + `fileName`.
 */
export interface CsvSource {
  text: string;
  fileName: string;
  selectedBlockIndex: number;
  labelColumn: number;
  valueColumn: number;
  skipHeader: boolean;
  valueFormat: 'number' | 'percentage';
}

export interface DataPoint {
  /** Niet leeg, max 32 tekens. */
  label: string;
  /** >= 0. */
  value: number;
  /** Optionele markering — zichtbaar wanneer showBenchmarkDelta actief is. */
  markering?: number;
}

export interface ChartData {
  version: typeof CHART_DATA_VERSION;
  chartType: ChartType;
  theme: 'orange' | 'blue';
  /** Max 64 tekens. */
  title: string;
  /**
   * Effectieve output — bepaald door activeDataTab. Renderers lezen
   * altijd dit veld; de store synchroniseert het.
   */
  dataPoints: DataPoint[];
  manualDataPoints?: DataPoint[];
  csvDataPoints?: DataPoint[];
  activeDataTab?: 'manual' | 'csv';
  valueFormat?: 'number' | 'percentage';
  showLegend?: boolean;
  benchmark?: number;
  min?: number;
  max?: number;
  showBenchmarkDelta?: boolean;
  csvSource?: CsvSource;
  showYAxis?: boolean;
  /** Size-preset; 'medium' default. */
  size?: 'small' | 'medium' | 'large' | 'fill';
}

// ============================================================
// Table-editor types — v0.2.0 Slot-based (T34.1)
//
// Nieuwe types voor de Slot-gebaseerde TableWrap-rewrite (T34). De
// plugin bouwt zelf FRAMEs + TEXT-nodes binnen de SlotNode, in plaats
// van library-components of vaste varianten.
//
// Oudere TableData (v0.1.x) is als @deprecated gemarkeerd; de shape
// blijft behouden voor backward-read-compat (T34.4 migration).
// ============================================================

/**
 * Top-level model voor een bewerkbare TableWrap-instance.
 * `slotId` verwijst naar de SlotNode binnen de TableWrap-INSTANCE.
 */
export interface TableWrapModel {
  /** Figma SlotNode ID binnen de TableWrap-INSTANCE. */
  slotId: string;
  /** Kolombreedte-preset van de tabel. */
  width: 'sm' | 'md' | 'lg';
  /**
   * T40 — wanneer true krijgt rij 0 een header-treatment: HUG-vertical,
   * gecentreerde tekst, dimmer-color, divider eronder. Body-rijen (1+)
   * delen het restant van de container-hoogte via FILL.
   * Default: false (bestaande tabellen blijven onveranderd).
   */
  hasColumnHeader: boolean;
  /**
   * T42.9 — tekst-grootte multiplier op de hoogte-formule.
   * sm = 0.75×, md = 1.0× (default), lg = 1.25×.
   * Was eerder verwijderd in T39.2 toen height-only formula werd
   * geïntroduceerd; teruggebracht omdat user-controle nodig blijkt.
   */
  textSize: 'sm' | 'md' | 'lg';
  rows: TableRowModel[];
}

/** Eén rij binnen een TableWrapModel. */
export interface TableRowModel {
  /** FRAME-id van de bestaande row-FRAME binnen de Slot; leeg bij nieuwe rijen. */
  rowNodeId: string;
  cells: TableCellModel[];
}

/** Eén cel binnen een TableRowModel. */
export interface TableCellModel {
  /** FRAME-id van de bestaande cell-FRAME binnen de row; leeg bij nieuwe cellen. */
  cellNodeId: string;
  value: string;
}

// ============================================================
// Legacy table-editor types (T14 — 1-op-1 overgenomen uit welder-table v0.2.0)
//
// @deprecated — bewaard voor backward-read-compat (T34.4). Nieuwe code
// gebruikt TableWrapModel / TableRowModel / TableCellModel hierboven.
// ============================================================

/** @deprecated — legacy v0.1.x shape, behouden voor backward-read-compat (T34.4). */
export const TABLE_DATA_VERSION = 2 as const; // v2 = plugin-storage-compat met welder-table v0.2.0.

/** @deprecated — legacy v0.1.x shape, behouden voor backward-read-compat (T34.4). */
export type TableCellType = 'text' | 'number' | 'badge';

/**
 * Badge-cel: vrij tekstlabel + gekozen Lucide-icon-naam. Geen state-map
 * (positief/neutraal/negatief is uit v0.1.0 verwijderd).
 * @deprecated — legacy v0.1.x shape, behouden voor backward-read-compat (T34.4).
 */
export interface BadgeCell {
  label: string;
  icon: string;
}

/** @deprecated — legacy v0.1.x shape, behouden voor backward-read-compat (T34.4). */
export interface TableColumn {
  id: string;
  label: string;
  cellType: TableCellType;
}

/**
 * Cellenwaarde per kolom; null bij leeg.
 * @deprecated — legacy v0.1.x shape, behouden voor backward-read-compat (T34.4).
 */
export type TableCellValue = string | number | BadgeCell | null;

/** @deprecated — legacy v0.1.x shape, behouden voor backward-read-compat (T34.4). */
export interface TableRow {
  id: string;
  cells: Record<string, TableCellValue>;
}

/** @deprecated — legacy v0.1.x shape, behouden voor backward-read-compat (T34.4). */
export type TableSize = 'small' | 'medium' | 'large' | 'fill';

/** @deprecated — legacy v0.1.x shape, behouden voor backward-read-compat (T34.4). */
export type TextSize = 'small' | 'medium' | 'large' | 'xl';

/**
 * @deprecated — legacy v0.1.x shape, behouden voor backward-read-compat (T34.4).
 *
 * Gebruik TableWrapModel voor nieuwe code (T34.2+).
 */
export interface TableData {
  version: number; // TABLE_DATA_VERSION
  theme: 'orange' | 'blue';
  size: TableSize;
  textSize: TextSize;
  columns: TableColumn[]; // max 6
  rows: TableRow[]; // effectieve output, bepaald door activeDataTab
  manualRows: TableRow[];
  csvRows: TableRow[];
  activeDataTab: 'manual' | 'csv';
}

// ============================================================
// Slide-overzicht (spec §3.1)
// ============================================================

export interface SlideSummary {
  /** Figma node-id van de Slide-instance (stabiel binnen een sessie). */
  id: string;
  /** 1-based volgnummer — gesorteerd op findAll-volgorde op currentPage. */
  number: number;
  /** Display-naam, bv. "Slide 3 — Customer Journey". */
  name: string;
  /**
   * Wordt deze slide overgeslagen bij presenteren?
   * `true`  → SlideNode.isSkippedSlide === true (skip-mode aan).
   * `false` → SlideNode.isSkippedSlide === false (normale slide).
   * `null`  → geen SlideNode-parent (Figma Design-editor); skip niet ondersteund op dit surface.
   */
  isSkipped: boolean | null;
}

// ============================================================
// Tabs + overkoepelende PluginView (spec §3.2)
// ============================================================

export type TabId = 'general' | 'graphs';

export interface PluginView {
  slides: SlideSummary[];
  currentSlideId: string | null;
  activeTab: TabId;
  /** null tot er een slide is gekozen óf als de slide deze wrapper niet heeft. */
  general: GeneralSections | null;
  content: ContentItems | null;
  graphs: GraphItems | null;
}

// ============================================================
// General-tab — slide-level singletons (spec §3.3)
// ============================================================

export interface TitleDescriptionSection {
  copyWrapId: string;
  heading: string;
  /** null wanneer CopyWrap geen Paragraph-textnode heeft. */
  paragraph: string | null;
  /**
   * Dim-accent-ranges op de heading (Text Dimmer-variable, spec §13 T30).
   *
   * - `Array<[start, end]>` — canonicale, niet-overlappende, gesorteerde
   *   ranges (`e_i < s_{i+1}`). Lege array = geen accent.
   * - `null` — library-variables (Text / Text Dimmer) niet bereikbaar op
   *   deze team-omgeving. UI verbergt dan het accent-blok.
   *
   * Heading-only — paragraph-accent is permanent out-of-scope (user-besluit,
   * zie spec §13 T30 en .archive/T28-accent-ranges-handoff).
   */
  headingDim: Array<[number, number]> | null;
}

export interface BadgeSection {
  badgeNodeId: string;
  label: string;
  /** Lucide-icon-key, zie constants.BADGE_ICON_OPTIONS. */
  icon: string;
}

export interface ImageSection {
  imageWrapId: string;
  /** Figma ImagePaint-hash; null wanneer er nog een placeholder-fill staat. */
  imageHash: string | null;
  /** v0.2.0 crop-support; blijft undefined in v0.1.0. Inline tuple matches Figma Transform = [[a,b,tx],[c,d,ty]]. */
  cropTransform?: [[number, number, number], [number, number, number]];
}

export interface GeneralSections {
  titleDescription: TitleDescriptionSection | null;
  badge: BadgeSection | null;
  image: ImageSection | null;
  /**
   * Slide-level Theme-collection mode binding. Null when no `Theme`
   * variable collection exists in the file (older Welder libraries
   * may pre-date the collection and the picker stays hidden).
   *
   * `explicitModeId` is set when the slide pins a specific mode via
   * `explicitVariableModes`; `null` means the slide inherits the
   * page-level mode. `resolvedModeId` is what Figma actually renders
   * (explicit if set, else inherited). `modes` lists the available
   * options for the picker UI.
   */
  theme: ThemeSection | null;
}

export interface ThemeSection {
  collectionId: string;
  collectionName: string;
  explicitModeId: string | null;
  resolvedModeId: string;
  modes: ReadonlyArray<{ id: string; name: string }>;
}

// ============================================================
// Content-tab — card-list (spec §3.4)
// ============================================================

export interface CardItem {
  cardNodeId: string;
  heading: string;
  paragraph: string;
  /**
   * Lucide-icon-slug voor het directe icon-INSTANCE-kind van de card
   * (bv. 'sparkles', 'snowflake').
   *
   * - `string` — icon-instance aanwezig en zichtbaar; slug is de huidige icon-keuze.
   * - `null`   — icon-instance afwezig of visible === false; icon-picker wordt
   *              verborgen in de UI (zelfde pattern als paragraph-hide T19).
   */
  icon: string | null;
  /**
   * ImagePaint-hash op het image-slot; null wanneer de card een image-slot
   * heeft maar nog leeg is. Undefined wanneer de card geen slot heeft
   * (de visual-editor verschijnt dan niet in de UI).
   */
  visualHash: string | null | undefined;
}

/**
 * Eén bewerkbaar timeline-item binnen een TimelineWrap (spec §13 T31).
 *
 * TimelineWrap's children zijn CopyWrap-instances (niet Card-instances);
 * elk item heeft alleen Heading + Paragraph — geen icon-swap, geen
 * visual-slot. Decoratieve `Stepper Item`-children worden door de scan
 * overgeslagen.
 */
export interface TimelineItem {
  /** Node-id van de CopyWrap-instance binnen TimelineWrap. */
  copyWrapNodeId: string;
  heading: string;
  /** Altijd een string — lege string wanneer de Paragraph-textnode ontbreekt. */
  paragraph: string;
}

export interface ContentItems {
  cardWrapId: string;
  cards: CardItem[];
  /**
   * Timeline-items (spec §13 T31). Lege array wanneer de slide geen
   * TimelineWrap heeft. Slides met alleen TimelineWrap hebben een lege
   * `cards`-array en een niet-lege `timelineItems`-array.
   */
  timelineItems: TimelineItem[];
  /**
   * JourneyWrap-model (T45). Null wanneer de slide geen JourneyWrap heeft.
   * JourneyEditor leest dit veld in T45 in.
   */
  journeyModel: JourneyWrapModel | null;
}

// ============================================================
// Graphs-tab — chart-editor + multi-instance selector (spec §3.5)
//
// Per §12-Q1 (2026-04-23): één Graphs-tab met instance-selector die alle
// ChartWrap + TableWrap instances op de slide kan tonen. Voor v0.1.0
// modelleren we alleen het chart-gedeelte (ChartData); table-support
// in T14. `selectedGraphId` verwijst naar het geselecteerde wrapper-id
// wanneer er meerdere instances zijn.
// ============================================================

/**
 * Eén bewerkbaar wrapper-instance binnen de Graphs-tab.
 * `type: 'chart'`  → ChartWrap, gerenderd door ChartEditor.
 * `type: 'table'`  → TableWrap, gerenderd door TableEditor.
 *
 * T31 (2026-04-24): TimelineWrap zit NIET meer in deze Graphs-lijst; het
 * wordt via `ContentItems.timelineItems` naar de Content-tab gerouteerd.
 */
export interface GraphInstance {
  nodeId: string;
  type: 'chart' | 'table';
  /** Menselijk leesbare naam, bv. "Chart 1 (bar)" of "Table 1". Samengesteld door main-thread. */
  label: string;
  /**
   * Chart-specifieke data — alleen aanwezig wanneer type === 'chart'.
   * `null` wanneer de ChartWrap nog geen pluginData draagt (nieuwe instance);
   * ChartEditor valt dan terug op DEFAULT_CHART_DATA.
   */
  chartData?: ChartData | null;
  /**
   * Table-specifieke data — alleen aanwezig wanneer type === 'table'.
   * `null` wanneer de TableWrap nog geen pluginData draagt (nieuwe instance);
   * TableEditor valt dan terug op DEFAULT_TABLE_DATA.
   *
   * @deprecated — legacy v0.1.x. T34.2 populate't niet langer dit veld;
   * nieuwe code (T34.3 UI) leest `tableModel` hieronder.
   */
  tableData?: TableData | null;
  /**
   * Slot-based table-model (T34.2, v0.2.0). Alleen aanwezig wanneer
   * type === 'table'. `null` wanneer de TableWrap geen Slot bevat
   * (nieuwe variant zonder inhoud) óf wanneer de scan geen rijen vindt.
   * TableEditor leest dit veld in T34.3 in.
   */
  tableModel?: TableWrapModel | null;
}

export interface GraphItems {
  /**
   * Alle ChartWrap + TableWrap instances op de slide (gesorteerd: charts
   * eerst, dan tables; binnen elk type op render-volgorde). Lengte >=1;
   * wanneer de slide geen graph/table-wrappers heeft is het omhullende
   * `graphs`-veld in PluginView `null` i.p.v. deze lijst leeg.
   */
  instances: GraphInstance[];
  /**
   * Geselecteerd instance-id — UI-state. Default: eerste instance. Mutatie
   * verloopt client-side in usePluginView; main-thread hoeft niet te weten
   * welke instance open staat.
   */
  selectedGraphId: string;
}

// ============================================================
// JourneyWrap-editor types (T45 — Slot-based JourneyWrap v1)
// ============================================================

/**
 * Eén pill-rij binnen een JourneyWrap.
 * `startPct` en `endPct` zijn percentages 0-100 van container-innerWidth.
 * Pill-breedte = (endPct - startPct) / 100 × contentWidth (Gantt-style).
 *
 * T45.6: endPct hersteld. UI gebruikt USlider in range-mode (twee thumbs)
 * met `min-steps-between-thumbs = JOURNEY_POS_MIN_SPAN`. Pill-content
 * (icon + label) kan door auto-layout truncated worden als pillWidth
 * kleiner is dan de natuurlijke content-min-width.
 */
export interface JourneyItemModel {
  /** Figma-node-ID, leeg voor nieuwe items vanaf scan/UI. */
  itemNodeId: string;
  /** Lucide icon-name uit ICON_OPTIONS. */
  icon: string;
  /** Pill-tekst. */
  label: string;
  /** Start-positie als percentage 0-95. */
  startPct: number;
  /** Eind-positie als percentage; ≥ startPct + JOURNEY_POS_MIN_SPAN, ≤ 100. */
  endPct: number;
}

/**
 * Eén kolom-header binnen een JourneyWrap (T46).
 * Twee tekstvelden, allemaal optioneel ingevuld (lege strings toegestaan).
 * Kolommen worden boven de pills gerenderd als grid-headers.
 * T46.6: body-veld verwijderd — header-sectie evenredig korter.
 */
export interface JourneyColumnModel {
  /** Bovenste regel — groot, theme-color, gecentreerd. Bv. "Besef". */
  header: string;
  /** Middelste regel — klein, theme-color, gecentreerd. Bv. "Prospect". */
  subheader: string;
}

/**
 * Top-level model voor een bewerkbare JourneyWrap-instance.
 * `slotId` verwijst naar de SlotNode binnen de JourneyWrap-INSTANCE.
 */
export interface JourneyWrapModel {
  /** Figma SlotNode ID binnen de JourneyWrap-INSTANCE. */
  slotId: string;
  /**
   * T46 — kolom-headers boven de pills (4-7 kolommen, default 6).
   * Backward-compat: scanJourneySlot defaultet naar 6 lege kolommen
   * wanneer pluginData v < 7 is (geen WelderJourneyHeader-FRAME aanwezig).
   */
  columns: JourneyColumnModel[];
  /** 0..JOURNEY_MAX_ITEMS pills. */
  items: JourneyItemModel[];
}

// ============================================================
// Bridge-messages (spec §5)
//
// Discriminated unions per richting (FIG-MSG-01). Beide bundels
// (main + UI) importeren deze types zodat send- en receive-kant altijd
// over dezelfde shape praten.
// ============================================================

/**
 * UI-iframe → main-thread (`parent.postMessage({ pluginMessage })`).
 * Main-thread ontvangt via `figma.ui.onmessage`.
 */
export type UIToPluginMessage =
  | { type: 'ui-ready' }
  | { type: 'pick-slide'; slideId: string }
  /**
   * Iframe regained focus — sandbox should re-scan and post the current
   * slide list. Belt-and-suspenders for the early-window after plugin
   * open, before `documentchange` is registered (which requires
   * loadAllPagesAsync to complete in dynamic-page mode).
   */
  | { type: 'refresh-slides' }
  | {
      type: 'update-general';
      slideId: string;
      section: 'titleDescription' | 'badge' | 'image';
      payload: unknown;
    }
  | {
      /**
       * Muteert alleen fills op de heading via Text Dimmer-variable
       * (spec §13 T30). Characters blijven ongemoeid; zie `update-general`
       * voor tekst-mutaties.
       *
       * Heading-only — geen `field`-discriminator. Paragraph-accent is
       * permanent out-of-scope (user-besluit bij T30-herstart).
       */
      type: 'update-accent';
      slideId: string;
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
        visualHash: string;
      }>;
    }
  | {
      /**
       * Muteert heading en/of paragraph van één timeline-item binnen de
       * TimelineWrap (spec §13 T31). `copyWrapNodeId` identificeert de
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
      type: 'update-graph';
      slideId: string;
      chartWrapId: string;
      data: ChartData;
    }
  | {
      /**
       * Full-state PUT van een TableWrap (T34.2). `slotId` identificeert
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
       * CSV-import voor een TableWrap (T34.2). Main-thread parseert de CSV-
       * string, trunceert op TABLE_MAX_ROWS / TABLE_MAX_COLS[width] en roept
       * applyTable aan.
       */
      type: 'import-csv';
      slideId: string;
      slotId: string;
      csv: string;
    }
  | {
      /**
       * Full-state PUT van een JourneyWrap (T45). `slotId` identificeert
       * de SlotNode binnen de JourneyWrap-INSTANCE; `desired` is het complete
       * gewenste model inclusief alle items.
       */
      type: 'update-journey';
      slideId: string;
      slotId: string;
      desired: JourneyWrapModel;
    }
  | {
      type: 'upload-image';
      targetNodeId: string;
      bytes: Uint8Array;
    }
  | {
      type: 'set-slide-skipped';
      slideId: string;
      skipped: boolean;
    }
  /**
   * Persist the user's recently-picked icon list. Sandbox writes the
   * array to `figma.clientStorage` so it survives plugin restarts and
   * is shared across all `IconPicker` instances. Capped at 8 entries
   * client-side; sandbox writes verbatim.
   */
  | { type: 'set-icon-recents'; items: string[] }
  /**
   * Pin (or clear) a slide's explicit Theme-collection mode. `modeId =
   * null` clears the explicit binding so the slide inherits the page-
   * level mode. Sandbox calls `setExplicitVariableModeForCollection`
   * on the slide instance and re-posts the resulting `slide-loaded`
   * payload so the picker UI reflects the resolved state.
   */
  | { type: 'set-slide-theme'; slideId: string; modeId: string | null }
  | { type: 'close' };

/**
 * Main-thread → UI-iframe (`figma.ui.postMessage`).
 * UI-iframe ontvangt via `window.onmessage`.
 */
export type PluginToUIMessage =
  | {
      type: 'init';
      slides: SlideSummary[];
      initialSlideId: string | null;
    }
  | {
      type: 'slide-loaded';
      slideId: string;
      general: GeneralSections | null;
      content: ContentItems | null;
      graphs: GraphItems | null;
    }
  | {
      type: 'target-updated';
      ok: boolean;
      targetId?: string;
      error?: string;
    }
  | {
      type: 'page-changed';
      slides: SlideSummary[];
    }
  | {
      type: 'slide-focused';
      slideId: string;
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
  | { type: 'icon-recents'; items: string[] };
