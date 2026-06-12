<script setup lang="ts">
import { computed } from 'vue';
import TableEditor from '../editors/TableEditor.vue';
import ChartEditor from '../editors/ChartEditor.vue';
import { usePluginView } from '../../stores/usePluginView';
import { useTableEditor } from '../../composables/useTableEditor';
import { useChartEditor } from '../../composables/useChartEditor';
import EditorWrapper from '../ui/EditorWrapper.vue';
import WCard from '../ui/WCard.vue';

const view = usePluginView();
const tableEditor = useTableEditor();
const chartEditor = useChartEditor();

const showSelector = computed<boolean>(() => tableEditor.instances.length >= 2);
const showChartSelector = computed<boolean>(() => chartEditor.instances.length >= 2);
const chartSelectorItems = computed(() => {
  return chartEditor.instances.map((inst, idx) => ({
    label: inst.label !== '' ? inst.label : `Grafiek ${idx + 1}`,
    value: inst.nodeId,
  }));
});
const selectorItems = computed(() => {
  return tableEditor.instances.map((inst, idx) => ({
    label: inst.label !== '' ? inst.label : `Tabel ${idx + 1}`,
    value: inst.nodeId,
  }));
});
</script>

<template>
  <UContainer class="space-y-4">
    <UEmpty
      v-if="tableEditor.instances.length === 0 && chartEditor.instances.length === 0"
      icon="i-lucide-table"
      description="Geen tabellen of grafieken op deze slide."
      variant="naked"
    />

    <EditorWrapper v-if="tableEditor.instances.length > 0" title="Tabel" data-tour="tabel">
      <WCard v-if="showSelector" title="Selectie">
        <UFormField name="graph-instance" label="Tabel">
          <USelectMenu
            v-model="tableEditor.selectedId"
            :items="selectorItems"
            value-key="value"
            class="w-full"
          />
        </UFormField>
      </WCard>

      <TableEditor
        v-if="
          tableEditor.selected !== null &&
          view.state.currentSlideId !== null &&
          tableEditor.model !== null
        "
        :model-value="tableEditor.model"
        @update:model-value="tableEditor.update"
        @import-csv="tableEditor.importCsv"
      />
    </EditorWrapper>

    <EditorWrapper v-if="chartEditor.instances.length > 0" title="Grafiek" data-tour="grafiek">
      <WCard v-if="showChartSelector" title="Selectie">
        <UFormField name="chart-instance" label="Grafiek">
          <USelectMenu
            v-model="chartEditor.selectedId"
            :items="chartSelectorItems"
            value-key="value"
            class="w-full"
          />
        </UFormField>
      </WCard>

      <ChartEditor
        v-if="
          chartEditor.selected !== null &&
          view.state.currentSlideId !== null &&
          chartEditor.model !== null
        "
        :model-value="chartEditor.model"
        @update:model-value="chartEditor.update"
        @import-csv="chartEditor.importCsv"
      />
    </EditorWrapper>
  </UContainer>
</template>
