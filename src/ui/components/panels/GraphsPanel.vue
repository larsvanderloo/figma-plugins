<script setup lang="ts">
import { computed } from 'vue';
import TableEditor from '../editors/TableEditor.vue';
import { usePluginView } from '../../stores/usePluginView';
import { useTableEditor } from '../../composables/useTableEditor';

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
  <section class="space-y-4">
    <h2 class="text-base font-semibold text-highlighted px-1">
      {{ showSelector ? 'Tabellen' : 'Tabel' }}
    </h2>

    <UEmpty
      v-if="tableEditor.instances.length === 0"
      icon="i-lucide-table"
      description="Geen tabellen op deze slide."
      variant="naked"
    />

    <div class="space-y-4">
      <UCard v-if="showSelector">
        <UFormField name="graph-instance" label="Tabel">
          <USelectMenu
            v-model="tableEditor.selectedId"
            :items="selectorItems"
            value-key="value"
            class="w-full"
          />
        </UFormField>
      </UCard>

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
    </div>
  </section>
</template>
