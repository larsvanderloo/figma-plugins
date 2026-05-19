<!--
  TableEditor — v-model-gebonden editor voor één TableWrap-instance
  (spec §13 T34.3 + T34.5, v0.2.0 Slot-based).

  Props:   modelValue: TableWrapModel
  Emits:   update:modelValue (debounced 200ms), import-csv (direct).

  - Width-picker (sm/md/lg, 3 knoppen). TextSize-picker is per T39.2
    verwijderd — fontSize wordt nu rendertime afgeleid uit slot.height +
    rows.length (zie editors/table/renderer.ts:getFontSizes).
  - Uniforme grid: alle rijen hebben dezelfde kolom-count (rij 0 dicteert).
    Globale "Rij toevoegen" + "Kolom toevoegen" onderaan; per-rij ×-knop
    en per-cell ×-knop voor verwijderen. Rij-add disabled bij
    TABLE_MAX_ROWS, kolom-add bij TABLE_MAX_COLS[width].
  - Ragged-data van de scan wordt bij hydration genormaliseerd door
    korte rijen te padden tot maxLen.
  - CSV-sectie: textarea + Toepassen met client-side validation.
  - Empty-state bij rows.length === 0 (CTA-placeholder).
  - Granulaire watches (T30-pattern) met `!== local`-guards zodat een
    debounced-echo nooit de in-progress typ-state overschrijft.
-->
<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import type { TableWrapModel, TableRowModel, TableCellModel } from '../../../types';
import { TABLE_MAX_ROWS, TABLE_MAX_COLS, TABLE_WIDTHS } from '../../../constants';
import { tokenize } from '../../../csv';
import { useNotifications } from '../../stores/useNotifications';
import WInput from '../ui/WInput.vue';
import WCard from '../ui/WCard.vue';
import WInsetPanel from '../ui/WInsetPanel.vue';

const notifications = useNotifications();

interface Props {
  modelValue: TableWrapModel;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: TableWrapModel];
  'import-csv': [csv: string];
}>();

type SizeKey = 'sm' | 'md' | 'lg';

const SIZE_OPTIONS: Array<{ value: SizeKey; label: string }> = [
  { value: 'sm', label: 'Klein' },
  { value: 'md', label: 'Middel' },
  { value: 'lg', label: 'Groot' },
];

// Lokale reactieve kopie (deep clone) — typ-snelheid niet afgeknepen
// door debounce. Tegelijk normaliseren we ragged rows (verschillende
// cell-counts per rij) tot een uniforme grid: korte rijen worden
// gepadeerd met lege placeholder-cells tot de max-cell-count.
function cloneRows(rows: TableRowModel[]): TableRowModel[] {
  let maxLen = 0;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].cells.length > maxLen) maxLen = rows[i].cells.length;
  }
  const out: TableRowModel[] = [];
  for (let i = 0; i < rows.length; i++) {
    const cells: TableCellModel[] = [];
    for (let j = 0; j < rows[i].cells.length; j++) {
      cells.push({
        cellNodeId: rows[i].cells[j].cellNodeId,
        value: rows[i].cells[j].value,
      });
    }
    while (cells.length < maxLen) cells.push({ cellNodeId: '', value: '' });
    out.push({ rowNodeId: rows[i].rowNodeId, cells: cells });
  }
  return out;
}

