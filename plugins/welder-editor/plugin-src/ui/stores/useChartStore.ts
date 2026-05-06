// ============================================================
// useChartStore — Pinia setup-store voor de ChartEditor (T12).
//
// Geport uit chart-builder v0.3.0 (useChartDataStore.ts). Het
// originele module-scoped `reactive()`-patroon is hier in een
// Pinia-setup-store verpakt. State-shape onveranderd: één
// `reactive<ChartData>` onder `store.state` zodat consumers
// (ChartEditor + chart/* componenten) niet hoeven aanpassen.
//
// Init verloopt via `init(data)` zodra de plugin via `slide-loaded`
// een ChartData-payload heeft gestuurd (T13 vult `graphs.data` met
// echte data; tot die tijd valt init terug op DEFAULT_CHART_DATA).
// Mutaties lopen direct op `state.<veld> = ...` dankzij Vue's deep
// reactivity.
//
// Chart-type-strip: een interne watcher op `state.chartType` knipt
// manualDataPoints en csvDataPoints terug naar `getMaxDataPoints`.
// Door deze regel in de store te plaatsen geldt de strip ongeacht
// welke component chartType muteert (USelectMenu in ChartTypeSelector
// of een toekomstige API-action).
//
// Verschillen t.o.v. chart-builder:
//   - State leeft naast de usePluginView-store; ChartEditor bindt
//     de twee in GraphsPanel.
//   - Geen bridge-aware update-emit; de wrapper-component (ChartEditor)
//     stuurt `update-graph` via usePluginBridge met debounce.
// ============================================================

import { reactive, watch } from 'vue';
import { defineStore } from 'pinia';
import type { ChartData, CsvSource, DataPoint } from '../../types';
import { DEFAULT_CHART_DATA, getMaxDataPoints } from '../../chart-core/constants';

/** Diepe kopie van een DataPoint-array. */
function cloneDataPoints(points: DataPoint[]): DataPoint[] {
  return points.map((p) => ({
    label: p.label,
    value: p.value,
    ...(p.markering !== undefined ? { markering: p.markering } : {}),
  }));
}

/** Diepe kopie van een CsvSource-object. */
function cloneCsvSource(src: CsvSource): CsvSource {
  return {
    text: src.text,
    fileName: src.fileName,
    selectedBlockIndex: src.selectedBlockIndex,
    labelColumn: src.labelColumn,
    valueColumn: src.valueColumn,
    skipHeader: src.skipHeader,
    valueFormat: src.valueFormat,
  };
}

/**
 * Diepe kopie van ChartData — arrays zijn reference types en moeten
 * apart gekloond worden zodat mutaties in de store niet terugslaan op de bron.
 */
function cloneChartData(source: ChartData): ChartData {
  const manual =
    source.manualDataPoints !== undefined ? cloneDataPoints(source.manualDataPoints) : undefined;
  const csv =
    source.csvDataPoints !== undefined ? cloneDataPoints(source.csvDataPoints) : undefined;

  return {
    version: source.version,
    chartType: source.chartType,
    theme: source.theme,
    title: source.title,
    dataPoints: cloneDataPoints(source.dataPoints),
    manualDataPoints: manual,
    csvDataPoints: csv,
    activeDataTab: source.activeDataTab,
    valueFormat: source.valueFormat,
    showLegend: source.showLegend,
    ...(source.benchmark !== undefined ? { benchmark: source.benchmark } : {}),
    ...(source.min !== undefined ? { min: source.min } : {}),
    ...(source.max !== undefined ? { max: source.max } : {}),
    showBenchmarkDelta: source.showBenchmarkDelta !== undefined ? source.showBenchmarkDelta : false,
    ...(source.csvSource !== undefined ? { csvSource: cloneCsvSource(source.csvSource) } : {}),
    ...(source.showYAxis !== undefined ? { showYAxis: source.showYAxis } : {}),
    ...(source.size !== undefined ? { size: source.size } : {}),
  };
}

