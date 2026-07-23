// No chart-selection state: the Graphs tab renders every chart instance as its
// own editor card, and updates route by the slotId in the emitted model.

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

  // update() writes the store optimistically before posting; after a failed
  // apply the duplicate guard would swallow an identical retype until the next
  // rescan, so flag the failed slot and skip the guard there once. Never roll
  // the store back — that fights the inputs the user is still typing in.
  const guardBypass = new Set<string>();
  // Failure acks usually carry no targetId (handlers/chart.ts, the catch in
  // main.ts), so track in-flight slots ourselves; an unaddressed failure flags
  // them all — a foreign-domain failure costs at most one redundant re-apply.
  const inFlight: string[] = [];
  bridge.onMessage((msg) => {
    if (msg.type !== 'target-updated') return;
    if (msg.ok === true) {
      if (typeof msg.targetId === 'string') {
        const idx = inFlight.indexOf(msg.targetId);
        if (idx >= 0) inFlight.splice(idx, 1);
      }
      return;
    }
    if (typeof msg.targetId === 'string') {
      const idx = inFlight.indexOf(msg.targetId);
      if (idx >= 0) {
        inFlight.splice(idx, 1);
        guardBypass.add(msg.targetId);
      }
      return;
    }
    for (const slotId of inFlight) guardBypass.add(slotId);
    inFlight.length = 0;
  });

  function update(next: ChartWrapModel): void {
    const slideId = view.state.currentSlideId;
    if (slideId === null) return;
    const inst = instances.value.find((i) => i.chartModel?.slotId === next.slotId) ?? null;
    if (inst === null) return;

    if (!guardBypass.has(next.slotId) && chartModelsEqual(inst.chartModel ?? null, next)) {
      debugLog('chart-editor', 'skip-duplicate-update', {
        slotId: next.slotId,
        type: next.chartType,
      });
      return;
    }
    guardBypass.delete(next.slotId);

    inst.chartModel = next;

    tracker.register();
    inFlight.push(next.slotId);
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
