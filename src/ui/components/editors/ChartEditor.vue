<script setup lang="ts">
// ============================================================
// ChartEditor — bewerkt één ChartWrap-instance.
//
// Zelfde state-patroon als TableEditor: lokale mirror van het model,
// prop-sync achter een echo-guard, debounced update:modelValue-emit.
// Het datagrid leeft in chart/ChartGrid.vue en spiegelt de
// TableGrid-interactie: rij/serie-menu's, cel-menu met
// "Cel benadrukken", Enter-navigatie. Geen som — tabel-specifiek.
// ============================================================
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import type { ChartType, ChartWrapModel } from '../../../shared/types';
import type { DropdownMenuItem } from '@nuxt/ui';
import {
  CHART_MAX_CATEGORIES,
  CHART_MAX_SERIES,
  chartModelsEqual,
  chartValueLabel,
  isSingleSeriesChartType,
  normalizeChartModel,
  seriesTotal,
} from '../../../shared/chart-calculations';
import { debugLog } from '../../../shared/debug';
import ChartGrid from './chart/ChartGrid.vue';
import { useChartCsvImport } from './chart/useChartCsvImport';
import WCard from '../ui/WCard.vue';

interface Props {
  modelValue: ChartWrapModel;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: ChartWrapModel];
  'import-csv': [csv: string];
}>();

function cloneModel(model: ChartWrapModel): ChartWrapModel {
  return normalizeChartModel({
    slotId: model.slotId,
    chartType: model.chartType,
    categories: model.categories.slice(),
    categoryEmphasis: model.categoryEmphasis !== undefined ? model.categoryEmphasis.slice() : undefined,
    series: model.series.map((s) => ({
      name: s.name,
      values: s.values.slice(),
      emphasis: s.emphasis !== undefined ? s.emphasis.slice() : undefined,
      percent: s.percent,
    })),
    showLegend: model.showLegend,
    showValues: model.showValues,
    showDelta: model.showDelta,
    deltaOverrides: model.deltaOverrides !== undefined ? model.deltaOverrides.slice() : undefined,
    progressMax: model.progressMax,
    donutTotalOverride: model.donutTotalOverride,
    donutTotalLabel: model.donutTotalLabel,
    donutTotalEmphasis: model.donutTotalEmphasis,
    donutTotalLabelEmphasis: model.donutTotalLabelEmphasis,
  });
}

const local = ref<ChartWrapModel>(cloneModel(props.modelValue));

let echoExpected = false;
let echoResetTimer: ReturnType<typeof setTimeout> | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

watch(
  () => props.modelValue,
  (next) => {
    if (echoExpected) return;
    if (!chartModelsEqual(next, local.value)) local.value = cloneModel(next);
  },
  { deep: true },
);

function scheduleEmit(reason: string): void {
  if (debounceTimer !== null) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    echoExpected = true;
    if (echoResetTimer !== null) clearTimeout(echoResetTimer);
    echoResetTimer = setTimeout(() => {
      echoExpected = false;
      echoResetTimer = null;
    }, 2000);
    debugLog('chart-editor', 'emit-update', {
      reason: reason,
      slotId: local.value.slotId,
      type: local.value.chartType,
    });
    emit('update:modelValue', cloneModel(local.value));
  }, 200);
}

onBeforeUnmount(() => {
  if (debounceTimer !== null) clearTimeout(debounceTimer);
  if (echoResetTimer !== null) clearTimeout(echoResetTimer);
});

// --- type-switcher -------------------------------------------------

const chartTypeItems = [
  { label: 'Donut', value: 'donut', icon: 'i-lucide-circle-dot' },
  { label: 'Cirkeldiagram', value: 'pie', icon: 'i-lucide-chart-pie' },
  { label: 'Staafdiagram', value: 'bar', icon: 'i-lucide-chart-column' },
  { label: 'Voortgangsbalken', value: 'progress', icon: 'i-lucide-chart-no-axes-gantt' },
  { label: 'Lijndiagram', value: 'line', icon: 'i-lucide-chart-line' },
  { label: 'Prestatiematrix', value: 'matrix', icon: 'i-lucide-grid-3x3' },
] as const;

