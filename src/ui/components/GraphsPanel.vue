<!--
  GraphsPanel — host voor ChartEditor / TableEditor (T12, expanded per §12-Q1).

  Render-matrix:
    - `view.state.graphs === null`              → empty-state (wordt al door App.vue getoond, deze component wordt dan niet ge-rendered)
    - 1 instance, type 'chart'                  → ChartEditor direct (geen selector)
    - 1 instance, type 'table'                  → TableEditor direct (geen selector)
    - 2+ instances                              → USelectMenu + corresponderende editor
    - 0 instances                               → defensieve fallback met empty-copy

  useChartStore() wordt hier (her)geïnitialiseerd bij elke
  selectie-wissel wanneer de gekozen instance van type 'chart' is. Zo
  voorkomen we dat chart-state blijft hangen bij navigatie naar een
  andere chart of naar een table.

  TableEditor (T34.3) is v-model-gebonden: GraphsPanel krijgt
  `update:modelValue` + `import-csv` events binnen en vertaalt die naar
  `update-table` / `import-csv` bridge-messages. De lokale store wordt
  optimistisch bijgewerkt zodat de UI niet hoeft te wachten op een
  main-thread-echo.
-->
<script setup lang="ts">
import { computed, watch } from 'vue';
import ChartEditor from './ChartEditor.vue';
import TableEditor from './TableEditor.vue';
import { usePluginView } from '../stores/usePluginView';
import { usePluginBridge } from '../composables/usePluginBridge';
import { useChartStore } from '../stores/useChartStore';
import { DEFAULT_CHART_DATA } from '../../chart-core/constants';
import type { ChartData, GraphInstance, TableWrapModel } from '../../types';

const view = usePluginView();
const bridge = usePluginBridge();
const chartStore = useChartStore();

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
 * Niet-null tabel-model, alleen beschikbaar wanneer de selected-instance
 * een table is met een ingescande TableWrapModel. Dit verplaatst de
 * null-narrowing uit de template-expressie naar een computed zodat
 * volar/TS de prop-type (`TableWrapModel`) correct kan inferren.
 */
const tableModel = computed<TableWrapModel | null>(() => {
  const inst = selected.value;
  if (inst === null || inst.type !== 'table') return null;
  if (inst.tableModel === null || inst.tableModel === undefined) return null;
  return inst.tableModel;
});

/** USelectMenu-items — labels kort houden zodat de dropdown compact blijft. */
const selectorItems = computed(() => {
  return instances.value.map((inst, idx) => ({
    label:
      inst.label !== '' ? inst.label : `${inst.type === 'chart' ? 'Chart' : 'Table'} ${idx + 1}`,
    value: inst.nodeId,
  }));
});

/**
 * Bij elke selectie-wissel (of initial mount met een chart) de chart-store
 * opnieuw initialiseren met de pluginData van de betreffende ChartWrap. Zo
 * blijft de editor zuiver aan de gekozen instance gebonden en lekken geen
 * velden tussen instances door.
 */
watch(
  () => selected.value,
  (inst) => {
    if (inst === null) return;
    if (inst.type !== 'chart') return;
    const data =
      inst.chartData !== undefined && inst.chartData !== null ? inst.chartData : DEFAULT_CHART_DATA;
    chartStore.init(data as ChartData);
  },
  { immediate: true },
);

/**
 * Handler voor TableEditor's `update:modelValue`. Optimistische lokale
 * update van `selected.tableModel` houdt de UI consistent tussen
 * typ-ticks; de bridge-echo komt later als `target-updated`.
 */
function onTableUpdate(value: TableWrapModel): void {
  const slideId = view.state.currentSlideId;
  if (slideId === null) return;
  const inst = selected.value;
  if (inst === null || inst.type !== 'table') return;

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
  if (inst === null || inst.type !== 'table') return;
  if (inst.tableModel === null || inst.tableModel === undefined) return;

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
    <p v-if="instances.length === 0" class="text-sm text-muted">
      No graphs or tables on this slide.
    </p>

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

    <!-- Editor-routing op geselecteerd type. -->
    <template v-if="selected !== null">
      <ChartEditor
        v-if="selected.type === 'chart' && view.state.currentSlideId !== null"
        :chart-wrap-id="selected.nodeId"
        :slide-id="view.state.currentSlideId"
      />
      <TableEditor
        v-else-if="
          selected.type === 'table' && view.state.currentSlideId !== null && tableModel !== null
        "
        :model-value="tableModel"
        @update:model-value="onTableUpdate"
        @import-csv="onImportCSV"
      />
    </template>
  </div>
</template>
