<!--
  CsvImport — plak of upload CSV/TSV, mappeer kolommen en
  vervang store.state.dataPoints in één klik.

  Flow:
    1. Plak-vlak (UTextarea) of bestand-knop (native <input>) vult `csvText`.
    2. `watch(() => store.state.csvSource?.text) → parseCSV()` → blocks + dialect.
    3. Block-dropdown (alleen zichtbaar bij meerdere blokken).
    4. Mapping-controls: label-kolom, waarde-kolom, skipHeader, skipTotaal,
       valueFormat (number/percentage; auto-gedetecteerd bij block-wissel).
    5. `computed(mappingResult) → mapBlock(block, mapping)`.
    6. Preview: eerste 5 gemapte DataPoints in UTable.
    7. Foutenlijst: validator-errors + niet-fatale warnings.
    8. Auto-apply: muteert store.state.csvDataPoints direct.

  Pure CSV-modules uit `plugin-src/chart-core/csv/` worden direct geïmporteerd.
  Ze blijven UI-onafhankelijk; deze component doet alleen presentatie
  en reactieve glue.

  Persistentie (v0.3.2):
    Alle CSV-state (text, fileName, mapping) wordt bewaard in
    store.state.csvSource zodat sluiten+heropenen van het iframe de UI
    in exact dezelfde staat terugbrengt. uploadedFile (File-object) is
    niet serialiseerbaar en blijft lokaal; bij heropenen toont de
    compacte bestand-rij puur op basis van csvSource.fileName.

  Out of scope (Fase 3):
    - Drag/drop bestand-upload
    - Auto-detectie label/value-kolom op basis van content
    - Mapping-presets opslaan
    - Aggregatie (som/gemiddelde)
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { DataPoint } from '../../../types';
import type { CsvSource } from '../../../types';
import type {
  CsvBlock,
  CsvMapping,
  CsvMappingResult,
  CsvParseResult,
  CsvRowError,
} from '../../../chart-core/csv';
import { mapBlock, parseCSV, validateBlock, validateDataPoints } from '../../../chart-core/csv';
import { useChartStore } from '../../composables/useChartStore';
import { getMaxDataPoints } from '../../../chart-core/constants';

const store = useChartStore();

const MAX_DATAPOINTS = computed<number>(() => getMaxDataPoints(store.state.chartType));
const MIN_DATAPOINTS = 1;

// ----------------------------------------------------------------
// Helpers voor csvSource-persistentie
// ----------------------------------------------------------------

/**
 * Zorg dat store.state.csvSource bestaat. Roep aan vóór elke schrijfactie
 * die verwacht dat csvSource al aanwezig is.
 */
function ensureCsvSource(): CsvSource {
  if (!store.state.csvSource) {
    store.state.csvSource = {
      text: '',
      fileName: '',
      selectedBlockIndex: 0,
      labelColumn: 0,
      valueColumn: 1,
      skipHeader: true,
      valueFormat: 'number',
    };
  }
  return store.state.csvSource;
}

// ----------------------------------------------------------------
// Computed getters/setters op store.state.csvSource
// ----------------------------------------------------------------

const csvText = computed<string>({
  get() {
    return store.state.csvSource ? store.state.csvSource.text : '';
  },
  set(v: string) {
    ensureCsvSource().text = v;
  },
});

const fileName = computed<string>({
  get() {
    return store.state.csvSource ? store.state.csvSource.fileName : '';
  },
  set(v: string) {
    ensureCsvSource().fileName = v;
  },
});

const selectedBlockIndex = computed<number>({
  get() {
    return store.state.csvSource ? store.state.csvSource.selectedBlockIndex : 0;
  },
  set(v: number) {
    ensureCsvSource().selectedBlockIndex = v;
  },
});

const labelColumn = computed<number>({
  get() {
    return store.state.csvSource ? store.state.csvSource.labelColumn : 0;
  },
  set(v: number) {
    ensureCsvSource().labelColumn = v;
  },
});

const valueColumn = computed<number>({
  get() {
    return store.state.csvSource ? store.state.csvSource.valueColumn : 1;
  },
  set(v: number) {
    ensureCsvSource().valueColumn = v;
  },
});

