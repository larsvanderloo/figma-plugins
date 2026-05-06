<!--
  ChartEditor — wrapper rond de 6 chart-sub-components (T12).

  Geport uit chart-builder's App.vue-layout (3-sectie-refactor):
    - Algemeen: Titel / Type / Thema  (+ Legenda-switch bij pie/donut)
    - Data: tabs (Handmatig / CSV)
    - Markering: min/max, Y-as, percentages
    - Benchmark: delta-switch + streefwaarde

  Props:
    - `chart-wrap-id`: node-id van de ChartWrap die bewerkt wordt.
    - `initial-data`: optionele ChartData-payload (`graphs.data`). Wanneer
      afwezig of null gebruiken we DEFAULT_CHART_DATA uit chart-core.
    - `slide-id`: nodig voor de `update-graph`-bridge-call.

  Emits:
    - Intern: deep-watcher op store.state → debounce 300ms → bridge.post
      `update-graph`. Geen expliciete emit naar de parent; bridge is de
      enige kanaal naar main-thread.

  Gebruikt useChartStore() als singleton. Parent (GraphsPanel) roept
  `store.init()` aan bij selectiewissel — deze component neemt dat niet
  op zich zodat een chart ↔ table switch de store niet corrumpeert.

  Size-preset (Grootte) is bewust NIET geëxposeerd: de ChartWrap in
  Slide Machine heeft vaste afmetingen, dus de editor-flow daaromheen
  is niet relevant voor v0.1.0.
-->
<script setup lang="ts">
import { computed, watch, onBeforeUnmount } from 'vue';
import TitleInput from './chart/TitleInput.vue';
import ChartTypeSelector from './chart/ChartTypeSelector.vue';
import ThemePicker from './chart/ThemePicker.vue';
import DataEditor from './chart/DataEditor.vue';
import CsvImport from './chart/CsvImport.vue';
import GeneralChartData from './chart/GeneralChartData.vue';
import { useChartStore } from '../stores/useChartStore';
import { usePluginBridge } from '../composables/usePluginBridge';

interface Props {
  chartWrapId: string;
  slideId: string;
}

const props = defineProps<Props>();

const store = useChartStore();
const bridge = usePluginBridge();

const dataTabItems = [
  { label: 'Handmatig', value: 'manual', slot: 'manual' as const },
  { label: 'CSV importeren', value: 'csv', slot: 'csv' as const },
];

// activeTab-computed zoals in chart-builder: v-model-writes via de
// store zodat dataPoints meteen gesynchroniseerd wordt (de deep-watcher
// hieronder triggert dan de debounced bridge-post).
const activeTab = computed<'manual' | 'csv'>({
  get() {
    return store.state.activeDataTab || 'manual';
  },
  set(tab: 'manual' | 'csv') {
    store.setActiveDataTab(tab);
  },
});

// Deep watcher met 300ms debounce (spec §5 update-graph). Eerste trigger
// wordt overgeslagen om initial-load-dispatch te voorkomen — `primed`
// klapt op true na de eerste mutatie-tik zodat alleen user-edits naar
// main gaan.
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let primed = false;

watch(
  () => store.state,
  () => {
    if (!primed) {
      primed = true;
      return;
    }
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      bridge.post({
        type: 'update-graph',
        slideId: props.slideId,
        chartWrapId: props.chartWrapId,
        data: store.toChartData(),
      });
    }, 300);
  },
  { deep: true },
);

onBeforeUnmount(() => {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
});
</script>

<template>
  <div class="space-y-4">
    <!-- Sectie 1: Algemeen -->
    <section class="space-y-6 bg-elevated rounded-[calc(var(--ui-radius)*3)] p-4">
      <div>
        <h3 class="text-base font-semibold text-default">Algemeen</h3>
        <p class="text-xs text-muted">Titel, type en thema van de grafiek.</p>
      </div>
      <TitleInput />
      <ChartTypeSelector />
      <ThemePicker />

      <USwitch
        v-if="store.state.chartType === 'pie' || store.state.chartType === 'donut'"
        v-model="store.state.showLegend"
        label="Legenda tonen"
        size="lg"
      />
    </section>

    <!-- Sectie 2: Data -->
    <section class="space-y-6 bg-elevated rounded-[calc(var(--ui-radius)*3)] p-4">
      <div>
        <h3 class="text-base font-semibold text-default">Data</h3>
        <p class="text-xs text-muted">Handmatig invoeren of CSV importeren.</p>
      </div>
      <UTabs
        v-model="activeTab"
        :items="dataTabItems"
        :unmount-on-hide="false"
        variant="pill"
        size="lg"
        class="w-full"
      >
        <template #manual>
          <DataEditor />
        </template>
        <template #csv>
          <CsvImport />
        </template>
      </UTabs>
    </section>

    <!-- Sectie 3: Markering -->
    <section class="space-y-6 bg-elevated rounded-[calc(var(--ui-radius)*3)] p-4">
      <div>
        <h3 class="text-base font-semibold text-default">Markering</h3>
        <p class="text-xs text-muted">Schaal en waarde-notatie.</p>
      </div>
      <GeneralChartData />
    </section>

    <!-- Sectie 4: Benchmark -->
    <section class="space-y-6 bg-elevated rounded-[calc(var(--ui-radius)*3)] p-4">
      <div>
        <h3 class="text-base font-semibold text-default">Benchmark</h3>
        <p class="text-xs text-muted">Stel een streefwaarde in voor delta-badges.</p>
      </div>

      <USwitch v-model="store.state.showBenchmarkDelta" label="Benchmark delta" size="lg" />

      <UFormField
        v-if="store.state.showBenchmarkDelta"
        name="benchmark"
        label="Benchmark-waarde"
        size="lg"
      >
        <UInputNumber
          :model-value="store.state.benchmark"
          placeholder="geen"
          :nullable="true"
          class="w-full"
          @update:model-value="
            (v: number | undefined) => {
              store.state.benchmark = v;
            }
          "
        />
      </UFormField>
    </section>
  </div>
</template>
