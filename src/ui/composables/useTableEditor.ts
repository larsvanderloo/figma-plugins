import { computed, onUnmounted, reactive, ref } from 'vue';
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
      // Without comparing delta, a pure delta edit is skipped as a duplicate
      // and never posted — the badge would only appear after a later value edit.
      const aDelta = typeof aCells[j].delta === 'string' ? aCells[j].delta : '';
      const bDelta = typeof bCells[j].delta === 'string' ? bCells[j].delta : '';
      if (aDelta !== bDelta) return false;
      // Same for check + badge: every canvas-rendered field must be compared
      // here, or a pure toggle/badge edit is dropped as a duplicate.
      if (aCells[j].check !== bCells[j].check) return false;
      const aBadge = typeof aCells[j].badge === 'string' ? aCells[j].badge : '';
      const bBadge = typeof bCells[j].badge === 'string' ? bCells[j].badge : '';
      if (aBadge !== bBadge) return false;
    }
  }

  return true;
}

export function useTableEditor() {
  const view = usePluginView();
  const bridge = usePluginBridge();
  const tracker = useBridgePending(bridge);

  // graphs.instances also carries chart instances; keep only tables.
  const instances = computed<GraphInstance[]>(
    () => (view.state.graphs?.instances ?? []).filter((i) => i.tableModel !== null),
  );

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

  // Set when the last render reported the table overflowing the slot even at
  // the minimum font (content clips); cleared by the next render that fits.
  const overflow = ref<boolean>(false);
  bridge.onMessage((msg) => {
    if (msg.type !== 'target-updated') return;
    const inst = selected.value;
    if (inst === null || inst.tableModel === null) return;
    if (msg.targetId !== inst.tableModel.slotId) return;
    overflow.value = msg.ok === true && msg.tableOverflow === true;
  });

  // Settle pass: while typing, the sandbox fast path writes text in place and
  // defers font-fit/column-autofit/padding; one full render on BLUR reconciles
  // that drift. Not on an idle timer — it fires mid-typing-pause and the ~215ms
  // render collides with the next keystroke. No tracker.register(): this is
  // background reconciliation, not a user action.
  let settleArmed = false;
  let settleFlushTimer: ReturnType<typeof setTimeout> | null = null;
  function fireSettle(): void {
    settleFlushTimer = null;
    if (!settleArmed) return;
    const slideId = view.state.currentSlideId;
    const inst = selected.value;
    if (slideId === null || inst === null || inst.tableModel === null) return;
    settleArmed = false;
    bridge.post({
      type: 'update-table',
      slideId: slideId,
      slotId: inst.tableModel.slotId,
      desired: inst.tableModel,
      settle: true,
    });
  }
  function onGridFocusOut(event: FocusEvent): void {
    if (!settleArmed) return;
    // Focus moved to another input → still editing; hold the settle.
    const next = event.relatedTarget;
    if (next instanceof HTMLElement && next.closest('textarea, input') !== null) return;
    // 250ms delay so the grid emit's 200ms debounce flushes first and the
    // settle renders the current model, not the previous keystroke.
    if (settleFlushTimer !== null) clearTimeout(settleFlushTimer);
    settleFlushTimer = setTimeout(fireSettle, 250);
  }
  document.addEventListener('focusout', onGridFocusOut);
  onUnmounted(() => {
    document.removeEventListener('focusout', onGridFocusOut);
    if (settleFlushTimer !== null) clearTimeout(settleFlushTimer);
  });

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
    // Possible fast-path drift now; the next grid blur reconciles with one
    // full render.
    settleArmed = true;
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
    overflow,
    pending: tracker.pending,
    update,
    importCsv,
  });
}
