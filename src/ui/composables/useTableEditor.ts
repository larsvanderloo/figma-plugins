// useTableEditor — binds the Graphs → Table instance(s) to the store + bridge.

import { computed, reactive } from 'vue';
import { debugLog } from '../../shared/debug';
import {
  columnCalculationsEqual,
  columnEmphasisEqual,
  columnLabelsEqual,
} from '../../shared/table-calculations';
import { usePluginView } from '../stores/usePluginView';
import { useBridgePending, usePluginBridge } from './usePluginBridge';
import type { GraphInstance, TableWrapModel } from '../../shared/types';

function tableColumnCount(model: TableWrapModel): number {
  if (model.rows.length === 0) return 1;
  return model.rows[0].cells.length > 0 ? model.rows[0].cells.length : 1;
}

function tableSemanticsEqual(a: TableWrapModel | null, b: TableWrapModel): boolean {
  if (a === null) return false;
  if (a.slotId !== b.slotId) return false;
  if (a.hasColumnHeader !== b.hasColumnHeader) return false;
  if (a.rows.length !== b.rows.length) return false;
  if (!columnCalculationsEqual(a.columnCalculations, b.columnCalculations, tableColumnCount(b))) {
    return false;
  }
  if (
    !columnEmphasisEqual(
      a.columnCalculationEmphasis,
      b.columnCalculationEmphasis,
      tableColumnCount(b),
    )
  ) {
    return false;
  }
  if (
    !columnEmphasisEqual(
      a.columnCalculationCurrency,
      b.columnCalculationCurrency,
      tableColumnCount(b),
    )
  ) {
    return false;
  }
  if (
    !columnEmphasisEqual(
      a.columnCalculationPercent,
      b.columnCalculationPercent,
      tableColumnCount(b),
    )
  ) {
    return false;
  }
  if (
    !columnLabelsEqual(
      a.columnCalculationLabel,
      b.columnCalculationLabel,
      tableColumnCount(b),
    )
  ) {
    return false;
  }

  for (let i = 0; i < a.rows.length; i++) {
    const aCells = a.rows[i].cells;
    const bCells = b.rows[i].cells;
    if (aCells.length !== bCells.length) return false;
    for (let j = 0; j < aCells.length; j++) {
      if (aCells[j].value !== bCells[j].value) return false;
      if ((aCells[j].emphasis === true) !== (bCells[j].emphasis === true)) return false;
    }
  }

  return true;
}

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

    if (tableSemanticsEqual(inst.tableModel, next)) {
      debugLog('table-editor', 'skip-duplicate-update', {
        slotId: next.slotId,
        rows: next.rows.length,
        cols: next.rows.length > 0 ? next.rows[0].cells.length : 0,
      });
      return;
    }

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