// Truncation-heuristiek (UI-side schatting; geen round-trip naar main).
// Spiegel renderer.ts T42.21 fontSize-ranges grof; doel is een waarschuwing
// te tonen, niet een precies match.
function estimateRowTruncation(
  row: TableRowModel,
  width: SizeKey,
  cellCount: number,
  rowCount: number,
  textSize: SizeKey,
): boolean {
  const containerWidth = TABLE_WIDTHS[width];
  const cellWidth =
    (containerWidth - 64 - (Math.max(cellCount, 1) - 1) * 56) / Math.max(cellCount, 1);
  const ASSUMED_SLOT_HEIGHT = 600;
  const rowHeight = (ASSUMED_SLOT_HEIGHT - 48) / Math.max(rowCount, 1);

  const config =
    textSize === 'sm'
      ? { mult: 0.55, bodyMax: 16 }
      : textSize === 'lg'
        ? { mult: 1.3, bodyMax: 36 }
        : { mult: 1.0, bodyMax: 24 };
  const fs = Math.min(config.bodyMax, Math.round(rowHeight * 0.3 * config.mult));

  const charsPerLine = cellWidth / (fs * 0.55);
  const maxLines = Math.floor((rowHeight - 56) / (fs * 1.4));
  const safeChars = Math.max(charsPerLine * Math.max(maxLines, 1), 10);

  return row.cells.some((c) => c.value.length > safeChars);
}

const localWidth = ref<SizeKey>(props.modelValue.width);
const localTextSize = ref<SizeKey>(props.modelValue.textSize);
const localHasColumnHeader = ref<boolean>(props.modelValue.hasColumnHeader);
const localRows = ref<TableRowModel[]>(cloneRows(props.modelValue.rows));

const maxCols = computed<number>(() => TABLE_MAX_COLS[localWidth.value]);
const canAddRow = computed<boolean>(() => localRows.value.length < TABLE_MAX_ROWS);
// Uniforme grid-aanname: rij 0 dicteert kolom-count voor alle rijen.
const currentCols = computed<number>(() =>
  localRows.value.length > 0 ? localRows.value[0].cells.length : 0,
);
const canAddColumn = computed<boolean>(
  () => localRows.value.length > 0 && currentCols.value < maxCols.value,
);

// T44.11 (perf): bodyRows-slice vervangen door render-tijd offset.
// Vorige aanpak (slice(1) of slice()) leverde altijd een NIEUWE array-ref
// op bij een toggle, wat Vue's v-for forceerde een full keyed-diff te
// doen over ALLE body-rijen + UInputs IN HETZELFDE FRAME als Reka's
// CollapsibleContent z'n height-measurement deed → bottleneck-bottleneck
// botsing → trage open-animation. Met offset-iteratie blijft de
// localRows-array-ref stabiel; Vue diff is een no-op als alleen de
// v-if op rij 0 wijzigt.
const bodyRowOffset = computed<number>(() => (localHasColumnHeader.value ? 1 : 0));

// T44.11 (perf): truncation-checks gememoiseerd ipv N+1 per-render
// function-calls. truncationFlags.body[idx] indexeert in localRows direct;
// alleen de via v-if zichtbare body-rows raadplegen hun flag.
const truncationFlags = computed<{ header: boolean; body: boolean[] }>(() => {
  const w = localWidth.value;
  const ts = localTextSize.value;
  const cc = currentCols.value;
  const rc = localRows.value.length;
  const header =
    localHasColumnHeader.value && rc > 0
      ? estimateRowTruncation(localRows.value[0], w, cc, rc, ts)
      : false;
  const body: boolean[] = [];
  for (let i = 0; i < localRows.value.length; i++) {
    body.push(estimateRowTruncation(localRows.value[i], w, cc, rc, ts));
  }
  return { header: header, body: body };
});

// Granulaire watches (T30-pattern) met `!== local`-guards.
watch(
  () => props.modelValue.width,
  (next) => {
    if (next !== localWidth.value) localWidth.value = next;
  },
);

watch(
  () => props.modelValue.hasColumnHeader,
  (next) => {
    if (next !== localHasColumnHeader.value) localHasColumnHeader.value = next;
  },
);

watch(
  () => props.modelValue.textSize,
  (next) => {
    if (next !== localTextSize.value) localTextSize.value = next;
  },
);

