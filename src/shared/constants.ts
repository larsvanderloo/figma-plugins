// ============================================================
// Welder Slide Editor — Brand Tokens en Constanten
//
// Gedeeld tussen main-thread en UI-iframe.
// Alle waarden zijn statisch analyseerbaar (geen runtime-imports,
// geen dynamische expressies) zodat tree-shaking en esbuild's
// constant-folding zonder verrassingen werken.
//
// Theme-palet en font-mapping 1-op-1 gelijk aan chart-builder en
// welder-table, zodat slide-output visueel consistent blijft tussen
// oude widget-instances en de nieuwe plugin-renderers.
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
// Slide-detectie constanten
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
// Table-constanten (Slot-based TableWrap)
//
// Validatie-grenzen + layout-presets voor de Slot-based
// TableWrap-renderer. Constants zijn de single-source-of-truth voor
// zowel main-thread (editors/table/renderer.ts) als UI-iframe
// (TableEditor.vue — toon N/MAX-indicator).
// ============================================================

/** Maximum aantal rijen per TableWrap (inclusief header-rij). */
export const TABLE_MAX_ROWS = 20;

// computeCellMaxChars en TABLE_CELL_MAX_CHARS verwijderd. Input-niveau
// capping bleek niet werkbaar — de echte rendering-bound is afhankelijk
// van de actuele row-FILL-share-height die alleen na layout bekend is.
// Truncation gebeurt nu rendertime in renderer.ts via
// maxLines+textTruncation, berekend per cell uit de werkelijke
// row.height.

/** Flat maximum — de eerdere per-breedte-preset-koppeling is weg. */
export const TABLE_MAX_COLS = 6;

/** Fallback tabel-breedte per surface wanneer een Slot geen bruikbare width heeft. */
export const TABLE_MAX_WIDTH_SLIDE = 1728;
export const TABLE_MAX_WIDTH_WHITEPAPER = 1116;

/** Column-autofit constraints for the renderer-side width distributor. */
export const TABLE_AUTOFIT_MIN_COL = 160;
export const TABLE_AUTOFIT_MAX_COL_FRACTION = 0.62;

/**
 * Fallback width for legacy/invalid slots. Normal table rendering uses the
 * current Slot width so future narrower slot variants are respected. The
 * number of columns affects autofit distribution, not the outer table width.
 */
export function tableWidthForSurface(surfaceName: string | null, _columnCount: number): number {
  return surfaceName === WHITEPAPER_NODE_NAME ? TABLE_MAX_WIDTH_WHITEPAPER : TABLE_MAX_WIDTH_SLIDE;
}

// Geen TABLE_TEXT_SIZES-presets meer: fontSize wordt in renderer.ts
// afgeleid via getFontSizes(slotHeight, rowCount) — formula-based met clamps.
