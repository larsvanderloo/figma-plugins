<!--
  ChartTypeSelector — bindt store.chartType aan een USelectMenu.
  Flat lijst met separators tussen de drie groepen (Basis / Circulair / Voortgang)
  zonder label-headers.
-->
<script setup lang="ts">
import type { SelectMenuItem } from '@nuxt/ui';
import { useChartStore } from '../../stores/useChartStore';

const store = useChartStore();

const items: SelectMenuItem[] = [
  { label: 'Staafdiagram', value: 'bar', icon: 'i-lucide-bar-chart-3' },
  { label: 'Lijndiagram', value: 'line', icon: 'i-lucide-line-chart' },
  { type: 'separator' },
  { label: 'Taartdiagram', value: 'pie', icon: 'i-lucide-pie-chart' },
  { label: 'Donutdiagram', value: 'donut', icon: 'i-lucide-circle' },
  { type: 'separator' },
  { label: 'Voortgangsbalken', value: 'progressbar', icon: 'i-lucide-bar-chart-horizontal' },
  { label: 'Voortgangsring', value: 'radial', icon: 'i-lucide-loader-circle' },
];
</script>

<template>
  <UFormField name="chartType" label="Grafiektype" size="lg">
    <USelectMenu
      v-model="store.state.chartType"
      :items="items"
      value-key="value"
      size="lg"
      class="w-full"
    />
  </UFormField>
</template>
