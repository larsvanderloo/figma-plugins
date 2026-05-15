<!--
  GraphsPanel — host for TableEditor.

  Render-matrix:
    - `view.state.graphs === null`              → empty-state (already filtered by App.vue, this component does not render then)
    - 1 instance                                → TableEditor direct (no selector)
    - 2+ instances                              → USelectMenu + TableEditor for the selected one
    - 0 instances                               → defensieve fallback met empty-copy
-->
<script setup lang="ts">
import { computed } from 'vue';
import TableEditor from './TableEditor.vue';
import { usePluginView } from '../stores/usePluginView';
import { useTableEditor } from '../composables/useTableEditor';

const view = usePluginView();
const tableEditor = useTableEditor();

const showSelector = computed<boolean>(() => tableEditor.instances.length >= 2);

/** USelectMenu-items — labels kort houden zodat de dropdown compact blijft. */
const selectorItems = computed(() => {
  return tableEditor.instances.map((inst, idx) => ({
    label: inst.label !== '' ? inst.label : `Table ${idx + 1}`,
    value: inst.nodeId,
  }));
});
</script>

<template>
  <div class="space-y-4">
    <!-- Empty-state defensief (App.vue filtert deze component normaal weg). -->
    <p v-if="tableEditor.instances.length === 0" class="text-sm text-muted">
      No tables on this slide.
    </p>

    <!-- Instance-selector: alleen bij 2+ instances -->
    <UFormField v-if="showSelector" name="graph-instance" label="Instance" size="lg">
      <USelectMenu
        v-model="tableEditor.selectedId"
        :items="selectorItems"
        value-key="value"
        size="lg"
        class="w-full"
      />
    </UFormField>

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
</template>