/**
 * Synchroniseer state.dataPoints naar de actieve bron (manual of csv).
 * Aanroepen na elke tab-wissel of mutatie van manual/csvDataPoints.
 */
function syncDataPoints(state: ChartData): void {
  if (state.activeDataTab === 'csv') {
    state.dataPoints = cloneDataPoints(state.csvDataPoints || []);
  } else {
    state.dataPoints = cloneDataPoints(state.manualDataPoints || []);
  }
}

export const useChartStore = defineStore('chartEditor', () => {
  const state = reactive<ChartData>(cloneChartData(DEFAULT_CHART_DATA));

  // Strip dataPoints to the new chart-type's max whenever chartType changes.
  // Lives in the store so any mutation path (USelectMenu v-model, future
  // action, devtools) triggers the same strip.
  watch(
    () => state.chartType,
    (chartType) => {
      const max = getMaxDataPoints(chartType);
      if (state.manualDataPoints && state.manualDataPoints.length > max) {
        state.manualDataPoints = state.manualDataPoints.slice(0, max);
      }
      if (state.csvDataPoints && state.csvDataPoints.length > max) {
        state.csvDataPoints = state.csvDataPoints.slice(0, max);
      }
    },
  );

  /**
   * Overschrijf de volledige state met een nieuwe ChartData-payload.
   * Bevat migratie-logica voor oudere v0.3.0-states (manualDataPoints
   * wordt afgeleid uit dataPoints wanneer niet aanwezig).
   */
  function init(data: ChartData): void {
    // Strip eventuele legacy `badge`-velden van dataPoints vóór clone.
    const strippedPoints = data.dataPoints.map((p) => {
      const clean: DataPoint = { label: p.label, value: p.value };
      if (p.markering !== undefined) {
        clean.markering = p.markering;
      }
      return clean;
    });

    const hasManual = data.manualDataPoints !== undefined;
    const hasCsv = data.csvDataPoints !== undefined;

    const manualPoints = hasManual
      ? data.manualDataPoints!.map((p) => {
          const c: DataPoint = { label: p.label, value: p.value };
          if (p.markering !== undefined) {
            c.markering = p.markering;
          }
          return c;
        })
      : strippedPoints.map((p) => ({ ...p }));

    const csvPoints = hasCsv
      ? data.csvDataPoints!.map((p) => {
          const c: DataPoint = { label: p.label, value: p.value };
          if (p.markering !== undefined) {
            c.markering = p.markering;
          }
          return c;
        })
      : [];

    const activeTab = data.activeDataTab || 'manual';

    state.version = data.version;
    state.chartType = data.chartType;
    state.theme = data.theme;
    state.title = data.title;
    state.manualDataPoints = manualPoints;
    state.csvDataPoints = csvPoints;
    state.activeDataTab = activeTab;
    state.dataPoints =
      activeTab === 'csv' ? cloneDataPoints(csvPoints) : cloneDataPoints(manualPoints);
    state.valueFormat = data.valueFormat;
    state.showLegend = data.showLegend !== undefined ? data.showLegend : true;
    state.benchmark = data.benchmark;
    state.min = data.min;
    state.max = data.max;
    state.showBenchmarkDelta =
      data.showBenchmarkDelta !== undefined ? data.showBenchmarkDelta : false;
    state.csvSource = data.csvSource !== undefined ? cloneCsvSource(data.csvSource) : undefined;
    state.showYAxis = data.showYAxis !== undefined ? data.showYAxis : false;
    state.size = data.size !== undefined ? data.size : 'medium';
  }

  /** Wissel actieve data-tab + synchroniseer dataPoints direct. */
  function setActiveDataTab(tab: 'manual' | 'csv'): void {
    state.activeDataTab = tab;
    syncDataPoints(state);
  }

  /**
   * Diepe kopie voor het `update-graph`-bridge-bericht. Synchroniseert
   * dataPoints vóór klonen zodat de payload consistent is.
   */
  function toChartData(): ChartData {
    syncDataPoints(state);
    return cloneChartData(state);
  }

  return {
    state,
    init,
    setActiveDataTab,
    toChartData,
  };
});
