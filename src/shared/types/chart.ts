// ============================================================
// Chart-editor types — Slot-based ChartWrap (T47)
//
// Zelfde architectuur als de TableWrap-rewrite (T34): de plugin bouwt
// zelf FRAMEs/ELLIPSEs/VECTORs binnen de SlotNode van een ChartWrap-
// INSTANCE. Het model is multi-series vanaf dag één: `categories` zijn
// de labels (slices/bars/x-as), elke serie levert één waarde per
// categorie.
//
// Anders dan de tabel (canvas-truth scan) is het chart-model
// pluginData-truth: de geometrie (arcs, bars, paths) is niet
// betrouwbaar terug te lezen, dus applyChart persisteert het model
// als JSON op de Slot en scanChartSlot leest het daar terug.
// ============================================================

/** Ondersteunde chart-types; per instance switchbaar in de editor. */
export type ChartType = 'donut' | 'pie' | 'bar' | 'progress' | 'line';

/** Eén data-serie: naam + één waarde per categorie. */
export interface ChartSeriesModel {
  name: string;
  /** Eén waarde per categorie; index-aligned met `categories`. */
  values: number[];
  /**
   * Per-waarde nadruk ("Cel benadrukken", zelfde concept als de tabel):
   * een benadrukt datapunt rendert z'n waarde/label in Instrument Sans
   * SemiBold. Index-aligned met `values`; afwezig = geen nadruk.
   */
  emphasis?: boolean[];
  /** T50.2 — waarde-labels van deze serie als percentage ('41' → '41%'). */
  percent?: boolean;
}

/**
 * Top-level model voor een bewerkbare ChartWrap-instance.
 * `slotId` verwijst naar de SlotNode binnen de ChartWrap-INSTANCE.
 *
 * Single-series chart-types (donut/pie/progress) renderen serie 0;
 * bar groepeert bars per categorie over alle series; line tekent één
 * lijn per serie.
 */
export interface ChartWrapModel {
  /** Figma SlotNode ID binnen de ChartWrap-INSTANCE. */
  slotId: string;
  chartType: ChartType;
  /** Categorie-labels (slices / bars / x-as-punten). */
  categories: string[];
  /**
   * Per-categorie nadruk ("Cel benadrukken" op de categoriekolom):
   * een benadrukte categorie rendert z'n categorie-label in Instrument
   * Sans SemiBold. Index-aligned met `categories`; afwezig = geen nadruk.
   */
  categoryEmphasis?: boolean[];
  /** Data-series; lengte >= 1. */
  series: ChartSeriesModel[];
  /** Legenda tonen (rechts van donut/pie, boven bar/line). */
  showLegend: boolean;
  /** Waarde-labels tonen op segmenten/bars/punten. */
  showValues: boolean;
  /**
   * Per-categorie delta-override (serie 0, T50). Index-aligned met
   * `categories`. Lege string = auto (chartDeltaLabel vs vorige
   * categorie); niet-lege string = letterlijke badge-tekst.
   */
  deltaOverrides?: string[];
  /**
   * Vaste referentieschaal voor progress-bars (T50). null/afwezig =
   * auto: max(100, hoogste waarde). Alleen waarden > 0 zijn geldig.
   */
  progressMax?: number | null;
  /** T50.4 — donut center-totaal override; lege string = auto (som serie 0). */
  donutTotalOverride?: string;
  /** T50.4 — onderschrift onder het center-totaal; default 'totaal'. */
  donutTotalLabel?: string;
  /** T50.4 — nadruk op het center-totaal (SemiBold); default true. */
  donutTotalEmphasis?: boolean;
  /** T50.4 — nadruk op het onderschrift (SemiBold); default false. */
  donutTotalLabelEmphasis?: boolean;
  /**
   * Delta-badges tonen (T48): per categorie de verandering t.o.v. de
   * vorige categorie in serie 0 (▲ +12% / ▼ −5%). Optioneel zodat
   * bestaande gepersisteerde modellen geldig blijven; default false.
   */
  showDelta?: boolean;
}