const skipHeader = computed<boolean>({
  get() {
    return store.state.csvSource ? store.state.csvSource.skipHeader : true;
  },
  set(v: boolean) {
    ensureCsvSource().skipHeader = v;
  },
});

const valueFormat = computed<'number' | 'percentage'>({
  get() {
    return store.state.csvSource ? store.state.csvSource.valueFormat : 'number';
  },
  set(v: 'number' | 'percentage') {
    ensureCsvSource().valueFormat = v;
  },
});

// ----------------------------------------------------------------
// Lokale state (niet persisteerbaar)
// ----------------------------------------------------------------

/** File-object: niet serialiseerbaar, blijft lokaal. */
const uploadedFile = ref<File | null>(null);

/** Parse-resultaat: afgeleid van csvText, niet opgeslagen. */
const parseResult = ref<CsvParseResult | null>(null);

// skipTotaal is informatief: mapBlock doet dit altijd automatisch
const skipTotaal = ref<boolean>(true);

// ----------------------------------------------------------------
// Derived state
// ----------------------------------------------------------------

/** Het door de gebruiker gekozen blok uit de parse-resultaten. */
const selectedBlock = computed<CsvBlock | null>(() => {
  if (!parseResult.value) return null;
  return parseResult.value.blocks[selectedBlockIndex.value] ?? null;
});

/** Opties voor de dataset-dropdown — label toont eerste header of "Dataset N". */
const blockItems = computed(() => {
  if (!parseResult.value) return [];
  return parseResult.value.blocks.map((b, i) => ({
    label: b.label || `Dataset ${i + 1}`,
    value: i,
  }));
});

/** Kolom-opties voor label/value-selectors — gebruikt headers of "Kolom A/B/…". */
const columnItems = computed(() => {
  const block = selectedBlock.value;
  if (!block) return [];
  const width = block.headers?.length ?? block.rows[0]?.length ?? 0;
  return Array.from({ length: width }, (_, i) => {
    const header = block.headers?.[i]?.trim();
    const fallback = `Kolom ${String.fromCharCode(65 + i)}`;
    return {
      label: header && header !== '' ? header : fallback,
      value: i,
    };
  });
});

const valueFormatItems = [
  { label: 'Getal', value: 'number' as const },
  { label: 'Percentage', value: 'percentage' as const },
];

/** Menselijk leesbare dialect-badge. */
const dialectLabel = computed<string>(() => {
  if (!parseResult.value) return '';
  switch (parseResult.value.dialect) {
    case 'semicolon':
      return 'Puntkomma';
    case 'comma':
      return 'Komma';
    case 'tab':
      return 'Tab';
    default:
      return parseResult.value.dialect;
  }
});

/**
 * Resultaat van de mapping. `computed` zodat wijzigingen aan
 * mapping, selectedBlock of valueFormat direct de preview en
 * foutenlijst updaten.
 */
const mappingResult = computed<CsvMappingResult | null>(() => {
  const block = selectedBlock.value;
  if (!block) return null;
  const mapping: CsvMapping = {
    labelColumn: labelColumn.value,
    valueColumn: valueColumn.value,
    hasHeader: skipHeader.value,
  };
  return mapBlock(block, mapping, valueFormat.value, MAX_DATAPOINTS.value);
});

/** Structurele waarschuwingen vanuit validateBlock (naast mapper-fouten). */
const blockWarnings = computed<string[]>(() => {
  const block = selectedBlock.value;
  if (!block) return [];
  return validateBlock(block).warnings;
});

/** Extra DataPoint-level validatie (bv. negatieve waarde). */
const dataPointErrors = computed<CsvRowError[]>(() => {
  if (!mappingResult.value) return [];
  return validateDataPoints(mappingResult.value.dataPoints);
});

/** Alleen harde fouten uit de mapper (niet-numerieke rijen e.d.). */
const mapperErrors = computed<CsvRowError[]>(() => {
  return mappingResult.value?.errors ?? [];
});

/** Negatieve-waarde meldingen zijn waarschuwingen, geen blokkerende fouten. */
const isWarning = (err: CsvRowError): boolean =>
  err.message.toLowerCase().startsWith('waarschuwing');

const blockingErrors = computed<CsvRowError[]>(() => {
  return [...mapperErrors.value, ...dataPointErrors.value.filter((e) => !isWarning(e))];
});