function setChartType(next: ChartType): void {
  if (local.value.chartType === next) return;
  local.value.chartType = next;
  scheduleEmit('chart-type');
}

// Donut/pie/progress renderen serie 0 — grid toont dan alleen serie 0
// (display-gating; verborgen series blijven bewaard in het model).
const singleSeriesType = computed<boolean>(() => isSingleSeriesChartType(local.value.chartType));

// --- weergave ------------------------------------------------------

function setShowLegend(v: boolean): void {
  local.value.showLegend = v;
  scheduleEmit('legend-toggle');
}

function setShowValues(v: boolean): void {
  local.value.showValues = v;
  scheduleEmit('values-toggle');
}

// Delta-badges: verandering vs vorige categorie in serie 0.
function setShowDelta(v: boolean): void {
  local.value.showDelta = v;
  scheduleEmit('delta-toggle');
}

// Procentteken per serie (kolom), zoals de tabel.
function setSeriesPercent(s: number, v: boolean): void {
  local.value.series[s].percent = v;
  scheduleEmit('series-percent');
}

// Donut center-totaal: override, onderschrift en nadruk.
const donutTotalPlaceholder = computed<string>(() => {
  if (local.value.series.length === 0) return '';
  const serie = local.value.series[0];
  return chartValueLabel(serie, seriesTotal(serie));
});

function setDonutTotalOverride(v: string): void {
  local.value.donutTotalOverride = v;
  scheduleEmit('donut-total');
}

function setDonutTotalLabel(v: string): void {
  local.value.donutTotalLabel = v;
  scheduleEmit('donut-total-label');
}

function donutTotalMenuItems(): DropdownMenuItem[][] {
  const emphasized = local.value.donutTotalEmphasis !== false;
  return [
    [
      {
        label: emphasized ? 'Nadruk verwijderen' : 'Cel benadrukken',
        icon: 'i-lucide-bold',
        onSelect: () => {
          local.value.donutTotalEmphasis = !emphasized;
          scheduleEmit('donut-total-emphasis');
        },
      },
    ],
  ];
}

function donutLabelMenuItems(): DropdownMenuItem[][] {
  const emphasized = local.value.donutTotalLabelEmphasis === true;
  return [
    [
      {
        label: emphasized ? 'Nadruk verwijderen' : 'Cel benadrukken',
        icon: 'i-lucide-bold',
        onSelect: () => {
          local.value.donutTotalLabelEmphasis = !emphasized;
          scheduleEmit('donut-label-emphasis');
        },
      },
    ],
  ];
}

// Per-cel delta-override; lege string = auto.
function ensureDeltaOverrides(): string[] {
  if (local.value.deltaOverrides === undefined) {
    local.value.deltaOverrides = local.value.categories.map(() => '');
  }
  return local.value.deltaOverrides;
}

function setDeltaOverride(i: number, value: string): void {
  ensureDeltaOverrides()[i] = value;
  scheduleEmit('delta-override');
}

// Vaste progress-referentie; leeg/ongeldig = auto (null).
function setProgressMax(raw: string | number): void {
  const parsed = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(',', '.'));
  const next = isFinite(parsed) && parsed > 0 ? parsed : null;
  if (local.value.progressMax === next) return;
  local.value.progressMax = next;
  scheduleEmit('progress-max');
}

// Transponeren (Datawrapper/Flourish-conventie: expliciete actie,
// nooit stille auto-rotatie): categorieën ↔ series wisselen. Cel-nadruk
// hoort bij een waarde en transponeert dus mee met de waardenmatrix.
// Rij/kolom-vlaggen resetten bewust — categorie-nadruk, delta-overrides
// én procent-per-serie hebben geen coherente plek meer nadat series
// categorieën worden (en vice versa).
const canTranspose = computed<boolean>(
  () =>
    local.value.categories.length <= CHART_MAX_SERIES &&
    local.value.series.length <= CHART_MAX_CATEGORIES,
);

