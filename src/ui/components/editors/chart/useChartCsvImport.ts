// ============================================================
// components/editors/chart/useChartCsvImport.ts
//
// CSV file-upload flow voor de chart-editor: lees het bestand,
// valideer chart-vormig (koprij + max 12 datarijen × 4 waarde-
// kolommen) via de gedeelde tokenizer, emit dan `import-csv` — de
// sandbox doet de echte parse + applyChart. Spiegel van
// table/useCsvImport.ts.
// ============================================================

import { ref, watch, onBeforeUnmount } from 'vue';
import { CHART_MAX_CATEGORIES, CHART_MAX_SERIES } from '../../../../shared/chart-calculations';
import { tokenize } from '../../../../shared/csv';
import { useNotifications } from '../../../stores/useNotifications';
import type { ChartWrapModel } from '../../../../shared/types';

function validateChartCSV(text: string): string {
  const rows = tokenize(text).rows;
  const nonEmpty = rows.filter((r) => r.some((c) => c.length > 0));
  if (nonEmpty.length === 0) return 'CSV is leeg.';
  if (nonEmpty.length === 1) {
    return 'CSV heeft geen datarijen (alleen een koprij).';
  }
  const dataRows = nonEmpty.length - 1;
  if (dataRows > CHART_MAX_CATEGORIES) {
    return `Maximum ${CHART_MAX_CATEGORIES} datarijen (+ koprij) — CSV heeft er ${dataRows}.`;
  }
  for (let i = 0; i < nonEmpty.length; i++) {
    const valueCols = nonEmpty[i].length - 1;
    if (valueCols > CHART_MAX_SERIES) {
      return `Rij ${i + 1}: ${valueCols} waarde-kolommen — max ${CHART_MAX_SERIES}.`;
    }
  }
  return '';
}

export function useChartCsvImport(
  props: { modelValue: ChartWrapModel },
  emit: (event: 'import-csv', csv: string) => void,
) {
  const notifications = useNotifications();

  const csvText = ref<string>('');
  const csvUploadFile = ref<File | null>(null);
  const csvError = ref<string>('');

  const lastImport = ref<{ fileName: string | null; rows: number; cols: number } | null>(null);
  let lastImportTimer: ReturnType<typeof setTimeout> | null = null;

  function clearLastImport(): void {
    lastImport.value = null;
    if (lastImportTimer !== null) {
      clearTimeout(lastImportTimer);
      lastImportTimer = null;
    }
  }

  function recordImport(text: string, fileName: string | null): void {
    const rows = tokenize(text).rows.filter((r) => r.some((c) => c.length > 0));
    const cols = rows.reduce((m, r) => (r.length > m ? r.length : m), 0);
    lastImport.value = { fileName, rows: Math.max(0, rows.length - 1), cols: Math.max(0, cols - 1) };
    if (lastImportTimer !== null) clearTimeout(lastImportTimer);
    lastImportTimer = setTimeout(clearLastImport, 10_000);
  }

  function applyCSV(fileName: string | null = null): void {
    const text = csvText.value.trim();
    if (text === '') return;
    const err = validateChartCSV(text);
    if (err !== '') {
      csvError.value = err;
      notifications.pushError('CSV-import mislukt', err);
      return;
    }
    csvError.value = '';
    emit('import-csv', text);
    recordImport(text, fileName);
    csvText.value = '';
  }

  function onCsvFileChange(file: File | null | undefined): void {
    if (file === null || file === undefined) return;
    clearLastImport();
    const reader = new FileReader();
    reader.onload = () => {
      csvText.value = String(reader.result !== null ? reader.result : '');
      applyCSV(file.name);
      csvUploadFile.value = null;
    };
    reader.readAsText(file);
  }

  watch(
    () => props.modelValue.slotId,
    () => {
      clearLastImport();
    },
  );

  watch(csvText, () => {
    if (csvError.value !== '') csvError.value = '';
  });

  onBeforeUnmount(() => {
    if (lastImportTimer !== null) clearTimeout(lastImportTimer);
  });

  return {
    csvUploadFile,
    csvError,
    lastImport,
    onCsvFileChange,
  };
}