const nonBlockingWarnings = computed<CsvRowError[]>(() => {
  return dataPointErrors.value.filter(isWarning);
});

const previewRows = computed<Array<{ hash: string; label: string; waarde: string }>>(() => {
  if (!mappingResult.value) return [];
  return mappingResult.value.dataPoints.slice(0, 5).map((p, i) => ({
    hash: String(i + 1),
    label: p.label,
    waarde: formatValueForPreview(p.value),
  }));
});

const previewColumns = [
  { accessorKey: 'hash', header: '#' },
  { accessorKey: 'label', header: 'Label' },
  { accessorKey: 'waarde', header: 'Waarde' },
];

const dataPointCount = computed<number>(() => {
  return mappingResult.value?.dataPoints.length ?? 0;
});

/** Apply-knop: blokkeert bij 0 of meer dan het max, of bij harde parse-fouten. */
const canApply = computed<boolean>(() => {
  const count = dataPointCount.value;
  if (count < MIN_DATAPOINTS || count > MAX_DATAPOINTS.value) return false;
  if (blockingErrors.value.length > 0) return false;
  return true;
});

const applyDisabledReason = computed<string | undefined>(() => {
  if (!parseResult.value) return 'Plak eerst CSV-data of upload een bestand';
  const count = dataPointCount.value;
  if (count < MIN_DATAPOINTS) return 'Geen datapunten gevonden';
  if (count > MAX_DATAPOINTS.value)
    return 'Meer dan ' + MAX_DATAPOINTS.value + ' punten — splitsen vereist';
  if (blockingErrors.value.length > 0) return 'Los eerst de fouten op';
  return undefined;
});

// ----------------------------------------------------------------
// Watchers
// ----------------------------------------------------------------

/**
 * Bij elke CSV-tekst-wijziging opnieuw parsen.
 * selectedBlockIndex resetten bij nieuw bestand, maar NIET bij
 * heropenen van de iframe (dan bewaren we de opgeslagen index).
 */
watch(
  () => store.state.csvSource && store.state.csvSource.text,
  (text) => {
    if (!text || !text.trim()) {
      parseResult.value = null;
      return;
    }
    parseResult.value = parseCSV(text);
    // Pas default-mapping toe alleen als er nog geen parse-resultaat was
    // (eerste parse). Bij heropenen zijn mapping-velden al hersteld uit store.
    if (!parseResult.value) {
      applyDefaultMapping();
    }
  },
  { immediate: true },
);

/**
 * Initiële parse op mount als csvSource al bestaat (heropenen).
 * De watcher hierboven triggert ook met immediate:true, maar we moeten
 * GEEN applyDefaultMapping aanroepen — de opgeslagen waarden zijn leidend.
 */

/** Bij wissel van blok: mapping opnieuw defaulten. */
watch(selectedBlockIndex, () => {
  applyDefaultMapping();
});

/**
 * Defaults: eerste kolom = label, tweede kolom = waarde,
 * skipHeader=true als headers gedetecteerd zijn,
 * valueFormat auto-raadt op "%" in headernaam of waarden.
 */
function applyDefaultMapping(): void {
  const block = selectedBlock.value;
  if (!block) return;
  const width = block.headers?.length ?? block.rows[0]?.length ?? 0;
  labelColumn.value = 0;
  valueColumn.value = width >= 2 ? 1 : 0;
  skipHeader.value = block.headers !== null;
  valueFormat.value = guessValueFormat(block, valueColumn.value);
}

/**
 * Heuristiek: percentage als de kolomnaam % bevat of ten minste één
 * cel in die kolom op % eindigt. Anders number.
 */
function guessValueFormat(block: CsvBlock, col: number): 'number' | 'percentage' {
  const header = block.headers?.[col]?.toLowerCase() ?? '';
  if (header.indexOf('%') !== -1 || header.indexOf('percent') !== -1) {
    return 'percentage';
  }
  const startRow = block.headers !== null ? 1 : 0;
  for (let i = startRow; i < block.rows.length; i++) {
    const cell = block.rows[i][col];
    if (cell && cell.trim().endsWith('%')) {
      return 'percentage';
    }
  }
  return 'number';
}

function formatValueForPreview(value: number): string {
  const formatted = Number.isInteger(value) ? String(value) : value.toFixed(2);
  return valueFormat.value === 'percentage' ? `${formatted}%` : formatted;
}

