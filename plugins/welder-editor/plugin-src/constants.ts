// ============================================================
// Welder Slide Editor — Brand Tokens en Constanten
//
// Gedeeld tussen main-thread en UI-iframe.
// Alle waarden zijn statisch analyseerbaar (geen runtime-imports,
// geen dynamische expressies) zodat tree-shaking en esbuild's
// constant-folding zonder verrassingen werken.
//
// Theme-palet en font-mapping 1-op-1 gelijk aan chart-builder v0.3.0
// en welder-table v0.2.0, zodat slide-output visueel consistent blijft
// tussen oude widget-instances en de nieuwe plugin-renderers.
// ============================================================

// ============================================================
// Theme-tokens
// ============================================================

export type ThemeId = 'orange' | 'blue';

export interface ThemeTokens {
  background: string;
  foreground: string;
  accent: string;
  gridLine: string;
  mutedText: string;
  /** Distincte kleuren voor pie/donut-segmenten en bar-staven. */
  palette: string[];
}

export const THEMES: Record<ThemeId, ThemeTokens> = {
  orange: {
    background: '#FFF4EA',
    foreground: '#FF7700',
    accent: '#FF9233',
    gridLine: '#FFB665',
    mutedText: '#FF7700',
    palette: [
      '#FF7700', // oranje
      '#FFA557', // licht oranje
      '#DD5F00', // donker oranje
      '#FF9233', // amber
      '#BB4F00', // bruin-oranje
      '#FFC688', // perzik
    ],
  },
  blue: {
    background: '#D5E5FF',
    foreground: '#2B7FFF',
    accent: '#609FFF',
    gridLine: '#C7D6EE',
    mutedText: '#2B7FFF',
    palette: [
      '#2B7FFF', // blauw
      '#609FFF', // licht blauw
      '#1B5EC9', // donker blauw
      '#87B7FF', // luchtig blauw
      '#10479F', // marine
      '#AFCEFF', // bleek blauw
    ],
  },
};

/** Fallback-tokens wanneer een onbekende theme-id wordt gelezen. */
export const FALLBACK_THEME: ThemeTokens = THEMES.orange;

// ============================================================
// Fonts — Figma FontName-tuples (family + style)
//
// Gebruikt door zowel editors/** (main-thread loadFontAsync-calls)
// als UI (label-weergave). Alle mutaties op text-nodes vereisen eerst
// figma.loadFontAsync(fontName) — zie FIG-FONT-01.
// ============================================================

export const FONTS = {
  title: { family: 'Instrument Sans', style: 'SemiBold' },
  heading: { family: 'Inter', style: 'Medium' },
  body: { family: 'Inter', style: 'Regular' },
  axisLabel: { family: 'Inter', style: 'Medium' },
  dataLabel: { family: 'Inter', style: 'Regular' },
} as const;

/**
 * Alle font-combinaties die de plugin bij init preload — main-thread
 * roept `Promise.all(REQUIRED_FONTS.map(figma.loadFontAsync))` voor
 * de eerste text-mutatie zodat latere debounced updates direct door
 * kunnen.
 */
export const REQUIRED_FONTS: ReadonlyArray<{ family: string; style: string }> = [
  { family: 'Inter', style: 'Regular' },
  { family: 'Inter', style: 'Medium' },
  { family: 'Instrument Sans', style: 'SemiBold' },
];

// ============================================================
// Icon-opties — curated Lucide-icon-namen (~150 business-relevante slugs)
//
// Uitgebreide set t.o.v. de originele BADGE_ICON_OPTIONS uit
// welder-table v0.2.0. Alle originele icons zijn behouden; nieuwe
// icons zijn gegroepeerd per categorie. Elke string mapt op een
// Lucide-icon-body uit @iconify-json/lucide.
// ============================================================

