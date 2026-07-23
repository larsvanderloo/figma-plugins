// Values must stay statically analyzable (no runtime imports or dynamic expressions)
// so esbuild constant-folding and tree-shaking work predictably. Theme palette and
// fonts mirror chart-builder and welder-table 1:1 for visual consistency with legacy widgets.

export type ThemeId = 'orange' | 'blue';

export interface ThemeTokens {
  background: string;
  foreground: string;
  accent: string;
  gridLine: string;
  mutedText: string;
  /** Distinct series colors for pie/donut segments and bars. */
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
      '#FF7700',
      '#FFA557',
      '#DD5F00',
      '#FF9233',
      '#BB4F00',
      '#FFC688',
    ],
  },
  blue: {
    background: '#D5E5FF',
    foreground: '#2B7FFF',
    accent: '#609FFF',
    gridLine: '#C7D6EE',
    mutedText: '#2B7FFF',
    palette: [
      '#2B7FFF',
      '#609FFF',
      '#1B5EC9',
      '#87B7FF',
      '#10479F',
      '#AFCEFF',
    ],
  },
};

export const FALLBACK_THEME: ThemeTokens = THEMES.orange;

export const FONTS = {
  title: { family: 'Instrument Sans', style: 'SemiBold' },
  heading: { family: 'Inter', style: 'Medium' },
  body: { family: 'Inter', style: 'Regular' },
  axisLabel: { family: 'Inter', style: 'Medium' },
  dataLabel: { family: 'Inter', style: 'Regular' },
} as const;

/** Preloaded at init so debounced text writes never wait on a font load. */
export const REQUIRED_FONTS: ReadonlyArray<{ family: string; style: string }> = [
  { family: 'Inter', style: 'Regular' },
  { family: 'Inter', style: 'Medium' },
  { family: 'Instrument Sans', style: 'SemiBold' },
];

// Two editable surfaces (Slide 1920×1080, Whitepaper = A4 portrait @150 DPI);
// both share the same wrapper instances and editors.
export const SLIDE_NODE_NAME = 'Slide';
export const SLIDE_WIDTH = 1920;
export const SLIDE_HEIGHT = 1080;

export const WHITEPAPER_NODE_NAME = 'Whitepaper';
export const WHITEPAPER_WIDTH = 1240;
export const WHITEPAPER_HEIGHT = 1754;

/** isSlide matches against this list; a new format is one extra entry, no logic change. */
export interface SurfaceSignature {
  name: string;
  width: number;
  height: number;
}

export const SURFACE_SIGNATURES: ReadonlyArray<SurfaceSignature> = [
  { name: SLIDE_NODE_NAME, width: SLIDE_WIDTH, height: SLIDE_HEIGHT },
  { name: WHITEPAPER_NODE_NAME, width: WHITEPAPER_WIDTH, height: WHITEPAPER_HEIGHT },
];

// Table limits are the single source of truth for both the sandbox renderer
// and the UI's N/MAX indicator.

/** Maximum rows per TableWrap, including the header row. */
export const TABLE_MAX_ROWS = 15;

export const TABLE_MAX_COLS = 6;

/** Fallback table width per surface when a Slot has no usable width. */
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
