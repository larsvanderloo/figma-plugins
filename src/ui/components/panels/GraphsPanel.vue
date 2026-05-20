<script setup lang="ts">
import { computed } from 'vue';
import TableEditor from '../editors/TableEditor.vue';
import { usePluginView } from '../../stores/usePluginView';
import { useTableEditor } from '../../composables/useTableEditor';
import EditorWrapper from '../ui/EditorWrapper.vue';
import WCard from '../ui/WCard.vue';

const view = usePluginView();
const tableEditor = useTableEditor();

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
      v-if="tableEditor.instances.length === 0"
      icon="i-lucide-table"
      description="Geen tabellen op deze slide."
      variant="naked"
    />

    <EditorWrapper v-else title="Tabel" data-tour="tabel">
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
  </UContainer>
</template>
