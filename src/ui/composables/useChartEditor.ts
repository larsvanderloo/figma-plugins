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

  // update() schrijft de store optimistisch vóór het posten. Faalt de apply,
  // dan draagt de store al het nieuwe model terwijl de canvas het oude toont —
  // en de duplicate-guard zou een identieke hertyp dan tot de volgende rescan
  // wegslikken. Onthoud daarom per slot dat de laatste apply faalde en sla de
  // guard daar eenmalig over (zelfde luister-patroon als de overflow-listener
  // in useTableEditor). De store NIET terugrollen: dat vecht met de inputs
  // waar de gebruiker nog in typt.
  const guardBypass = new Set<string>();
  // Failure-acks dragen meestal géén targetId (zie handlers/chart.ts en de
  // catch in main.ts), dus we volgen zelf welke slots een update in-flight
  // hebben. Komt een failure zonder adres binnen, dan vlaggen we ze allemaal;
  // een failure uit een ander domein kan zo meeliften, maar dat kost hooguit
  // één overbodige re-apply.
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
