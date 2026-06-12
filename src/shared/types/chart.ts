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
   * Delta-badges tonen (T48): per categorie de verandering t.o.v. de
   * vorige categorie in serie 0 (▲ +12% / ▼ −5%). Optioneel zodat
   * bestaande gepersisteerde modellen geldig blijven; default false.
   */
  showDelta?: boolean;
}
