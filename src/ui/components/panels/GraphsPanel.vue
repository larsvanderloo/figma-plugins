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
      <template v-for="(inst, idx) in chartEditor.instances" :key="inst.nodeId">
        <p
          v-if="chartEditor.instances.length > 1"
          class="text-sm font-semibold text-default"
        >
          {{ inst.label !== '' ? inst.label : `Grafiek ${idx + 1}` }}
        </p>
        <ChartEditor
          v-if="inst.chartModel != null && view.state.currentSlideId !== null"
          :model-value="inst.chartModel"
          @update:model-value="chartEditor.update"
          @import-csv="(csv: string) => chartEditor.importCsvFor(inst.chartModel!.slotId, csv)"
        />
      </template>
    </EditorWrapper>
  </UContainer>
</template>