function transpose(): void {
  if (!canTranspose.value) return;
  const oldCategories = local.value.categories.slice();
  const oldSeries = local.value.series.map((sr) => ({
    name: sr.name,
    values: sr.values.slice(),
    emphasis: sr.emphasis !== undefined ? sr.emphasis.slice() : undefined,
  }));
  const anyEmphasis = oldSeries.some((sr) => sr.emphasis !== undefined);
  local.value.categories = oldSeries.map((sr, idx) =>
    sr.name !== '' ? sr.name : 'Categorie ' + String(idx + 1),
  );
  local.value.series = oldCategories.map((cat, i) => ({
    name: cat !== '' ? cat : 'Serie ' + String(i + 1),
    values: oldSeries.map((sr) => sr.values[i]),
    // Cel (serie s, categorie i) wordt cel (serie i, categorie s):
    // dezelfde transpositie als de waarden zelf.
    emphasis: anyEmphasis
      ? oldSeries.map((sr) => sr.emphasis !== undefined && sr.emphasis[i] === true)
      : undefined,
  }));
  local.value.categoryEmphasis = undefined;
  local.value.deltaOverrides = undefined;
  scheduleEmit('transpose');
}

const csv = useChartCsvImport(props, (event: 'import-csv', text: string) => emit(event, text));

// --- grid-mutaties (positioneel, zoals de tabel) --------------------

function ensureEmphasis(s: number): boolean[] {
  const serie = local.value.series[s];
  if (serie.emphasis === undefined) {
    const emphasis: boolean[] = local.value.categories.map(() => false);
    serie.emphasis = emphasis;
  }
  return serie.emphasis;
}

function ensureCategoryEmphasis(): boolean[] {
  if (local.value.categoryEmphasis === undefined) {
    const emphasis: boolean[] = local.value.categories.map(() => false);
    local.value.categoryEmphasis = emphasis;
  }
  return local.value.categoryEmphasis;
}

function setCategory(i: number, value: string): void {
  local.value.categories[i] = value;
  scheduleEmit('category-edit');
}

function setSeriesName(s: number, value: string): void {
  local.value.series[s].name = value;
  scheduleEmit('series-name');
}

function setValue(s: number, i: number, raw: string | number): void {
  const parsed = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(',', '.'));
  local.value.series[s].values[i] = isFinite(parsed) && parsed >= 0 ? parsed : 0;
  scheduleEmit('value-edit');
}

function setCellEmphasis(s: number, i: number, emphasis: boolean): void {
  ensureEmphasis(s)[i] = emphasis;
  scheduleEmit('cell-emphasis');
}

function setCategoryEmphasis(i: number, emphasis: boolean): void {
  ensureCategoryEmphasis()[i] = emphasis;
  scheduleEmit('category-emphasis');
}

function insertCategoryAt(index: number): void {
  if (local.value.categories.length >= CHART_MAX_CATEGORIES) return;
  local.value.categories.splice(index, 0, 'Categorie ' + String(local.value.categories.length + 1));
  if (local.value.categoryEmphasis !== undefined) local.value.categoryEmphasis.splice(index, 0, false);
  for (const s of local.value.series) {
    s.values.splice(index, 0, 0);
    if (s.emphasis !== undefined) s.emphasis.splice(index, 0, false);
  }
  scheduleEmit('add-category');
}

function removeCategory(i: number): void {
  if (local.value.categories.length <= 1) return;
  local.value.categories.splice(i, 1);
  if (local.value.categoryEmphasis !== undefined) local.value.categoryEmphasis.splice(i, 1);
  for (const s of local.value.series) {
    s.values.splice(i, 1);
    if (s.emphasis !== undefined) s.emphasis.splice(i, 1);
  }
  scheduleEmit('remove-category');
}

