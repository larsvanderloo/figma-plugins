// useTableEditor — binds the Graphs → Table instance(s) to the store + bridge.

import { computed, reactive } from 'vue';
import { usePluginView } from '../stores/usePluginView';
import { useBridgePending, usePluginBridge } from './usePluginBridge';
import type { GraphInstance, TableWrapModel } from '../../shared/types';

export function useTableEditor() {
  const view = usePluginView();
  const bridge = usePluginBridge();
  const tracker = useBridgePending(bridge);

  const instances = computed<GraphInstance[]>(() => view.state.graphs?.instances ?? []);

  const selectedId = computed<string>({
    get() {
      const g = view.state.graphs;
      return g !== null ? g.selectedGraphId : '';
    },
    set(id: string) {
      const g = view.state.graphs;
      if (g === null) return;
      g.selectedGraphId = id;
    },
  });

  const selected = computed<GraphInstance | null>(() => {
    const id = selectedId.value;
    if (id === '') return null;
    return instances.value.find((i) => i.nodeId === id) ?? null;
  });

  const model = computed<TableWrapModel | null>(() => selected.value?.tableModel ?? null);

  function update(next: TableWrapModel): void {
    const slideId = view.state.currentSlideId;
    const inst = selected.value;
    if (slideId === null || inst === null) return;

    inst.tableModel = next;

    tracker.register();
    bridge.post({
      type: 'update-table',
      slideId: slideId,
      slotId: next.slotId,
      desired: next,
    });
  }

  function importCsv(csv: string): void {
    const slideId = view.state.currentSlideId;
    const inst = selected.value;
    if (slideId === null || inst === null || inst.tableModel === null) return;

    tracker.register();
    bridge.post({
      type: 'import-csv',
      slideId: slideId,
      slotId: inst.tableModel.slotId,
      csv: csv,
    });
  }

  return reactive({
    instances,
    selectedId,
    selected,
    model,
    pending: tracker.pending,
    update,
    importCsv,
  });
}
