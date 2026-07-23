// Chart geometry (arcs, bars, paths) cannot be reliably read back from the
// canvas, so unlike the table (canvas-truth scan) this model is pluginData-truth:
// applyChart persists it as JSON on the Slot and scanChartSlot reads it back.

export type ChartType = 'donut' | 'pie' | 'bar' | 'progress' | 'line' | 'matrix';

export interface ChartSeriesModel {
  name: string;
  /** One value per category; index-aligned with `categories`. */
  values: number[];
  /** Per-value emphasis (renders SemiBold); index-aligned with `values`, absent = none. */
  emphasis?: boolean[];
  /** Render this series' value labels as percentages ('41' → '41%'). */
  percent?: boolean;
}

/**
 * Donut/pie/progress render series 0 only; bar groups bars per category
 * across all series; line draws one line per series.
 */
export interface ChartWrapModel {
  /** Figma SlotNode ID inside the ChartWrap instance. */
  slotId: string;
  chartType: ChartType;
  /** Category labels (slices / bars / x-axis points). */
  categories: string[];
  /** Per-category label emphasis (renders SemiBold); index-aligned with `categories`, absent = none. */
  categoryEmphasis?: boolean[];
  /** At least one series. */
  series: ChartSeriesModel[];
  showLegend: boolean;
  showValues: boolean;
  /**
   * Per-category delta override for series 0, index-aligned with `categories`.
   * Empty string = auto (delta vs previous category); non-empty = literal badge text.
   */
  deltaOverrides?: string[];
  /** Fixed scale for progress bars; null/absent = auto: max(100, highest value). Only values > 0 are valid. */
  progressMax?: number | null;
  /** Donut center-total override; empty string = auto (sum of series 0). */
  donutTotalOverride?: string;
  /** Caption under the center total; default 'totaal'. */
  donutTotalLabel?: string;
  /** SemiBold center total; absent = true. */
  donutTotalEmphasis?: boolean;
  /** SemiBold caption; absent = false. */
  donutTotalLabelEmphasis?: boolean;
  /**
   * Delta badges: per-category change vs the previous category in series 0.
   * Optional so existing persisted models stay valid; default false.
   */
  showDelta?: boolean;
}
