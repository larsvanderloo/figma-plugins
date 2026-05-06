// ============================================================
// editors/chart/types.ts
//
// Chart-renderer-specifieke types. `ChartData`, `ChartType`, `DataPoint`
// leven in widget-src/types.ts (gedeeld met UI-iframe) — hier alleen
// renderer-lokale types.
//
// Zie spec.md §9-T13.
// ============================================================

import type { ThemeTokens } from '../../constants';

/**
 * Render-context voor één chart-render-call. Bevat de resolved theme-
 * tokens en numerieke dimensies zodat individuele chart-renderers (bar/
 * line/pie) niet zelf hoeven te weten hoe `data.size` of `data.theme`
 * te vertalen naar pixels of hex-kleuren.
 */
export interface ChartRenderContext {
  theme: ThemeTokens;
  /** Canonieke outer-breedte in px (na resolve van size-preset). */
  width: number;
  /** Canonieke outer-hoogte in px; vast op 678 voor alle chart-types. */
  height: number;
}

/**
 * Naam die de renderer op het outer-frame zet. Wordt hergebruikt door
 * het code.ts `update-graph`-pad om oudere renders binnen een ChartWrap
 * terug te vinden en te verwijderen vóór de nieuwe wordt toegevoegd.
 */
export const CHART_CONTENT_NAME = 'WelderChartContent';

/** Numerieke breedtes per size-preset — 1-op-1 uit chart-core/constants. */
export const CHART_SIZE_PX = {
  small: 555,
  medium: 848,
  large: 1141,
  fill: 1728,
} as const;

/** Vaste canvas-hoogte voor alle chart-types (bar/line/pie/stubs). */
export const CHART_HEIGHT_PX = 678;
