<script setup lang="ts">
// ============================================================
// ChartEditor — bewerkt één ChartWrap-instance (T47).
//
// Zelfde state-patroon als TableEditor: lokale mirror van het model,
// prop-sync achter een echo-guard, debounced update:modelValue-emit.
// Het datagrid (T47.3) leeft in chart/ChartGrid.vue en spiegelt de
// TableGrid-interactie: rij/serie-menu's, cel-menu met
// "Cel benadrukken", Enter-navigatie. Geen som — tabel-specifiek.
// ============================================================
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import type { ChartType, ChartWrapModel } from '../../../shared/types';
import {
  CHART_MAX_CATEGORIES,
  CHART_MAX_SERIES,
  chartModelsEqual,
  normalizeChartModel,
} from '../../../shared/chart-calculations';
import { debugLog } from '../../../shared/debug';
import ChartGrid from './chart/ChartGrid.vue';
import WCard from '../ui/WCard.vue';

interface Props {
  modelValue: ChartWrapModel;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: ChartWrapModel];
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
    })),
    showLegend: model.showLegend,
    showValues: model.showValues,
    showDelta: model.showDelta,
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
] as const;

function setChartType(next: ChartType): void {
  if (local.value.chartType === next) return;
  local.value.chartType = next;
  scheduleEmit('chart-type');
}

// Donut/pie/progress renderen serie 0 — hint tonen bij meerdere series.
const singleSeriesType = computed<boolean>(
  () =>
    local.value.chartType === 'donut' ||
    local.value.chartType === 'pie' ||
    local.value.chartType === 'progress',
);

// --- weergave ------------------------------------------------------

function setShowLegend(v: boolean): void {
  local.value.showLegend = v;
  scheduleEmit('legend-toggle');
}

function setShowValues(v: boolean): void {
  local.value.showValues = v;
  scheduleEmit('values-toggle');
}

// Delta-badges (T48): verandering vs vorige categorie in serie 0.
function setShowDelta(v: boolean): void {
  local.value.showDelta = v;
  scheduleEmit('delta-toggle');
}

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

    <p v-if="singleSeriesType && local.series.length > 1" class="text-xs text-dimmed">
      Dit grafiektype toont alleen de eerste serie.
    </p>

    <ChartGrid
      :model="local"
      :max-categories="CHART_MAX_CATEGORIES"
      :max-series="CHART_MAX_SERIES"
      @category-edit="setCategory"
      @series-name="setSeriesName"
      @value-edit="setValue"
      @cell-emphasis="setCellEmphasis"
      @category-emphasis="setCategoryEmphasis"
      @add-category-before="(i: number) => insertCategoryAt(i)"
      @add-category-after="(i: number) => insertCategoryAt(i + 1)"
      @remove-category="removeCategory"
      @add-series-before="(s: number) => insertSeriesAt(s)"
      @add-series-after="(s: number) => insertSeriesAt(s + 1)"
      @remove-series="removeSeries"
    />

    <p class="text-xs text-muted">
      {{ local.categories.length }} / {{ CHART_MAX_CATEGORIES }} categorieën ·
      {{ local.series.length }} / {{ CHART_MAX_SERIES }} series
    </p>
  </WCard>
</template>
