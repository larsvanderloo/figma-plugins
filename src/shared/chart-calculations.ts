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
    series.push({
      name: src !== undefined && typeof src.name === 'string' ? src.name : '',
      values: values,
    });
  }
  if (series.length === 0) {
    const values: number[] = [];
    for (let i = 0; i < categories.length; i++) values.push(0);
    series.push({ name: '', values: values });
  }

  return {
    slotId: model.slotId,
    chartType: isChartType(model.chartType) ? model.chartType : 'donut',
    categories: categories,
    series: series,
    showLegend: model.showLegend === true,
    showValues: model.showValues === true,
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
  if (left.categories.length !== right.categories.length) return false;
  for (let i = 0; i < left.categories.length; i++) {
    if (left.categories[i] !== right.categories[i]) return false;
  }
  if (left.series.length !== right.series.length) return false;
  for (let s = 0; s < left.series.length; s++) {
    if (left.series[s].name !== right.series[s].name) return false;
    for (let i = 0; i < left.series[s].values.length; i++) {
      if (left.series[s].values[i] !== right.series[s].values[i]) return false;
    }
  }
  return true;
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

/** Leeg default-model voor een verse ChartWrap-slot. */
export function emptyChartModel(slotId: string): ChartWrapModel {
  return {
    slotId: slotId,
    chartType: 'donut',
    categories: ['Categorie 1', 'Categorie 2', 'Categorie 3'],
    series: [{ name: 'Serie 1', values: [40, 35, 25] }],
    showLegend: true,
    showValues: true,
  };
}