/** Structurele diff op row/cell-count, rowNodeId, cellNodeId en value. */
function rowsDiffer(a: TableRowModel[], b: TableRowModel[]): boolean {
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i++) {
    if (a[i].cells.length !== b[i].cells.length) return true;
    if (a[i].rowNodeId !== b[i].rowNodeId) return true;
    for (let j = 0; j < a[i].cells.length; j++) {
      if (a[i].cells[j].value !== b[i].cells[j].value) return true;
      if (a[i].cells[j].cellNodeId !== b[i].cells[j].cellNodeId) return true;
    }
  }
  return false;
}

// Echo-guard: na een eigen emit landt er via documentchange + scanSlide
// een slide-loaded met een MOGELIJK GESHRINKTE rows-array (T41.2 filter
// dropt all-empty body rows in canvas-render, en scan leest uit canvas).
// Zonder guard zou de watch hierboven localRows replacen met de canvas-
// view en zo een net-toegevoegde lege kolom of rij wegklokken voordat
// de user kon typen. We negeren incoming watches binnen 2s na emit;
// foreign edits in dat venster zijn een geaccepteerd UX-cost (zeldzaam,
// next slide-loaded ná het venster pickt ze alsnog op).
let echoExpected = false;
let echoResetTimer: ReturnType<typeof setTimeout> | null = null;

watch(
  () => props.modelValue.rows,
  (next) => {
    if (echoExpected) return;
    if (rowsDiffer(next, localRows.value)) localRows.value = cloneRows(next);
  },
);

// Debounced emit (200ms na laatste keystroke).
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleEmit(): void {
  if (debounceTimer !== null) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    echoExpected = true;
    if (echoResetTimer !== null) clearTimeout(echoResetTimer);
    echoResetTimer = setTimeout(() => {
      echoExpected = false;
      echoResetTimer = null;
    }, 2000);
    emit('update:modelValue', {
      slotId: props.modelValue.slotId,
      width: localWidth.value,
      hasColumnHeader: localHasColumnHeader.value,
      textSize: localTextSize.value,
      rows: cloneRows(localRows.value),
    });
  }, 200);
}

onBeforeUnmount(() => {
  if (debounceTimer !== null) clearTimeout(debounceTimer);
  if (lastImportTimer !== null) clearTimeout(lastImportTimer);
  if (echoResetTimer !== null) clearTimeout(echoResetTimer);
});

// Handlers
function setWidth(w: SizeKey): void {
  if (localWidth.value === w) return;
  localWidth.value = w;
  scheduleEmit();
}

function setHasColumnHeader(v: boolean): void {
  if (localHasColumnHeader.value === v) return;
  localHasColumnHeader.value = v;
  scheduleEmit();
}

function setTextSize(s: SizeKey): void {
  if (localTextSize.value === s) return;
  localTextSize.value = s;
  scheduleEmit();
}

function onWidthChange(value: string | number | undefined): void {
  if (value === 'sm' || value === 'md' || value === 'lg') setWidth(value);
}

function onTextSizeChange(value: string | number | undefined): void {
  if (value === 'sm' || value === 'md' || value === 'lg') setTextSize(value);
}

function addRow(): void {
  if (!canAddRow.value) return;
  // Nieuwe rij matcht huidige kolom-count (geclampt op maxCols); 1 cel
  // bij volstrekt lege tabel zodat de gebruiker iets kan typen.
  const cellCount = currentCols.value > 0 ? Math.min(currentCols.value, maxCols.value) : 1;
  const cells: TableCellModel[] = [];
  for (let j = 0; j < cellCount; j++) cells.push({ cellNodeId: '', value: '' });
  localRows.value.push({ rowNodeId: '', cells: cells });
  scheduleEmit();
}

function removeRow(i: number): void {
  if (i < 0 || i >= localRows.value.length) return;
  localRows.value.splice(i, 1);
  scheduleEmit();
}

function addColumn(): void {
  // Globaal: voegt 1 cell toe aan ELKE rij — uniformiteit-garantie.
  if (!canAddColumn.value) return;
  for (let i = 0; i < localRows.value.length; i++) {
    localRows.value[i].cells.push({ cellNodeId: '', value: '' });
  }
  scheduleEmit();
}