// ----------------------------------------------------------------
// File upload
// ----------------------------------------------------------------

watch(uploadedFile, async (file) => {
  if (!file) return;
  const text = await file.text();
  // Zet text + fileName in store (persisteerbaar).
  const src = ensureCsvSource();
  src.fileName = file.name;
  src.text = text;
  // selectedBlockIndex resetten bij nieuw bestand.
  src.selectedBlockIndex = 0;
});

// ----------------------------------------------------------------
// Delete CSV-bron
// ----------------------------------------------------------------

function clearCsvSource(): void {
  uploadedFile.value = null;
  store.state.csvSource = undefined;
  parseResult.value = null;
}

// ----------------------------------------------------------------
// Apply
// ----------------------------------------------------------------

// Auto-apply zodra parse + mapping geldig zijn. Gebruiker hoeft niet meer
// op een knop te klikken: elke wijziging in de CSV, dialect of mapping
// propageert direct naar store.state.dataPoints.
watch(
  [canApply, mappingResult],
  ([ok, res]) => {
    if (ok && res) onApply();
  },
  { immediate: true },
);

function onApply(): void {
  if (!canApply.value || !mappingResult.value) return;

  // Diepe kopie zodat mutaties in store.state niet op mappingResult terugslaan.
  const copied: DataPoint[] = mappingResult.value.dataPoints.map((p) => ({
    label: p.label,
    value: p.value,
  }));

  // v0.3.1: schrijf naar csvDataPoints — manualDataPoints blijft onaangeroerd.
  // store.setActiveDataTab zorgt tevens dat dataPoints gesynchroniseerd wordt
  // als de CSV-tab actief is, zodat de debounced bridge-watcher triggert.
  store.state.csvDataPoints = copied;

  // Propageer de value-format-keuze naar de widget-state.
  store.state.valueFormat = valueFormat.value;

  // Optioneel: als titel nog de default is en het blok een leesbare
  // header heeft, overschrijven we die (niet-destructief voor handmatig
  // ingevoerde titels).
  const block = selectedBlock.value;
  if (block && block.headers && block.headers.length > 0) {
    const firstHeader = block.headers[0].trim();
    const currentTitle = store.state.title.trim();
    const isDefaultTitle = currentTitle === '' || currentTitle === 'Mijn grafiek';
    if (isDefaultTitle && firstHeader !== '') {
      store.state.title = firstHeader.slice(0, 64);
    }
  }
}
</script>

