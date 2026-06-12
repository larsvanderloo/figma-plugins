<script setup lang="ts">
// ============================================================
// ChartEditor — bewerkt één ChartWrap-instance (T47).
//
// Zelfde state-patroon als TableEditor: lokale mirror van het model,
// prop-sync achter een echo-guard, debounced update:modelValue-emit.
// Multi-series grid: categorie-rijen × serie-kolommen; type-switcher
// (donut/pie/bar/progress/line) en weergave-switches (legenda/waarden).
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
    series: model.series.map((s) => ({ name: s.name, values: s.values.slice() })),
    showLegend: model.showLegend,
    showValues: model.showValues,
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

// Per-serie swatch (Pitch-patroon): zelfde donker→licht-ramp-idee als de
// canvas-accent-ramp, benaderd met de UI-primary op aflopende dekking.
const SWATCH_OPACITY = ['opacity-100', 'opacity-75', 'opacity-50', 'opacity-30'];
function seriesSwatchClass(s: number): string {
  return 'inline-block size-3 shrink-0 rounded-sm bg-primary ' + SWATCH_OPACITY[s % SWATCH_OPACITY.length];
}

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

// --- data-grid -----------------------------------------------------

const canAddCategory = computed<boolean>(() => local.value.categories.length < CHART_MAX_CATEGORIES);
const canAddSeries = computed<boolean>(() => local.value.series.length < CHART_MAX_SERIES);

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

function addCategory(): void {
  if (!canAddCategory.value) return;
  local.value.categories.push('Categorie ' + String(local.value.categories.length + 1));
  for (const s of local.value.series) s.values.push(0);
  scheduleEmit('add-category');
}

function removeCategory(i: number): void {
  if (local.value.categories.length <= 1) return;
  local.value.categories.splice(i, 1);
  for (const s of local.value.series) s.values.splice(i, 1);
  scheduleEmit('remove-category');
}

function addSeries(): void {
  if (!canAddSeries.value) return;
  const values: number[] = local.value.categories.map(() => 0);
  local.value.series.push({
    name: 'Serie ' + String(local.value.series.length + 1),
    values: values,
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
    </div>

    <p v-if="singleSeriesType && local.series.length > 1" class="text-xs text-dimmed">
      Dit grafiektype toont alleen de eerste serie.
    </p>

    <div class="overflow-x-auto rounded-sm border border-muted">
      <table class="w-full border-separate border-spacing-0 text-sm">
        <caption class="sr-only">Grafiekdata bewerken</caption>
        <thead>
          <tr class="bg-muted/30">
            <th scope="col" class="border-b border-r border-default px-2 py-1.5 text-left">
              <span class="text-xs font-medium text-dimmed">Categorie</span>
            </th>
            <th
              v-for="(serie, sIdx) in local.series"
              :key="'serie-' + sIdx"
              scope="col"
              class="border-b border-r border-default px-1 py-1 last:border-r-0"
            >
              <div class="flex items-center gap-1">
                <span :class="seriesSwatchClass(sIdx)" aria-hidden="true" />
                <UInput
                  :model-value="serie.name"
                  :placeholder="'Serie ' + (sIdx + 1)"
                  size="xs"
                  variant="none"
                  class="min-w-20 flex-1"
                  :aria-label="'Naam serie ' + (sIdx + 1)"
                  @update:model-value="(v: string | number) => setSeriesName(sIdx, String(v))"
                />
                <UButton
                  v-if="local.series.length > 1"
                  color="error"
                  variant="ghost"
                  size="xs"
                  square
                  icon="i-lucide-trash-2"
                  :aria-label="'Verwijder serie ' + (sIdx + 1)"
                  @click="removeSeries(sIdx)"
                />
              </div>
            </th>
            <th scope="col" class="w-9 border-b border-default px-1 py-1" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="(category, cIdx) in local.categories" :key="'cat-' + cIdx">
            <td class="border-b border-r border-default px-1 py-0.5">
              <UInput
                :model-value="category"
                placeholder="Label…"
                size="sm"
                variant="none"
                class="w-full"
                :aria-label="'Categorie ' + (cIdx + 1)"
                @update:model-value="(v: string | number) => setCategory(cIdx, String(v))"
              />
            </td>
            <td
              v-for="(serie, sIdx) in local.series"
              :key="'cell-' + cIdx + '-' + sIdx"
              class="border-b border-r border-default px-1 py-0.5 last:border-r-0"
            >
              <UInput
                :model-value="serie.values[cIdx]"
                type="number"
                min="0"
                size="sm"
                variant="none"
                class="w-full"
                :ui="{ base: 'text-right' }"
                :aria-label="'Waarde ' + serie.name + ', ' + category"
                @update:model-value="(v: string | number) => setValue(sIdx, cIdx, v)"
              />
            </td>
            <td class="w-9 border-b border-default px-1 py-0.5 text-center">
              <UButton
                color="error"
                variant="ghost"
                size="xs"
                square
                icon="i-lucide-trash-2"
                :disabled="local.categories.length <= 1"
                :aria-label="'Verwijder categorie ' + (cIdx + 1)"
                @click="removeCategory(cIdx)"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="flex items-center gap-2">
      <UButton
        color="neutral"
        variant="soft"
        size="xs"
        icon="i-lucide-plus"
        :disabled="!canAddCategory"
        @click="addCategory"
      >
        Categorie
      </UButton>
      <UButton
        color="neutral"
        variant="soft"
        size="xs"
        icon="i-lucide-plus"
        :disabled="!canAddSeries"
        @click="addSeries"
      >
        Serie
      </UButton>
      <span class="ml-auto text-xs text-muted">
        {{ local.categories.length }} / {{ CHART_MAX_CATEGORIES }} categorieën ·
        {{ local.series.length }} / {{ CHART_MAX_SERIES }} series
      </span>
    </div>
  </WCard>
</template>
