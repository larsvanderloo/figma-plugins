// ============================================================
// Chart-editor constants — 1-op-1 overgenomen uit chart-builder
// v0.3.0 (widgets/chart-builder/widget-src/constants.ts).
//
// Theme-tokens staan al in plugin-src/constants.ts (THEMES); hier
// houden we alleen de chart-specifieke defaults + helper-functies
// zodat UI-components en main-thread (T13) dezelfde bron gebruiken.
// ============================================================

import type { ChartData, ChartType } from '../types';
import { CHART_DATA_VERSION } from '../types';

/**
 * Maximaal toegestane aantal datapunten per chart-type.
 *   progressbar → 6 (verticaal gestapeld in 678px-hoog frame)
 *   radial      → 4
 *   overige     → 12
 */
export function getMaxDataPoints(chartType: ChartType): number {
  if (chartType === 'progressbar') return 6;
  if (chartType === 'radial') return 4;
  return 12;
}

export const CHART_SIZES = {
  small: 555,
  medium: 848,
  large: 1141,
  fill: 1728,
} as const;

export type ChartSize = 'small' | 'medium' | 'large' | 'fill';

/** Startwaarden voor een nieuwe chart-instance (ChartWrap zonder pluginData). */
export const DEFAULT_CHART_DATA: ChartData = {
  version: CHART_DATA_VERSION,
  chartType: 'bar',
  theme: 'orange',
  title: 'Mijn grafiek',
  dataPoints: [
    { label: 'Q1', value: 42 },
    { label: 'Q2', value: 67 },
    { label: 'Q3', value: 55 },
  ],
  manualDataPoints: [
    { label: 'Q1', value: 42 },
    { label: 'Q2', value: 67 },
    { label: 'Q3', value: 55 },
  ],
  csvDataPoints: [],
  activeDataTab: 'manual',
  valueFormat: 'number',
  showLegend: true,
  showBenchmarkDelta: false,
  benchmark: 0,
  showYAxis: false,
  size: 'medium',
  min: 0,
  // max intentionally omitted (undefined)
};
