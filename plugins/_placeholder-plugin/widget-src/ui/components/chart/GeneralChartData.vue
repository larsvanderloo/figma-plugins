<!--
  GeneralChartData — Sectie "Markering" in de iframe-editor.

  Volgorde: Min + Max → Y-as (conditioneel: bar/line EN min+max beide ingevuld) → Percentages tonen.

  Min / Max: alleen relevant voor bar, line, progressbar, radial (pie/donut negeren schaal).
  Y-as tonen: alleen zichtbaar als chartType bar of line EN min !== undefined EN max !== undefined.
  Percentages tonen: valueFormat-toggle (altijd zichtbaar).
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useChartStore } from '../../composables/useChartStore';

const store = useChartStore();

const showMinMax = computed(
  () =>
    store.state.chartType === 'bar' ||
    store.state.chartType === 'line' ||
    store.state.chartType === 'progressbar' ||
    store.state.chartType === 'radial',
);

/**
 * Y-as alleen tonen als chartType bar of line EN zowel min als max zijn ingevuld.
 */
const showYAxisToggle = computed(() => {
  if (store.state.chartType !== 'bar' && store.state.chartType !== 'line') return false;
  return store.state.min !== undefined && store.state.max !== undefined;
});
</script>

<template>
  <div class="space-y-3">
    <!-- Min / Max — alleen voor bar, line, progressbar; naast elkaar -->
    <div v-if="showMinMax" class="flex gap-3">
      <UFormField name="min" label="Minimum" size="lg" class="flex-1">
        <UInputNumber
          :model-value="store.state.min"
          placeholder="auto"
          :nullable="true"
          class="w-full"
          @update:model-value="
            (v: number | undefined) => {
              store.state.min = v;
            }
          "
        />
      </UFormField>

      <UFormField name="max" label="Maximum" size="lg" class="flex-1">
        <UInputNumber
          :model-value="store.state.max"
          placeholder="auto"
          :nullable="true"
          class="w-full"
          @update:model-value="
            (v: number | undefined) => {
              store.state.max = v;
            }
          "
        />
      </UFormField>
    </div>

    <!-- Y-as toggle — alleen voor bar en line, én als min+max beide ingevuld zijn -->
    <USwitch v-if="showYAxisToggle" v-model="store.state.showYAxis" label="Y-as tonen" size="lg" />

    <!-- Waarde-notatie: switch getal ↔ percentage -->
    <USwitch
      :model-value="store.state.valueFormat === 'percentage'"
      label="Percentages tonen"
      size="lg"
      @update:model-value="
        (v: boolean) => {
          store.state.valueFormat = v ? 'percentage' : 'number';
        }
      "
    />
  </div>
</template>
