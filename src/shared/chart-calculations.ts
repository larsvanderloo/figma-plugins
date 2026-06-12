// ============================================================
// shared/chart-calculations.ts
//
// Gedeelde chart-model-helpers voor sandbox-renderer én UI-editor:
// normalisatie (ragged series → rechthoek), equality voor de
// duplicate-update-guard, en totalen/percentages voor donut/pie en
// progress. Waarde-formatting hergebruikt formatTableNumber zodat
// tabellen en charts identiek formatteren (1.250,5 stijl).
//
// Sandbox-safe: ES2017 — geen optional chaining, geen nullish
// coalescing, geen catch-without-binding.
// ============================================================

import type { ChartSeriesModel, ChartType, ChartWrapModel } from './types';
import { formatTableNumber } from './table-calculations';

export const CHART_MAX_CATEGORIES = 12;
export const CHART_MAX_SERIES = 4;

export const CHART_TYPES: ChartType[] = ['donut', 'pie', 'bar', 'progress', 'line'];

export function isChartType(value: string): value is ChartType {
  for (let i = 0; i < CHART_TYPES.length; i++) {
    if (CHART_TYPES[i] === value) return true;
  }
  return false;
}

/**
 * Normaliseer een (mogelijk ragged of leeg) chart-model naar een
 * rechthoekige vorm: elke serie krijgt exact één numerieke waarde per
 * categorie, lengtes gecapt op de maxima, minimaal 1 categorie + 1 serie.
 */
export function normalizeChartModel(model: ChartWrapModel): ChartWrapModel {
  const categories: string[] = [];
  const sourceCategories = Array.isArray(model.categories) ? model.categories : [];
  for (let i = 0; i < sourceCategories.length && i < CHART_MAX_CATEGORIES; i++) {
    categories.push(typeof sourceCategories[i] === 'string' ? sourceCategories[i] : '');
  }
  if (categories.length === 0) categories.push('');

  const categoryEmphasis: boolean[] = [];
  const sourceCategoryEmphasis = Array.isArray(model.categoryEmphasis)
    ? model.categoryEmphasis
    : [];
  for (let i = 0; i < categories.length; i++) {
    categoryEmphasis.push(i < sourceCategoryEmphasis.length ? sourceCategoryEmphasis[i] === true : false);
  }

  const series: ChartSeriesModel[] = [];
  const sourceSeries = Array.isArray(model.series) ? model.series : [];
  for (let s = 0; s < sourceSeries.length && s < CHART_MAX_SERIES; s++) {
    const src = sourceSeries[s];
    const values: number[] = [];
    const sourceValues = src !== undefined && Array.isArray(src.values) ? src.values : [];
    for (let i = 0; i < categories.length; i++) {
      const v = i < sourceValues.length ? sourceValues[i] : 0;
      values.push(typeof v === 'number' && isFinite(v) && v >= 0 ? v : 0);
    }
    const emphasis: boolean[] = [];
    const sourceEmphasis = src !== undefined && Array.isArray(src.emphasis) ? src.emphasis : [];
    for (let i = 0; i < categories.length; i++) {
      emphasis.push(i < sourceEmphasis.length ? sourceEmphasis[i] === true : false);
    }
    series.push({
      name: src !== undefined && typeof src.name === 'string' ? src.name : '',
      values: values,
      emphasis: emphasis,
      percent: src !== undefined && src.percent === true,
    });
  }
  if (series.length === 0) {
    const values: number[] = [];
    const emphasis: boolean[] = [];
    for (let i = 0; i < categories.length; i++) {
      values.push(0);
      emphasis.push(false);
    }
    series.push({ name: '', values: values, emphasis: emphasis, percent: false });
  }

  // T50 — delta-overrides rechthoekig op categorie-lengte; progressMax
  // alleen geldig wanneer een eindig getal > 0.
  const deltaOverrides: string[] = [];
  const sourceOverrides = Array.isArray(model.deltaOverrides) ? model.deltaOverrides : [];
  for (let i = 0; i < categories.length; i++) {
    deltaOverrides.push(
      i < sourceOverrides.length && typeof sourceOverrides[i] === 'string'
        ? sourceOverrides[i]
        : '',
    );
  }
  const rawMax = model.progressMax;
  const progressMax = typeof rawMax === 'number' && isFinite(rawMax) && rawMax > 0 ? rawMax : null;

  return {
    slotId: model.slotId,
    chartType: isChartType(model.chartType) ? model.chartType : 'donut',
    categories: categories,
    categoryEmphasis: categoryEmphasis,
    series: series,
    showLegend: model.showLegend === true,
    showValues: model.showValues === true,
    showDelta: model.showDelta === true,
    deltaOverrides: deltaOverrides,
    progressMax: progressMax,
    donutTotalOverride: typeof model.donutTotalOverride === 'string' ? model.donutTotalOverride : '',
    donutTotalLabel: typeof model.donutTotalLabel === 'string' ? model.donutTotalLabel : 'totaal',
    donutTotalEmphasis: model.donutTotalEmphasis !== false,
    donutTotalLabelEmphasis: model.donutTotalLabelEmphasis === true,
  };
}

