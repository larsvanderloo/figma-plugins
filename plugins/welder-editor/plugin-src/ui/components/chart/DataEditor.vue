<!--
  DataEditor — bewerkt store.state.manualDataPoints als 1..12 rijen.

  Elke rij bestaat uit:
    - UInput voor label (max 32 tekens, niet leeg)
    - UInput type="number" voor value (>= 0)
    - UButton (ghost, icon-only) om de rij te verwijderen

  Onderaan een knop "+ Rij toevoegen" die een nieuwe DataPoint
  pusht. Disabled bij MAX_ROWS rijen (reactief op chartType:
  progressbar = 6, overige = 12).

  Validatie verloopt via UFormField :error per veld (NL meldingen).
  Minimale rij afdwingen: de laatste rij kan niet verwijderd worden.

  v0.3.1: Mutaties lopen op store.state.manualDataPoints (niet dataPoints).
  Tab-wissel synchroniseert manualDataPoints → dataPoints via de store.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useChartStore } from '../../stores/useChartStore';
import { getMaxDataPoints } from '../../../chart-core/constants';

const store = useChartStore();

const MAX_ROWS = computed<number>(() => getMaxDataPoints(store.state.chartType));
const MIN_ROWS = 1;
const MAX_LABEL_LEN = 32;

// manualDataPoints is guaranteed defined by init(); fallback to [] for safety.
const manualPoints = computed(() => store.state.manualDataPoints || []);
const rowCount = computed<number>(() => manualPoints.value.length);
const hasRowErrors = computed<boolean>(() =>
  manualPoints.value.some(
    (p) => labelError(p.label) !== undefined || valueError(p.value) !== undefined,
  ),
);
const canAddRow = computed<boolean>(() => rowCount.value < MAX_ROWS.value);
const canRemoveRow = computed<boolean>(() => rowCount.value > MIN_ROWS);

const showAddError = ref<boolean>(false);
watch(hasRowErrors, (v) => {
  if (!v) showAddError.value = false;
});

/**
 * Retourneert een foutmelding voor het label-veld, of undefined
 * als het geldig is. UFormField rendert niets als :error undefined is.
 */
function labelError(label: string): string | undefined {
  const trimmed = label.trim();
  if (trimmed.length === 0) return 'Label is verplicht';
  if (label.length > MAX_LABEL_LEN) return `Max ${MAX_LABEL_LEN} tekens`;
  return undefined;
}

/**
 * Retourneert een foutmelding voor het value-veld, of undefined.
 * NaN kan voorkomen als UInput leeggemaakt wordt met v-model.number;
 * de runtime-waarde is dan NaN en wordt hier als "verplicht" afgehandeld.
 */
function valueError(value: number): string | undefined {
  if (Number.isNaN(value)) return 'Waarde is verplicht';
  if (value < 0) return 'Waarde moet 0 of hoger zijn';
  return undefined;
}

function addRow(): void {
  if (!canAddRow.value) return;
  if (hasRowErrors.value) {
    showAddError.value = true;
    return;
  }
  showAddError.value = false;
  if (!store.state.manualDataPoints) {
    store.state.manualDataPoints = [];
  }
  store.state.manualDataPoints.push({ label: '', value: 0 });
}

function removeRow(index: number): void {
  if (!canRemoveRow.value) return;
  if (!store.state.manualDataPoints) return;
  store.state.manualDataPoints.splice(index, 1);
}
</script>

<template>
  <section class="space-y-3">
    <UAlert
      :title="`${rowCount} / ${MAX_ROWS} rijen — max hangt af van grafiektype.`"
      color="info"
      variant="subtle"
      icon="i-lucide-info"
    />

    <!-- Kolomhoofden — één rij boven de data -->
    <div class="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs text-muted px-0">
      <span>Label</span>
      <span>Waarde</span>
      <span></span>
    </div>

    <ul class="space-y-2">
      <li
        v-for="(point, index) in manualPoints"
        :key="index"
        class="grid grid-cols-[1fr_1fr_auto] items-center gap-2"
      >
        <UInput
          v-model="point.label"
          :maxlength="MAX_LABEL_LEN"
          placeholder="Label"
          size="lg"
          :highlight="!!labelError(point.label)"
          :title="labelError(point.label)"
          :ui="{ base: labelError(point.label) ? 'ring-error focus-visible:ring-primary' : '' }"
          class="w-full"
        />

        <UInput
          v-model.number="point.value"
          type="number"
          :min="0"
          step="any"
          placeholder="0"
          size="lg"
          :highlight="!!valueError(point.value)"
          :title="valueError(point.value)"
          :ui="{ base: valueError(point.value) ? 'ring-error focus-visible:ring-primary' : '' }"
          class="w-full"
        />

        <UButton
          color="neutral"
          variant="ghost"
          icon="i-lucide-x"
          size="lg"
          :disabled="!canRemoveRow"
          aria-label="Rij verwijderen"
          @click="removeRow(index)"
        />
      </li>
    </ul>

    <UButton
      color="neutral"
      variant="soft"
      icon="i-lucide-plus"
      size="lg"
      :disabled="!canAddRow"
      block
      @click="addRow"
    >
      Rij toevoegen
    </UButton>
    <p v-if="showAddError" class="text-xs text-error">
      Vul eerst de lege rijen in voordat je een nieuwe toevoegt.
    </p>
  </section>
</template>
