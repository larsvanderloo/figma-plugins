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
// De plugin herkent twee bewerkbare "surfaces", elk een vaste-grootte
// INSTANCE met een eigen naam:
//   - Slide       1920×1080 (Slide Machine, landscape presentatie)
//   - Whitepaper  1240×1754 (A4 portret @150 DPI)
// Beide gebruiken dezelfde wrapper-instances (CopyWrap / Badge /
// ImageWrap / CardWrap / TableWrap / TimelineWrap) en dezelfde editors.
// Deze constanten worden door slide-machine.ts gebruikt zodat ze niet
// verstrooid in de codebase staan.
// ============================================================

export const SLIDE_NODE_NAME = 'Slide';
export const SLIDE_WIDTH = 1920;
export const SLIDE_HEIGHT = 1080;

export const WHITEPAPER_NODE_NAME = 'Whitepaper';
export const WHITEPAPER_WIDTH = 1240;
export const WHITEPAPER_HEIGHT = 1754;

/**
 * Alle herkende surface-signatures (naam + exacte afmetingen). `isSlide`
 * matcht een INSTANCE tegen deze lijst; een nieuwe format toevoegen is
 * één extra entry hier — geen wijziging aan de detectie-logica.
 */
export interface SurfaceSignature {
  name: string;
  width: number;
  height: number;
}

export const SURFACE_SIGNATURES: ReadonlyArray<SurfaceSignature> = [
  { name: SLIDE_NODE_NAME, width: SLIDE_WIDTH, height: SLIDE_HEIGHT },
  { name: WHITEPAPER_NODE_NAME, width: WHITEPAPER_WIDTH, height: WHITEPAPER_HEIGHT },
];

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

/**
 * T44: flat maximum — de eerdere per-breedte-preset-koppeling
 * (sm 3 / md 4 / lg 6) is weg; breedte volgt nu het kolom-aantal.
 */
export const TABLE_MAX_COLS = 6;

/**
 * T44 — breedte per kolom in Figma-pixels. De oude presets waren
 * impliciet al "~280px per kolom" (sm 840/3, md 1119/4, lg 1728/6);
 * 288 reproduceert het oude lg-footprint exact (288 × 6 = 1728).
 */
export const TABLE_COL_WIDTH = 288;

/** Maximale tabel-breedte per surface (was de oude lg-preset). */
export const TABLE_MAX_WIDTH_SLIDE = 1728;
export const TABLE_MAX_WIDTH_WHITEPAPER = 1116;

/**
 * T44 — afgeleide tabel-breedte: kolom-aantal × TABLE_COL_WIDTH, geclampt
 * op het surface-maximum. De `max(columnCount, 2)`-vloer voorkomt dat een
 * 1-koloms tabel 288px breed op een 1920-slide rendert — bewuste guard,
 * geen preset. Onbekende/afwezige surface-naam → Slide-max (default +
 * safe fallback voor legacy slides zonder herkenbare surface-ancestor).
 */
export function tableWidthForSurface(surfaceName: string | null, columnCount: number): number {
  const surfaceMax =
    surfaceName === WHITEPAPER_NODE_NAME ? TABLE_MAX_WIDTH_WHITEPAPER : TABLE_MAX_WIDTH_SLIDE;
  const cols = columnCount > 2 ? columnCount : 2;
  const derived = cols * TABLE_COL_WIDTH;
  return derived < surfaceMax ? derived : surfaceMax;
}

// T39.2: TABLE_TEXT_SIZES verwijderd. fontSize wordt nu in renderer.ts
// afgeleid via getFontSizes(slotHeight, rowCount) — formula-based met clamps,
// geen preset-mapping meer. Zie spec.md §13 T39.1.1.
