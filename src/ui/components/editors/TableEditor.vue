<script setup lang="ts">
import type { TableWrapModel } from '../../../shared/types';
import { TABLE_MAX_ROWS, TABLE_MAX_COLS } from '../../../shared/constants';
import { useTableEditorState } from './table/useTableEditorState';
import { useTableMutations } from './table/useTableMutations';
import { useCsvImport } from './table/useCsvImport';
import TableGrid from './table/TableGrid.vue';
import WCard from '../ui/WCard.vue';

interface Props {
  modelValue: TableWrapModel;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: TableWrapModel];
  'import-csv': [csv: string];
}>();

const state = useTableEditorState(props, emit);
const {
  localHasColumnHeader,
  localRows,
  localColumnCalculations,
  localColumnCalculationEmphasis,
  localColumnCalculationCurrency,
  localColumnCalculationPercent,
  currentCols,
} = state;

const {
  gridStatus,
  setHasColumnHeader,
  updateCell,
  setCellEmphasis,
  setColumnCalculation,
  setColumnCalculationEmphasis,
  setColumnCalculationCurrency,
  setColumnCalculationPercent,
  insertRowBefore,
  insertRowAfter,
  removeRow,
  insertColumnBefore,
  insertColumnAfter,
  removeColumn,
  moveRow,
  moveColumn,
  pasteMatrix,
} = useTableMutations(state);

const { csvUploadFile, csvError, lastImport, onCsvFileChange } = useCsvImport(props, emit);
</script>

<template>
  <WCard>
    <div class="flex items-center gap-3">
      <span class="text-xs text-muted">{{ localRows.length }} / {{ TABLE_MAX_ROWS }} rijen</span>
      <span class="text-xs text-muted">{{ currentCols }} / {{ TABLE_MAX_COLS }} kolommen</span>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <div class="flex items-center gap-2">
        <span class="text-sm font-semibold text-default">Koprij</span>
        <USwitch
          :model-value="localHasColumnHeader"
          aria-label="Koprij tonen"
          size="xs"
          @update:model-value="(v: boolean) => setHasColumnHeader(v)"
        />
      </div>
    </div>

    <TableGrid
      :rows="localRows"
      :has-column-header="localHasColumnHeader"
      :column-calculations="localColumnCalculations"
      :column-calculation-emphasis="localColumnCalculationEmphasis"
      :column-calculation-currency="localColumnCalculationCurrency"
      :column-calculation-percent="localColumnCalculationPercent"
      :max-rows="TABLE_MAX_ROWS"
      :max-cols="TABLE_MAX_COLS"
      @cell-edit="updateCell"
      @cell-style="setCellEmphasis"
      @column-calculation="setColumnCalculation"
      @column-calculation-emphasis="setColumnCalculationEmphasis"
      @column-calculation-currency="setColumnCalculationCurrency"
      @column-calculation-percent="setColumnCalculationPercent"
      @add-row-before="insertRowBefore"
      @add-row-after="insertRowAfter"
      @remove-row="removeRow"
      @add-column-before="insertColumnBefore"
      @add-column-after="insertColumnAfter"
      @remove-column="removeColumn"
      @move-row="moveRow"
      @move-column="moveColumn"
      @paste-matrix="pasteMatrix"
    />

    <div class="sr-only" aria-live="polite">{{ gridStatus }}</div>

    <USeparator />

    <UFileUpload
      v-model="csvUploadFile"
      accept=".csv,text/csv"
      icon="i-lucide-folder-plus"
      label="Sleep je CSV hier of klik om te bladeren"
      :description="`Max ${TABLE_MAX_ROWS} rijen · ${TABLE_MAX_COLS} kolommen.`"
      color="neutral"
      :preview="false"
      reset
      @update:model-value="onCsvFileChange"
    >
      <template #actions="{ open }">
        <UButton color="neutral" variant="outline" @click.stop.prevent="open()">
          Bestand kiezen
        </UButton>
      </template>
    </UFileUpload>

    <div v-if="csvError !== ''" class="text-xs text-error">{{ csvError }}</div>
    <div
      v-else-if="lastImport !== null"
      class="flex min-w-0 items-center gap-1.5 text-xs text-success"
    >
      <UIcon name="i-lucide-check" class="size-3.5 shrink-0" aria-hidden="true" />
      <span class="truncate">
        Geïmporteerd<template v-if="lastImport.fileName">: {{ lastImport.fileName }}</template>
        · {{ lastImport.rows }} {{ lastImport.rows === 1 ? 'rij' : 'rijen' }}
        · {{ lastImport.cols }} {{ lastImport.cols === 1 ? 'kolom' : 'kolommen' }}
      </span>
    </div>
    <div v-else class="text-xs text-muted">
      Max {{ TABLE_MAX_ROWS }} rijen · {{ TABLE_MAX_COLS }} kolommen.
    </div>
  </WCard>
</template>