/** Semantische gelijkheid voor de duplicate-update-guard. */
export function chartModelsEqual(a: ChartWrapModel | null, b: ChartWrapModel): boolean {
  if (a === null) return false;
  const left = normalizeChartModel(a);
  const right = normalizeChartModel(b);
  if (left.slotId !== right.slotId) return false;
  if (left.chartType !== right.chartType) return false;
  if (left.showLegend !== right.showLegend) return false;
  if (left.showValues !== right.showValues) return false;
  if (left.progressMax !== right.progressMax) return false;
  if (left.donutTotalOverride !== right.donutTotalOverride) return false;
  if (left.donutTotalLabel !== right.donutTotalLabel) return false;
  if (left.donutTotalEmphasis !== right.donutTotalEmphasis) return false;
  if (left.donutTotalLabelEmphasis !== right.donutTotalLabelEmphasis) return false;
  if (left.showDelta !== right.showDelta) return false;
  if (left.categories.length !== right.categories.length) return false;
  for (let i = 0; i < left.categories.length; i++) {
    if (left.categories[i] !== right.categories[i]) return false;
    const lo = left.deltaOverrides;
    const ro = right.deltaOverrides;
    if ((lo !== undefined ? lo[i] : '') !== (ro !== undefined ? ro[i] : '')) return false;
    const lce = left.categoryEmphasis;
    const rce = right.categoryEmphasis;
    if ((lce !== undefined && lce[i] === true) !== (rce !== undefined && rce[i] === true)) {
      return false;
    }
  }
  if (left.series.length !== right.series.length) return false;
  for (let s = 0; s < left.series.length; s++) {
    if (left.series[s].name !== right.series[s].name) return false;
    if ((left.series[s].percent === true) !== (right.series[s].percent === true)) return false;
    for (let i = 0; i < left.series[s].values.length; i++) {
      if (left.series[s].values[i] !== right.series[s].values[i]) return false;
      const le = left.series[s].emphasis;
      const re = right.series[s].emphasis;
      if ((le !== undefined && le[i] === true) !== (re !== undefined && re[i] === true)) {
        return false;
      }
    }
  }
  return true;
}

/** Nadruk-flag van datapunt (serie s, categorie i); afwezig = false. */
export function isPointEmphasized(series: ChartSeriesModel, i: number): boolean {
  return series.emphasis !== undefined && series.emphasis[i] === true;
}

/** Nadruk-flag van categorie i (categoriekolom); afwezig = false. */
export function isCategoryEmphasized(model: ChartWrapModel, i: number): boolean {
  return model.categoryEmphasis !== undefined && model.categoryEmphasis[i] === true;
}

/** Som van alle waarden in een serie. */
export function seriesTotal(series: ChartSeriesModel): number {
  let total = 0;
  for (let i = 0; i < series.values.length; i++) total += series.values[i];
  return total;
}

/** Hoogste waarde over alle series (bar/line-schaal). */
export function chartMaxValue(model: ChartWrapModel): number {
  let max = 0;
  for (let s = 0; s < model.series.length; s++) {
    for (let i = 0; i < model.series[s].values.length; i++) {
      if (model.series[s].values[i] > max) max = model.series[s].values[i];
    }
  }
  return max;
}

/** Geformatteerde waarde voor labels — zelfde stijl als de tabel. */
export function formatChartValue(value: number): string {
  return formatTableNumber(value);
}

/**
 * Delta-badge-tekst voor categorie `index` t.o.v. de vorige categorie
 * (T48): ▲ +12% / ▼ −5%, afgerond op hele procenten. Conventies (zie
 * docs/architecture/chart-delta-badge.md): eerste categorie heeft geen
 * vorige → null; vorige waarde 0 → absolute verandering i.p.v. een
 * oneindig percentage (Geckoboard-conventie); beide 0 → null.
 */
export function chartDeltaLabel(values: number[], index: number): string | null {
  if (index <= 0 || index >= values.length) return null;
  const previous = values[index - 1];
  const current = values[index];
  if (previous === 0) {
    if (current === 0) return null;
    return '▲ +' + formatTableNumber(current);
  }
  const ratio = (current - previous) / previous;
  const pct = Math.round(Math.abs(ratio) * 100);
  if (pct === 0) return '0%';
  if (ratio > 0) return '▲ +' + String(pct) + '%';
  return '▼ −' + String(pct) + '%';
}

/** Leeg default-model voor een verse ChartWrap-slot. */
export function emptyChartModel(slotId: string): ChartWrapModel {
  return {
    slotId: slotId,
    chartType: 'donut',
    categories: ['Categorie 1', 'Categorie 2', 'Categorie 3'],
    series: [{ name: 'Serie 1', values: [40, 35, 25] }],
    showLegend: true,
    showValues: true,
    showDelta: false,
  };
}

/**
 * T50 — effectieve delta-tekst voor categorie i (serie 0): een niet-lege
 * override wint van de auto-berekening. Single source of truth voor de
 * sandbox-renderers én de UI-grid-placeholder.
 */
export function chartDeltaDisplay(model: ChartWrapModel, i: number): string | null {
  const overrides = model.deltaOverrides;
  if (overrides !== undefined && i < overrides.length) {
    const trimmed = overrides[i].trim();
    if (trimmed !== '') return trimmed;
  }
  if (model.series.length === 0) return null;
  return chartDeltaLabel(model.series[0].values, i);
}

/** T50 — referentieschaal voor progress: progressMax of auto. */
export function chartProgressReference(model: ChartWrapModel): number {
  const max = model.progressMax;
  if (typeof max === 'number' && isFinite(max) && max > 0) return max;
  return Math.max(100, chartMaxValue(model));
}

/** T50 — chart-types die alleen serie 0 renderen. */
export function isSingleSeriesChartType(t: ChartType): boolean {
  return t === 'donut' || t === 'pie' || t === 'progress';
}

/** T50.2 — waarde-label met optioneel procentteken (per serie). */
export function chartValueLabel(series: ChartSeriesModel, value: number): string {
  const formatted = formatTableNumber(value);
  return series.percent === true ? formatted + '%' : formatted;
}
