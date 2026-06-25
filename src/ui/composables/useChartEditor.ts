// useChartEditor — binds the Graphs → Chart instance(s) to the store + bridge.
//
// Geen selectie-state meer: de Graphs-tab toont ALLE chart-
// instances als eigen editor-cards; updates routeren op het slotId in
// het ge-emitte model.

import { computed, reactive } from 'vue';
import { debugLog } from '../../shared/debug';
import { chartModelsEqual } from '../../shared/chart-calculations';
import { usePluginView } from '../stores/usePluginView';
import { useBridgePending, usePluginBridge } from './usePluginBridge';
import type { ChartWrapModel, GraphInstance } from '../../shared/types';

export function useChartEditor() {
  const view = usePluginView();
  const bridge = usePluginBridge();
  const tracker = useBridgePending(bridge);

  const instances = computed<GraphInstance[]>(
    () => (view.state.graphs?.instances ?? []).filter((i) => i.chartModel != null),
  );

  function update(next: ChartWrapModel): void {
    const slideId = view.state.currentSlideId;
    if (slideId === null) return;
    const inst = instances.value.find((i) => i.chartModel?.slotId === next.slotId) ?? null;
    if (inst === null) return;

    if (chartModelsEqual(inst.chartModel ?? null, next)) {
      debugLog('chart-editor', 'skip-duplicate-update', {
        slotId: next.slotId,
        type: next.chartType,
      });
      return;
    }

    inst.chartModel = next;

    tracker.register();
    bridge.post({
      type: 'update-chart',
      slideId: slideId,
      slotId: next.slotId,
      desired: next,
    });
  }

  function importCsvFor(slotId: string, csv: string): void {
    const slideId = view.state.currentSlideId;
    if (slideId === null || slotId === '') return;

    tracker.register();
    bridge.post({
      type: 'import-chart-csv',
      slideId: slideId,
      slotId: slotId,
      csv: csv,
    });
  }

  return reactive({
    instances,
    pending: tracker.pending,
    update,
    importCsvFor,
  });
}
