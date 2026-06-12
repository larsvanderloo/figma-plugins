// useChartEditor — binds the Graphs → Chart instance(s) to the store + bridge.

import { computed, reactive, ref, watch } from 'vue';
import { debugLog } from '../../shared/debug';
import { chartModelsEqual } from '../../shared/chart-calculations';
import { usePluginView } from '../stores/usePluginView';
import { useBridgePending, usePluginBridge } from './usePluginBridge';
import type { ChartWrapModel, GraphInstance } from '../../shared/types';

export function useChartEditor() {
  const view = usePluginView();
  const bridge = usePluginBridge();
  const tracker = useBridgePending(bridge);

  // T47: graphs.instances bevat tables én charts — filter op charts.
  const instances = computed<GraphInstance[]>(
    () => (view.state.graphs?.instances ?? []).filter((i) => i.chartModel != null),
  );

  // Eigen selectie-state (de gedeelde selectedGraphId stuurt de
  // table-sectie aan); default + resync naar de eerste chart-instance.
  const selectedId = ref<string>('');
  watch(
    instances,
    (next) => {
      if (next.length === 0) {
        selectedId.value = '';
        return;
      }
      const stillThere = next.some((i) => i.nodeId === selectedId.value);
      if (!stillThere) selectedId.value = next[0].nodeId;
    },
    { immediate: true },
  );

  const selected = computed<GraphInstance | null>(() => {
    if (selectedId.value === '') return null;
    return instances.value.find((i) => i.nodeId === selectedId.value) ?? null;
  });

  const model = computed<ChartWrapModel | null>(() => selected.value?.chartModel ?? null);

  function update(next: ChartWrapModel): void {
    const slideId = view.state.currentSlideId;
    const inst = selected.value;
    if (slideId === null || inst === null) return;

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

  return reactive({
    instances,
    selectedId,
    selected,
    model,
    pending: tracker.pending,
    update,
  });
}
