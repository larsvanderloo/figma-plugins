// ============================================================
// components/editors/table/useCsvImport.ts
//
// CSV file-upload flow for the table editor: read the dropped/
// picked file, validate it against TABLE_MAX_ROWS/TABLE_MAX_COLS
// using the shared tokenizer, then emit `import-csv` (the sandbox
// does the actual parse + apply). Tracks a transient "last import"
// summary for the success line under the upload zone.
// ============================================================

import { ref, watch, onBeforeUnmount } from 'vue';
import { TABLE_MAX_ROWS, TABLE_MAX_COLS } from '../../../../shared/constants';
import { tokenize } from '../../../../shared/csv';
import { useNotifications } from '../../../stores/useNotifications';
import type { TableEditorProps } from './useTableEditorState';

function validateCSV(text: string): string {
  const rows = tokenize(text).rows;
  const nonEmpty = rows.filter((r) => r.some((c) => c.length > 0));
  if (nonEmpty.length === 0) return 'CSV is leeg.';
  if (nonEmpty.length > TABLE_MAX_ROWS) {
    return `Maximum ${TABLE_MAX_ROWS} rijen — CSV heeft er ${nonEmpty.length}.`;
  }
  for (let i = 0; i < nonEmpty.length; i++) {
    const cellCount = nonEmpty[i].length;
    if (cellCount > TABLE_MAX_COLS) {
      return `Rij ${i + 1}: ${cellCount} kolommen — max ${TABLE_MAX_COLS}.`;
    }
  }
  return '';
}

export function useCsvImport(
  props: TableEditorProps,
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
    lastImport.value = { fileName, rows: rows.length, cols };
    if (lastImportTimer !== null) clearTimeout(lastImportTimer);
    lastImportTimer = setTimeout(clearLastImport, 10_000);
  }

  function applyCSV(fileName: string | null = null): void {
    const text = csvText.value.trim();
    if (text === '') return;
    const err = validateCSV(text);
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