function insertSeriesAt(index: number): void {
  if (local.value.series.length >= CHART_MAX_SERIES) return;
  local.value.series.splice(index, 0, {
    name: 'Serie ' + String(local.value.series.length + 1),
    values: local.value.categories.map(() => 0),
    emphasis: local.value.categories.map(() => false),
  });
  scheduleEmit('add-series');
}

function removeSeries(s: number): void {
  if (local.value.series.length <= 1) return;
  local.value.series.splice(s, 1);
  scheduleEmit('remove-series');
}
</script>

<template>
  <WCard>
    <UFormField name="chart-type" label="Grafiektype">
      <USelectMenu
        :model-value="local.chartType"
        :items="[...chartTypeItems]"
        value-key="value"
        class="w-full"
        @update:model-value="(v: ChartType) => setChartType(v)"
      />
    </UFormField>

    <div class="flex flex-wrap items-center gap-6">
      <div class="flex items-center gap-2">
        <span class="text-sm font-semibold text-default">Legenda</span>
        <USwitch
          :model-value="local.showLegend"
          aria-label="Legenda tonen"
          size="xs"
          @update:model-value="(v: boolean) => setShowLegend(v)"
        />
      </div>
      <div class="flex items-center gap-2">
        <span class="text-sm font-semibold text-default">Waarden</span>
        <USwitch
          :model-value="local.showValues"
          aria-label="Waarden tonen"
          size="xs"
          @update:model-value="(v: boolean) => setShowValues(v)"
        />
      </div>
      <div class="flex items-center gap-2">
        <span class="text-sm font-semibold text-default">Delta</span>
        <USwitch
          :model-value="local.showDelta === true"
          aria-label="Delta-badges tonen"
          size="xs"
          @update:model-value="(v: boolean) => setShowDelta(v)"
        />
      </div>
    </div>

    <UFormField v-if="local.chartType === 'progress'" name="progress-max" label="Maximum">
      <UInput
        :model-value="local.progressMax !== null && local.progressMax !== undefined ? String(local.progressMax) : ''"
        type="number"
        min="1"
        placeholder="Auto (max(100, hoogste waarde))"
        class="w-full"
        aria-label="Maximum referentiewaarde"
        @update:model-value="(v: string | number) => setProgressMax(v)"
      />
      <template v-if="local.progressMax !== null && local.progressMax !== undefined" #hint>
        <span class="text-xs text-dimmed">Waarden boven het maximum vullen de balk volledig.</span>
      </template>
    </UFormField>

    <div v-if="local.chartType === 'donut'" class="flex items-end gap-2">
      <UFormField name="donut-total" label="Totaal" class="flex-1">
        <div class="group/total relative">
          <UInput
            :model-value="local.donutTotalOverride !== undefined ? local.donutTotalOverride : ''"
            :placeholder="donutTotalPlaceholder"
            class="w-full"
            :ui="{ base: (local.donutTotalEmphasis !== false ? 'font-semibold ' : '') + 'pr-7' }"
            aria-label="Center-totaal override"
            @update:model-value="(v: string | number) => setDonutTotalOverride(String(v))"
          />
          <UDropdownMenu
            :items="donutTotalMenuItems()"
            :modal="false"
            size="xs"
          >
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              square
              icon="i-lucide-ellipsis"
              class="absolute right-0.5 top-1/2 -translate-y-1/2 opacity-0 transition-opacity hover:bg-muted/70 focus:opacity-100 group-focus-within/total:opacity-70 group-hover/total:opacity-70"
              aria-label="Menu voor totaal"
              title="Menu voor totaal"
            />
          </UDropdownMenu>
        </div>
      </UFormField>
      <UFormField name="donut-total-label" label="Onderschrift" class="flex-1">
        <div class="group/sublabel relative">
          <UInput
            :model-value="local.donutTotalLabel !== undefined ? local.donutTotalLabel : 'totaal'"
            placeholder="totaal"
            class="w-full"
            :ui="{ base: (local.donutTotalLabelEmphasis === true ? 'font-semibold ' : '') + 'pr-7' }"
            aria-label="Onderschrift onder het totaal"
            @update:model-value="(v: string | number) => setDonutTotalLabel(String(v))"
          />
          <UDropdownMenu :items="donutLabelMenuItems()" :modal="false" size="xs">
            <UButton
              color="neutral"
              variant="ghost"
              size="xs"
              square
              icon="i-lucide-ellipsis"
              class="absolute right-0.5 top-1/2 -translate-y-1/2 opacity-0 transition-opacity hover:bg-muted/70 focus:opacity-100 group-focus-within/sublabel:opacity-70 group-hover/sublabel:opacity-70"
              aria-label="Menu voor onderschrift"
              title="Menu voor onderschrift"
            />
          </UDropdownMenu>
        </div>
      </UFormField>
    </div>

    <p v-if="singleSeriesType && local.series.length > 1" class="text-xs text-dimmed">
      Dit grafiektype toont alleen de eerste serie.
    </p>

    <ChartGrid
      :model="local"
      :max-categories="CHART_MAX_CATEGORIES"
      :max-series="CHART_MAX_SERIES"
      :single-series="singleSeriesType"
      @category-edit="setCategory"
      @series-name="setSeriesName"
      @value-edit="setValue"
      @cell-emphasis="setCellEmphasis"
      @delta-override-edit="setDeltaOverride"
      @series-percent="setSeriesPercent"
      @category-emphasis="setCategoryEmphasis"
      @add-category-before="(i: number) => insertCategoryAt(i)"
      @add-category-after="(i: number) => insertCategoryAt(i + 1)"
      @remove-category="removeCategory"
      @add-series-before="(s: number) => insertSeriesAt(s)"
      @add-series-after="(s: number) => insertSeriesAt(s + 1)"
      @remove-series="removeSeries"
    />

    <div class="flex items-center gap-2">
      <UButton
        color="neutral"
        variant="soft"
        size="xs"
        icon="i-lucide-arrow-left-right"
        :disabled="!canTranspose"
        :title="canTranspose ? 'Rijen en kolommen wisselen' : 'Te veel rijen om te transponeren (max ' + CHART_MAX_SERIES + ')'"
        @click="transpose"
      >
        Transponeren
      </UButton>
      <span class="ml-auto text-xs text-muted">
        {{ local.categories.length }} / {{ CHART_MAX_CATEGORIES }} categorieën ·
        {{ local.series.length }} / {{ CHART_MAX_SERIES }} series
      </span>
    </div>

    <USeparator />

    <UFileUpload
      v-model="csv.csvUploadFile.value"
      accept=".csv,text/csv"
      icon="i-lucide-folder-plus"
      label="Sleep je CSV hier of klik om te bladeren"
      :description="`Koprij met serienamen · max ${CHART_MAX_CATEGORIES} datarijen · ${CHART_MAX_SERIES} series.`"
      color="neutral"
      :preview="false"
      reset
      :ui="{ base: '!grow-0 !flex-none h-32' }"
      @update:model-value="csv.onCsvFileChange"
    >
      <template #actions="{ open }">
        <UButton color="neutral" variant="outline" @click.stop.prevent="open()">
          Bestand kiezen
        </UButton>
      </template>
    </UFileUpload>

    <div v-if="csv.csvError.value !== ''" class="text-xs text-error">{{ csv.csvError.value }}</div>
    <div
      v-else-if="csv.lastImport.value !== null"
      class="flex min-w-0 items-center gap-1.5 text-xs text-success"
    >
      <UIcon name="i-lucide-check" class="size-3.5 shrink-0" aria-hidden="true" />
      <span class="truncate">
        Geïmporteerd<template v-if="csv.lastImport.value.fileName">: {{ csv.lastImport.value.fileName }}</template>
        · {{ csv.lastImport.value.rows }} {{ csv.lastImport.value.rows === 1 ? 'datarij' : 'datarijen' }}
        · {{ csv.lastImport.value.cols }} series
      </span>
    </div>
    <div v-else class="text-xs text-muted">
      Kolom 1 = categorieën · kolommen 2+ = series (koprij = namen).
    </div>
  </WCard>
</template>