<template>
  <section class="space-y-3">
    <div class="flex items-center justify-between">
      <h2 class="text-sm font-semibold text-default">CSV importeren</h2>
      <UBadge v-if="parseResult" color="secondary" variant="solid" size="lg">
        Dialect: {{ dialectLabel }}
      </UBadge>
    </div>

    <!-- Dropzone: alleen tonen wanneer geen csvSource actief is -->
    <UFileUpload
      v-if="!store.state.csvSource"
      v-model="uploadedFile"
      accept=".csv,.tsv,.txt"
      layout="list"
      size="lg"
      icon="i-lucide-upload"
      label="Sleep CSV hierheen of klik"
      description=".csv, .tsv, .txt"
    />

    <!-- Bestand-rij: compact overzicht + verwijder-knop wanneer geladen -->
    <!-- Toont zodra csvSource.fileName gezet is, ook als uploadedFile null is (heropenen) -->
    <div
      v-else
      class="flex items-center gap-2 rounded-md border border-default bg-elevated px-3 py-2 text-sm"
    >
      <UIcon name="i-lucide-file" class="shrink-0 text-muted" />
      <span class="flex-1 truncate">{{ store.state.csvSource.fileName }}</span>
      <span v-if="uploadedFile" class="shrink-0 text-xs text-muted"
        >{{ Math.round((uploadedFile.size / 1024) * 10) / 10 }} KB</span
      >
      <UButton
        icon="i-lucide-x"
        color="neutral"
        variant="ghost"
        size="lg"
        @click="clearCsvSource"
      />
    </div>

    <!-- Dataset-dropdown (alleen bij meerdere blokken) -->
    <UFormField
      v-if="parseResult && parseResult.blocks.length > 1"
      name="dataset"
      label="Dataset"
      size="lg"
    >
      <USelect
        v-model="selectedBlockIndex"
        :items="blockItems"
        value-key="value"
        size="lg"
        class="w-full"
      />
    </UFormField>

    <!-- Mapping-controls (alleen als we een block hebben) -->
    <div v-if="selectedBlock" class="grid grid-cols-2 gap-2">
      <UFormField name="label-col" label="Label-kolom" size="lg">
        <USelect
          v-model="labelColumn"
          :items="columnItems"
          value-key="value"
          size="lg"
          class="w-full"
        />
      </UFormField>

      <UFormField name="value-col" label="Waarde-kolom" size="lg">
        <USelect
          v-model="valueColumn"
          :items="columnItems"
          value-key="value"
          size="lg"
          class="w-full"
        />
      </UFormField>

      <UFormField name="value-format" label="Waarde-formaat" size="lg" class="col-span-2">
        <USelect
          v-model="valueFormat"
          :items="valueFormatItems"
          value-key="value"
          size="lg"
          class="w-full"
        />
      </UFormField>

      <div class="col-span-2 flex flex-wrap gap-4">
        <UCheckbox v-model="skipHeader" label="Eerste rij is header" size="lg" />
        <UCheckbox
          v-model="skipTotaal"
          label="TOTAAL-rij overslaan"
          size="lg"
          disabled
          title="Automatisch; TOTAAL-rijen worden altijd gefilterd."
        />
      </div>
    </div>

    <!-- Preview-tabel -->
    <div v-if="mappingResult" class="space-y-2">
      <div class="flex items-center justify-between">
        <h3 class="text-xs font-semibold uppercase text-muted">Voorbeeld</h3>
        <span class="text-xs text-muted">
          {{ dataPointCount }} punt(en)
          <template v-if="mappingResult.skippedRows > 0">
            &middot; {{ mappingResult.skippedRows }} overgeslagen
          </template>
        </span>
      </div>
      <UTable
        v-if="previewRows.length > 0"
        :data="previewRows"
        :columns="previewColumns"
        class="border border-default rounded-md"
      />
      <UAlert
        v-else
        color="neutral"
        variant="soft"
        icon="i-lucide-info"
        title="Geen datapunten in voorbeeld"
        description="Controleer de kolom-mapping of eerste-rij-header-instelling."
      />
    </div>

    <!-- Foutenlijst -->
    <div v-if="blockingErrors.length > 0" class="space-y-1.5">
      <UAlert
        v-for="(err, i) in blockingErrors.slice(0, 10)"
        :key="`err-${i}`"
        color="error"
        variant="soft"
        icon="i-lucide-circle-alert"
        :title="`Fout op rij ${err.rowIndex + 1}`"
        :description="err.message"
      />
      <p v-if="blockingErrors.length > 10" class="text-xs text-muted">
        …en {{ blockingErrors.length - 10 }} verdere fouten.
      </p>
    </div>

    <div v-if="nonBlockingWarnings.length > 0" class="space-y-1.5">
      <UAlert
        v-for="(w, i) in nonBlockingWarnings.slice(0, 5)"
        :key="`warn-${i}`"
        color="warning"
        variant="soft"
        icon="i-lucide-triangle-alert"
        title="Waarschuwing"
        :description="w.message"
      />
    </div>

    <div v-if="mappingResult && mappingResult.warnings.length > 0" class="space-y-1.5">
      <UAlert
        v-for="(w, i) in mappingResult.warnings"
        :key="`mw-${i}`"
        color="warning"
        variant="soft"
        icon="i-lucide-triangle-alert"
        :description="w"
      />
    </div>

    <div v-if="blockWarnings.length > 0" class="space-y-1.5">
      <UAlert
        v-for="(w, i) in blockWarnings"
        :key="`bw-${i}`"
        color="warning"
        variant="soft"
        icon="i-lucide-triangle-alert"
        :description="w"
      />
    </div>

    <!-- Status-regel: auto-apply naar csvDataPoints, geen overschrijving van handmatige rijen. -->
    <div class="text-xs text-muted">
      <template v-if="applyDisabledReason">{{ applyDisabledReason }}</template>
      <template v-else
        >CSV-data is opgeslagen in deze tab. Handmatige rijen blijven bewaard.</template
      >
    </div>
  </section>
</template>