function removeColumn(j: number): void {
  if (j < 0 || j >= currentCols.value) return;
  for (let i = 0; i < localRows.value.length; i++) {
    if (j < localRows.value[i].cells.length) {
      localRows.value[i].cells.splice(j, 1);
    }
  }
  scheduleEmit();
}

function updateCell(i: number, j: number, value: string): void {
  const row = localRows.value[i];
  if (row === undefined) return;
  const cell = row.cells[j];
  if (cell === undefined || cell.value === value) return;
  // T42.16: input-cap verwijderd — truncation gebeurt rendertime in
  // renderer.ts op basis van actuele row.height. Data is unlimited.
  cell.value = value;
  scheduleEmit();
}

// CSV-import — client-side validate + emit (in modal sinds T39.3)
const csvText = ref<string>('');
const csvUploadFile = ref<File | null>(null);
const csvError = ref<string>('');

function validateCSV(text: string): string {
  // Tokenize via the shared RFC 4180-aware module so quoted cells
  // (e.g. `"Acme, Inc.",100`) are counted as one column, not three.
  // Sandbox `importCSV` uses the exact same tokenizer, so what passes
  // validation here is what gets applied there — no drift.
  const rows = tokenize(text).rows;
  // Drop fully-empty rows for counting (same shape as importCSV).
  const nonEmpty = rows.filter((r) => r.some((c) => c.length > 0));
  if (nonEmpty.length === 0) return 'CSV is leeg.';
  if (nonEmpty.length > TABLE_MAX_ROWS) {
    return `Maximum ${TABLE_MAX_ROWS} rijen — CSV heeft er ${nonEmpty.length}.`;
  }
  for (let i = 0; i < nonEmpty.length; i++) {
    const cellCount = nonEmpty[i].length;
    if (cellCount > maxCols.value) {
      return `Rij ${i + 1}: ${cellCount} kolommen — max ${maxCols.value} bij breedte ${localWidth.value}.`;
    }
  }
  return '';
}

/**
 * Inline confirmation shown below the drop zone after a successful
 * import. The drop zone itself is stateless (always says "Sleep je
 * CSV hier of klik om te bladeren"), so without this line the user
 * gets no visible acknowledgement that the upload worked beyond the
 * auto-dismissing toast. Cleared when a new upload starts, the slot
 * id changes (slide swap), or 10s elapses.
 */
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
    // Toast surfaces the failure immediately; inline `csvError`
    // persists below the textarea so the user can keep reading it
    // while editing the CSV (toast auto-dismisses).
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

// Slot id changes ⇒ slide swap ⇒ clear the previous slide's summary.
watch(
  () => props.modelValue.slotId,
  () => {
    clearLastImport();
  },
);

watch(csvText, () => {
  if (csvError.value !== '') csvError.value = '';
});
</script>