export const ICON_OPTIONS: string[] = [
  // --- Originele set (welder-table v0.2.0, ongewijzigd) ---
  'trending-up',
  'trending-down',
  'arrow-up',
  'arrow-down',
  'arrow-up-right',
  'arrow-down-right',
  'arrow-down-az',
  'arrow-up-az',
  'check',
  'check-circle',
  'x',
  'x-circle',
  'alert-triangle',
  'alert-circle',
  'info',
  'star',
  'flag',
  'clock',
  'calendar',
  'user',
  'users',
  'building',
  'briefcase',
  'target',
  'zap',
  'award',
  'heart',
  'eye',
  'bookmark',
  'tag',
  'thumbs-up',
  'thumbs-down',
  'circle',
  'plus',
  'minus',
  'percent',
  'euro',
  'activity',
  'lock',

  // --- Arrows / navigatie ---
  'arrow-left',
  'arrow-right',
  'arrow-up-left',
  'arrow-down-left',
  'chevron-up',
  'chevron-down',
  'chevron-left',
  'chevron-right',
  'move-up',
  'move-down',

  // --- Charts / data ---
  'bar-chart',
  'bar-chart-2',
  'bar-chart-3',
  'bar-chart-4',
  'bar-chart-horizontal',
  'line-chart',
  'pie-chart',
  'area-chart',
  'scatter-chart',
  'table',
  'table-2',
  'database',
  'layers',
  'grid-2x2',

  // --- Finance ---
  'dollar-sign',
  'wallet',
  'credit-card',
  'receipt',
  'piggy-bank',
  'coins',
  'banknote',
  'landmark',
  'gem',
  'badge-percent',

  // --- People / HR ---
  'user-plus',
  'user-minus',
  'user-check',
  'user-x',
  'user-cog',
  'user-round',
  'contact',
  'id-card',
  'group',
  'person-standing',
  'handshake',

  // --- Time ---
  'timer',
  'alarm-clock',
  'hourglass',
  'history',
  'calendar-check',
  'calendar-x',
  'calendar-clock',

  // --- Communicatie ---
  'mail',
  'message-circle',
  'message-square',
  'phone',
  'bell',
  'bell-off',
  'megaphone',
  'rss',
  'share-2',
  'send',

  // --- Status / UI ---
  'check-square',
  'circle-dot',
  'toggle-left',
  'toggle-right',
  'shield',
  'shield-check',
  'shield-alert',
  'badge-check',
  'badge-x',

  // --- Files / tools ---
  'file',
  'file-text',
  'folder',
  'clipboard',
  'copy',
  'edit',
  'pen',
  'pencil',
  'trash-2',
  'download',
  'upload',
  'link',
  'external-link',
  'search',
  'settings',
  'sliders',
  'filter',
  'refresh-cw',

  // --- Misc ---
  'home',
  'store',
  'truck',
  'package',
  'box',
  'globe',
  'map-pin',
  'compass',
  'cpu',
  'monitor',
  'smartphone',
  'unlock',
  'key',
];

/**
 * Backward-compat alias — alle bestaande imports van BADGE_ICON_OPTIONS
 * blijven werken zonder codewijziging.
 */
export const BADGE_ICON_OPTIONS = ICON_OPTIONS;

// ============================================================
// Slide-detectie constanten (spec §7)
//
// Slide Machine-slides zijn vaste 1920×1080 instances met name 'Slide'.
// Deze constanten worden door slide-machine.ts gebruikt zodat ze niet
// verstrooid in de codebase staan.
// ============================================================

export const SLIDE_NODE_NAME = 'Slide';
export const SLIDE_WIDTH = 1920;
export const SLIDE_HEIGHT = 1080;

/** Bounded traversal-diepte bij wrapper-zoeken binnen een slide (FIG-TRAVERSE-01). */
export const WRAPPER_MAX_DEPTH = 6;

// ============================================================
// Table-constanten (T34.6 — Slot-based TableWrap v0.2.0)
//
// Validatie-grenzen + layout-presets voor de new Slot-based
// TableWrap-renderer (T34.2). Constants zijn de single-source-of-truth
// voor zowel main-thread (editors/table/renderer.ts) als UI-iframe
// (TableEditor.vue — toon N/MAX-indicator).
// ============================================================

/** Maximum aantal rijen per TableWrap (inclusief header-rij). */
export const TABLE_MAX_ROWS = 15;

// T42.16: computeCellMaxChars (T42.15) en TABLE_CELL_MAX_CHARS (T42.14)
// verwijderd. Input-niveau capping bleek niet werkbaar — de echte
// rendering-bound is afhankelijk van de actuele row-FILL-share-height
// die alleen na layout bekend is. Truncation gebeurt nu rendertime in
// renderer.ts via maxLines+textTruncation, berekend per cell uit de
// werkelijke row.height.

/** Maximum aantal kolommen per breedte-preset. */
export const TABLE_MAX_COLS: Record<'sm' | 'md' | 'lg', number> = {
  sm: 3,
  md: 4,
  lg: 6,
};

/**
 * Breedte van de Slot-node in Figma-pixels per breedte-preset.
 * De renderer roept `slot.resize(TABLE_WIDTHS[width], slot.height)` aan.
 */
export const TABLE_WIDTHS: Record<'sm' | 'md' | 'lg', number> = {
  sm: 800,
  md: 1200,
  lg: 1728,
};

// T39.2: TABLE_TEXT_SIZES verwijderd. fontSize wordt nu in renderer.ts
// afgeleid via getFontSizes(slotHeight, rowCount) — formula-based met clamps,
// geen preset-mapping meer. Zie spec.md §13 T39.1.1.

// ============================================================
// JourneyWrap-constanten (T45 — Slot-based JourneyWrap v1)
// T45.6: startPct + endPct per pill — Gantt-style range via USlider
// ============================================================

