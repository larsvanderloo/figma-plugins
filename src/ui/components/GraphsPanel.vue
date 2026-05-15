<!--
  GraphsPanel — host for TableEditor.

  Render-matrix:
    - `view.state.graphs === null`              → empty-state (already filtered by App.vue, this component does not render then)
    - 1 instance                                → TableEditor direct (no selector)
    - 2+ instances                              → USelectMenu + TableEditor for the selected one
    - 0 instances                               → defensieve fallback met empty-copy

  TableEditor is v-model-gebonden: GraphsPanel krijgt `update:modelValue`
  + `import-csv` events binnen en vertaalt die naar `update-table` /
  `import-csv` bridge-messages. De lokale store wordt optimistisch
  bijgewerkt zodat de UI niet hoeft te wachten op een main-thread-echo.
-->
<script setup lang="ts">
import { computed } from 'vue';
import TableEditor from './TableEditor.vue';
import { usePluginView } from '../stores/usePluginView';
import { usePluginBridge } from '../composables/usePluginBridge';
import type { GraphInstance, TableWrapModel } from '../../types';

const view = usePluginView();
const bridge = usePluginBridge();

/** Instances lijst uit de store; `graphs` is hier altijd non-null (App.vue v-if). */
const instances = computed<GraphInstance[]>(() => {
  const g = view.state.graphs;
  return g !== null ? g.instances : [];
});

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
  const found = instances.value.find((i) => i.nodeId === id);
  return found !== undefined ? found : null;
});

const showSelector = computed<boolean>(() => instances.value.length >= 2);

/**
 * Niet-null tabel-model. Verplaatst de null-narrowing uit de
 * template-expressie naar een computed zodat volar/TS de prop-type
 * (`TableWrapModel`) correct kan inferren.
 */
const tableModel = computed<TableWrapModel | null>(() => {
  const inst = selected.value;
  if (inst === null) return null;
  return inst.tableModel;
});

/** USelectMenu-items — labels kort houden zodat de dropdown compact blijft. */
const selectorItems = computed(() => {
  return instances.value.map((inst, idx) => ({
    label: inst.label !== '' ? inst.label : `Table ${idx + 1}`,
    value: inst.nodeId,
  }));
});

/**
 * Handler voor TableEditor's `update:modelValue`. Optimistische lokale
 * update van `selected.tableModel` houdt de UI consistent tussen
 * typ-ticks; de bridge-echo komt later als `target-updated`.
 */
function onTableUpdate(value: TableWrapModel): void {
  const slideId = view.state.currentSlideId;
  if (slideId === null) return;
  const inst = selected.value;
  if (inst === null) return;

  // Local update — schrijf direct in de view-state zodat volgende typ-
  // ticks tegen de nieuwe canonical state valideren (geen flicker bij
  // rapid width-switches).
  inst.tableModel = value;

  bridge.post({
    type: 'update-table',
    slideId: slideId,
    slotId: value.slotId,
    desired: value,
  });
}

function onImportCSV(csv: string): void {
  const slideId = view.state.currentSlideId;
  if (slideId === null) return;
  const inst = selected.value;
  if (inst === null || inst.tableModel === null) return;

  bridge.post({
    type: 'import-csv',
    slideId: slideId,
    slotId: inst.tableModel.slotId,
    csv: csv,
  });
}
</script>

<template>
  <div class="space-y-4">
    <!-- Empty-state defensief (App.vue filtert deze component normaal weg). -->
    <p v-if="instances.length === 0" class="text-sm text-muted">No tables on this slide.</p>

    <!-- Instance-selector: alleen bij 2+ instances -->
    <UFormField v-if="showSelector" name="graph-instance" label="Instance" size="lg">
      <USelectMenu
        v-model="selectedId"
        :items="selectorItems"
        value-key="value"
        size="lg"
        class="w-full"
      />
    </UFormField>

    <TableEditor
      v-if="
        selected !== null && view.state.currentSlideId !== null && tableModel !== null
      "
      :model-value="tableModel"
      @update:model-value="onTableUpdate"
      @import-csv="onImportCSV"
    />
  </div>
</template>