<template>
  <WCard title="Weergave">
    <div class="space-y-4">
      <UFormField name="table-width" label="Breedte" size="md">
        <URadioGroup
          :model-value="localWidth"
          :items="SIZE_OPTIONS"
          value-key="value"
          variant="table"
          orientation="horizontal"
          indicator="hidden"
          size="sm"
          :ui="{
            fieldset: 'grid grid-cols-3',
            item: 'justify-center',
            label: 'w-full text-center',
          }"
          @update:model-value="onWidthChange"
        />
      </UFormField>
      <UFormField name="table-text-size" label="Tekstgrootte" size="md">
        <URadioGroup
          :model-value="localTextSize"
          :items="SIZE_OPTIONS"
          value-key="value"
          variant="card"
          orientation="horizontal"
          indicator="hidden"
          size="sm"
          :ui="{
            fieldset: 'grid grid-cols-3 gap-2',
            item: 'p-0 overflow-hidden',
            wrapper: 'w-full',
            label: 'w-full cursor-pointer',
          }"
          @update:model-value="onTextSizeChange"
        >
          <template #label="{ item }">
            <span
              class="flex flex-col items-center gap-1 px-3 py-2 transition-colors"
              :class="
                localTextSize === item.value
                  ? 'bg-primary/5 text-primary'
                  : 'bg-default text-default hover:bg-elevated'
              "
            >
              <span
                class="font-semibold"
                :class="item.value === 'sm' ? 'text-xs' : item.value === 'lg' ? 'text-xl' : 'text-base'"
              >Aa</span>
              <span class="text-xs text-muted">{{ item.label }}</span>
            </span>
          </template>
        </URadioGroup>
      </UFormField>
    </div>
  </WCard>

  <WCard title="Rijen &amp; kolommen">
    <template #actions>
      <div class="flex items-center gap-3">
        <span class="text-xs text-muted">{{ localRows.length }} / {{ TABLE_MAX_ROWS }} rijen</span>
        <span class="text-xs text-muted">{{ currentCols }} / {{ maxCols }} kolommen</span>
      </div>
    </template>

    <div class="space-y-3">
      <UEmpty
        v-if="localRows.length === 0"
        icon="i-lucide-table"
        description="Tabel is leeg — voeg een rij toe om te starten."
        variant="naked"
        size="sm"
      >
        <template #actions>
          <UButton color="neutral" variant="soft" icon="i-lucide-plus" size="md" @click="addRow">
            Eerste rij toevoegen
          </UButton>
        </template>
      </UEmpty>

      <template v-else>
        <div class="space-y-2">
          <span class="text-xs font-medium text-muted">Kolommen</span>
          <div class="flex flex-wrap items-center gap-2">
            <UButton
              v-for="j in currentCols"
              :key="'colchip-' + j"
              color="neutral"
              variant="subtle"
              size="xs"
              trailing-icon="i-lucide-x"
              :aria-label="`Verwijder kolom ${j}`"
              @click="removeColumn(j - 1)"
              >Kolom {{ j }}</UButton
            >
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              icon="i-lucide-plus"
              :disabled="!canAddColumn"
              @click="addColumn"
              >Kolom toevoegen</UButton
            >
          </div>
        </div>

        <div class="space-y-3">
          <!-- Kolomkop-sectie (T44.2): aparte collapsible card boven body-rijen.
               Toggle aan = cells expanded; uit = enkel banner zichtbaar.
               Visueel identiek aan body-rijen — toggle is de enige ON-indicator. -->
          <WInsetPanel
            :body-separated="false"
            :body-padded="false"
          >
            <template #title>
              <div class="flex items-center gap-2">
                <span class="text-sm font-semibold text-default">Koprij</span>
                <UBadge
                  v-if="truncationFlags.header"
                  color="secondary"
                  variant="soft"
                  size="md"
                  icon="i-lucide-alert-triangle"
                  aria-label="Tekst afgebroken"
                />
              </div>
            </template>

            <template #actions>
              <USwitch
                :model-value="localHasColumnHeader"
                size="xs"
                @update:model-value="(v: boolean) => setHasColumnHeader(v)"
              />
            </template>

            <UCollapsible :open="localHasColumnHeader">
              <template #content>
                <div
                  v-if="localRows.length > 0"
                  class="bg-elevated"
                >
                  <USeparator />
                  <div class="space-y-2 px-4 py-3">
                    <div
                      v-for="(cell, j) in localRows[0].cells"
                      :key="cell.cellNodeId !== '' ? cell.cellNodeId : 'kolomkop-' + j"
                      class="grid grid-cols-[80px_1fr] items-center gap-3"
                    >
                      <span class="text-xs font-medium text-muted">Kolom {{ j + 1 }}</span>
                      <WInput
                        :model-value="cell.value"
                        :placeholder="`Waarde voor kolom ${j + 1}`"
                        size="sm"
                        @update:model-value="(v: string) => updateCell(0, j, v)"
                      />
                    </div>
                  </div>
                </div>
              </template>
            </UCollapsible>
          </WInsetPanel>

          <!-- Body-rijen: altijd genummerd "Rij 1, Rij 2, ..." onafhankelijk van toggle.
               T44.11: itereert over localRows direct (geen slice → stabiele array-ref).
               v-if skipt rij 0 wanneer die als kolomkop dient. -->
          <template
            v-for="(row, idx) in localRows"
            :key="row.rowNodeId !== '' ? row.rowNodeId : 'row-' + idx"
          >
            <WInsetPanel
              v-if="idx >= bodyRowOffset"
            >
              <template #title>
                <div class="flex items-center gap-2">
                  <span class="text-sm font-semibold text-default"
                    >Rij {{ idx + 1 - bodyRowOffset }}</span
                  >
                  <UBadge
                    v-if="truncationFlags.body[idx]"
                    color="secondary"
                    variant="soft"
                    size="md"
                    icon="i-lucide-alert-triangle"
                    aria-label="Tekst afgebroken"
                  />
                </div>
              </template>

              <template #actions>
                <UButton
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-x"
                  size="xs"
                  :aria-label="`Verwijder rij ${idx + 1 - bodyRowOffset}`"
                  @click="removeRow(idx)"
                />
              </template>

              <div
                v-for="(cell, j) in row.cells"
                :key="cell.cellNodeId !== '' ? cell.cellNodeId : 'row-' + idx + '-' + j"
                class="grid grid-cols-[80px_1fr] items-center gap-3"
              >
                <span class="text-xs font-medium text-muted">Kolom {{ j + 1 }}</span>
                <WInput
                  :model-value="cell.value"
                  :placeholder="`Waarde voor kolom ${j + 1}`"
                  size="sm"
                  @update:model-value="(v: string) => updateCell(idx, j, v)"
                />
              </div>
            </WInsetPanel>
          </template>
          <UButton
            color="neutral"
            variant="subtle"
            icon="i-lucide-plus"
            size="md"
            :disabled="!canAddRow"
            block
            @click="addRow"
            >Rij toevoegen</UButton
          >
        </div>
      </template>
    </div>
  </WCard>

  <WCard title="CSV importeren">
    <div class="space-y-3">
      <UFileUpload
        v-model="csvUploadFile"
        accept=".csv,text/csv"
        icon="i-lucide-folder-plus"
        label="Sleep je CSV hier of klik om te bladeren"
        :description="`Max ${TABLE_MAX_ROWS} rijen · ${maxCols} kolommen bij breedte ${localWidth}.`"
        color="neutral"
        size="md"
        :preview="false"
        reset
        :ui="{ base: 'py-6' }"
        @update:model-value="onCsvFileChange"
      >
        <template #actions="{ open }">
          <UButton color="neutral" variant="outline" size="sm" @click.stop.prevent="open()">
            Bestand kiezen
          </UButton>
        </template>
      </UFileUpload>

      <div v-if="csvError !== ''" class="text-xs text-error">{{ csvError }}</div>
      <div v-else-if="lastImport !== null" class="flex items-center gap-1.5 text-xs text-success">
        <UIcon name="i-lucide-check" class="size-3.5 shrink-0" />
        <span>
          Geïmporteerd<template v-if="lastImport.fileName">: {{ lastImport.fileName }}</template>
          · {{ lastImport.rows }} {{ lastImport.rows === 1 ? 'rij' : 'rijen' }}
          · {{ lastImport.cols }} {{ lastImport.cols === 1 ? 'kolom' : 'kolommen' }}
        </span>
      </div>
      <div v-else class="text-xs text-muted">
        Max {{ TABLE_MAX_ROWS }} rijen · {{ maxCols }} kolommen bij breedte {{ localWidth }}.
      </div>
    </div>
  </WCard>
</template>