/** Maximum aantal items (rijen / pills) per JourneyWrap. */
export const JOURNEY_MAX_ITEMS = 5;

/** Vaste breedte van de Slot-node — geen presets. */
export const JOURNEY_WIDTH = 1728;

/** Minimum-percentage voor positie-slider. */
export const JOURNEY_POS_MIN_PCT = 0;

/** Maximum-percentage voor positie-slider. */
export const JOURNEY_POS_MAX_PCT = 100;

/**
 * Minimum spread tussen startPct en endPct (in %). Gebruikt door UI
 * (`<USlider min-steps-between-thumbs>`) en als clamp-floor in renderer.
 */
export const JOURNEY_POS_MIN_SPAN = 5;

/**
 * Horizontale + verticale padding van de JourneyWrap-container in
 * Figma-pixels. Pills spannen over (JOURNEY_WIDTH − 2 × padding).
 * Gedeeld tussen renderer (positionering) en UI (dynamische min-span-cap).
 */
export const JOURNEY_CONTAINER_PADDING = 24;

/**
 * Vaste pixel-overhead per JourneyItem-pill: icon-breedte + horizontale
 * paddings binnen het pill-component. Wordt door UI gebruikt om de
 * minimum-pill-breedte te berekenen op basis van label-content.
 * Approximatie — wijken iets af van de echte JourneyItem-internals,
 * vandaar de safety-factor hieronder.
 */
export const JOURNEY_PILL_FIXED_PX = 110;

/**
 * Font-spec voor het label binnen de JourneyItem-component.
 * Wordt door UI gebruikt voor canvas-based text-width-meting.
 * Wijken iets af van de daadwerkelijke component-font is acceptabel —
 * safety-factor compenseert.
 */
export const JOURNEY_LABEL_FONT_PX = 32;
export const JOURNEY_LABEL_FONT_FAMILY = 'Inter, sans-serif';

/**
 * Safety-multiplier voor de UI label-pixel-meting. Compenseert font-
 * en padding-mismatches tussen UI-canvas en Figma-renderer. 1.3 = 30%
 * extra ruimte (T45.14 — was 1.1, mid-word breaking trad nog op met
 * "Placeholder" omdat Figma's font-rendering iets breder is dan canvas
 * measureText) zodat de slider iets eerder begint te cappen dan strict
 * nodig — voorkomt mid-word breaking in edge-cases.
 */
export const JOURNEY_LABEL_SAFETY_FACTOR = 1.3;

/** Default item zonder content (gebruikt door UI bij "+ Item toevoegen"). */
export const JOURNEY_DEFAULT_ITEM: {
  icon: string;
  label: string;
  startPct: number;
  endPct: number;
} = {
  icon: 'star',
  label: '',
  startPct: 0,
  endPct: 30,
};

// ============================================================
// T46 — Kolom-headers boven JourneyWrap-pills
// ============================================================

/**
 * Min/max aantal kolomheaders. Default startwaarde voor nieuwe wraps.
 *
 * T46.8: MIN verlaagd van 4 → 0. Een JourneyWrap mag nu 0 kolomheaders hebben:
 * pills blijven gerenderd, maar de header-sectie (cells + dividers) verdwijnt
 * visueel. De renderer behoudt wel een 1px-hoge marker-FRAME zodat scan
 * onderscheid kan maken tussen "user koos 0" en "geen header-frame ooit
 * aangemaakt" (legacy v < 7 → default 6 kolommen).
 */
export const JOURNEY_MIN_COLUMNS = 0;
export const JOURNEY_MAX_COLUMNS = 7;
export const JOURNEY_DEFAULT_COLUMN_COUNT = 6;

/** Default kolom (gebruikt door UI bij "+ Kolom toevoegen" en backward-compat default). */
export const JOURNEY_DEFAULT_COLUMN: { header: string; subheader: string } = {
  header: '',
  subheader: '',
};

/**
 * Geschatte vaste hoogte (pixels) voor de hele header-sectie:
 * header-row + subheader-row + paddings + horizontale divider onderlangs.
 * Wordt door applyJourney gebruikt om container-hoogte te berekenen
 * (JOURNEY_HEADER_HEIGHT + N_pills × PILL_HEIGHT + paddings + gaps).
 * T46.6: body-veld verwijderd — verlaagd van 220 naar 140.
 */
export const JOURNEY_HEADER_HEIGHT = 140;

/** Font-sizes voor de twee header-velden (Figma-pixels). */
export const JOURNEY_HEADER_FONT_PX = 32; // Header (groot)
export const JOURNEY_SUBHEADER_FONT_PX = 20; // Subheader (klein)

/** Divider-line-thickness voor verticale + horizontale dividers (pixels). */
export const JOURNEY_DIVIDER_WEIGHT = 1;
