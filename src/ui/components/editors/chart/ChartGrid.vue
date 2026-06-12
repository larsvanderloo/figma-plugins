<script setup lang="ts">
// ============================================================
// ChartGrid — categorieën × series datagrid (T47.3).
//
// Zelfde interactiemodel als TableGrid: rij-gutter met rijmenu
// (invoegen/verwijderen), serie-headers met seriemenu, per-cel
// hover-menu met "Cel benadrukken" (datapunt-nadruk), en Enter
// navigeert omlaag. Geen som — dat is tabel-specifiek.
// ============================================================
import { computed, nextTick, onBeforeUpdate } from 'vue';
import type { DropdownMenuItem } from '@nuxt/ui';
import type { ChartWrapModel } from '../../../../shared/types';
import {
  chartDeltaDisplay,
  isCategoryEmphasized,
  isPointEmphasized,
} from '../../../../shared/chart-calculations';

interface Props {
  model: ChartWrapModel;
  maxCategories: number;
  maxSeries: number;
  /** T50 — single-series chart-types tonen alleen serie 0 (display-gating). */
  singleSeries: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'category-edit': [i: number, value: string];
  'series-name': [s: number, value: string];
  'value-edit': [s: number, i: number, raw: string | number];
  'cell-emphasis': [s: number, i: number, emphasis: boolean];
  'delta-override-edit': [i: number, value: string];
  'series-percent': [s: number, percent: boolean];
  'category-emphasis': [i: number, emphasis: boolean];
  'add-category-before': [i: number];
  'add-category-after': [i: number];
  'remove-category': [i: number];
  'add-series-before': [s: number];
  'add-series-after': [s: number];
  'remove-series': [s: number];
}>();

const canAddCategory = computed<boolean>(() => props.model.categories.length < props.maxCategories);
const canAddSeries = computed<boolean>(
  () => !props.singleSeries && props.model.series.length < props.maxSeries,
);
// T50 — display-gating: verborgen series blijven in het model bewaard.
const shownSeries = computed(() =>
  props.singleSeries ? props.model.series.slice(0, 1) : props.model.series,
);
const showDeltaColumn = computed<boolean>(() => props.model.showDelta === true);
// T53.2 — kolommen na de categorie: zichtbare series + optionele delta-kolom.
const colCount = computed<number>(
  () => shownSeries.value.length + (showDeltaColumn.value ? 1 : 0),
);

function deltaPlaceholder(i: number): string {
  const auto = chartDeltaDisplay(
    { ...props.model, deltaOverrides: undefined },
    i,
  );
  return auto !== null ? auto : '—';
}

function deltaOverrideValue(i: number): string {
  const overrides = props.model.deltaOverrides;
  return overrides !== undefined && i < overrides.length ? overrides[i] : '';
}

// T50.3 — pijl-optie bij delta-bewerking: zet/verwijder ▲/▼ vooraan de
// override. Zonder override wordt de auto-tekst als startpunt gebruikt.
function setDeltaArrow(i: number, arrow: string | null): void {
  let text = deltaOverrideValue(i).trim();
  if (text === '') {
    const auto = chartDeltaDisplay({ ...props.model, deltaOverrides: undefined }, i);
    text = auto !== null ? auto : '';
  }
  text = text.replace(/^[▲▼△▽↑↓]\s*/, '');
  const next = arrow !== null ? (text !== '' ? arrow + ' ' + text : arrow) : text;
  emit('delta-override-edit', i, next);
}

function deltaArrowMenuItems(i: number): DropdownMenuItem[][] {
  return [
    [
      { label: 'Pijl omhoog', icon: 'i-lucide-arrow-up', onSelect: () => setDeltaArrow(i, '▲') },
      { label: 'Pijl omlaag', icon: 'i-lucide-arrow-down', onSelect: () => setDeltaArrow(i, '▼') },
      { label: 'Pijl verwijderen', icon: 'i-lucide-eraser', onSelect: () => setDeltaArrow(i, null) },
    ],
  ];
}

// Per-serie swatch (Pitch-patroon) — zelfde ramp-idee als de canvas-tinten.
const SWATCH_OPACITY = ['opacity-100', 'opacity-75', 'opacity-50', 'opacity-30'];
function seriesSwatchClass(s: number): string {
  return 'inline-block size-3 shrink-0 rounded-sm bg-primary ' + SWATCH_OPACITY[s % SWATCH_OPACITY.length];
}

// --- menus (zelfde opbouw als TableGrid) ---------------------------

const menuContent = { align: 'start', side: 'bottom', sideOffset: 4, collisionPadding: 80 } as const;
const cellMenuContent = { align: 'end', side: 'bottom', sideOffset: 4, collisionPadding: 80 } as const;
const dropdownUi = { content: 'z-50 w-56 pointer-events-auto' } as const;

function rowMenuItems(i: number): DropdownMenuItem[][] {
  return [
    [
      {
        label: 'Rij erboven invoegen',
        icon: 'i-lucide-arrow-up-to-line',
        disabled: !canAddCategory.value,
        onSelect: () => emit('add-category-before', i),
      },
      {
        label: 'Rij eronder invoegen',
        icon: 'i-lucide-arrow-down-to-line',
        disabled: !canAddCategory.value,
        onSelect: () => emit('add-category-after', i),
      },
    ],
    [
      {
        label: 'Rij verwijderen',
        icon: 'i-lucide-trash-2',
        color: 'error',
        disabled: props.model.categories.length <= 1,
        onSelect: () => emit('remove-category', i),
      },
    ],
  ];
}

function seriesMenuItems(s: number): DropdownMenuItem[][] {
  const percentOn = props.model.series[s].percent === true;
  const percentItem: DropdownMenuItem = {
    label: percentOn ? 'Procentteken verbergen' : 'Procentteken tonen',
    icon: 'i-lucide-percent',
    onSelect: () => emit('series-percent', s, !percentOn),
  };
  // Single-series types: alleen het procent-item (insert/delete is daar
  // verborgen — serie 0 is de enige zichtbare kolom).
  if (props.singleSeries) return [[percentItem]];
  return [
    [percentItem],
    [
      {
        label: 'Serie links invoegen',
        icon: 'i-lucide-panel-left',
        disabled: !canAddSeries.value,
        onSelect: () => emit('add-series-before', s),
      },
      {
        label: 'Serie rechts invoegen',
        icon: 'i-lucide-panel-right',
        disabled: !canAddSeries.value,
        onSelect: () => emit('add-series-after', s),
      },
    ],
    [
      {
        label: 'Serie verwijderen',
        icon: 'i-lucide-trash-2',
        color: 'error',
        disabled: props.model.series.length <= 1,
        onSelect: () => emit('remove-series', s),
      },
    ],
  ];
}

function categoryMenuItems(i: number): DropdownMenuItem[][] {
  const emphasized = isCategoryEmphasized(props.model, i);
  return [
    [
      {
        label: emphasized ? 'Nadruk verwijderen' : 'Cel benadrukken',
        icon: 'i-lucide-bold',
        onSelect: () => emit('category-emphasis', i, !emphasized),
      },
    ],
    [
      {
        label: 'Rij erboven invoegen',
        icon: 'i-lucide-arrow-up-to-line',
        disabled: !canAddCategory.value,
        onSelect: () => emit('add-category-before', i),
      },
      {
        label: 'Rij eronder invoegen',
        icon: 'i-lucide-arrow-down-to-line',
        disabled: !canAddCategory.value,
        onSelect: () => emit('add-category-after', i),
      },
    ],
    [
      {
        label: 'Rij verwijderen',
        icon: 'i-lucide-trash-2',
        color: 'error',
        disabled: props.model.categories.length <= 1,
        onSelect: () => emit('remove-category', i),
      },
    ],
  ];
}

function cellMenuItems(s: number, i: number): DropdownMenuItem[][] {
  const emphasized = isPointEmphasized(props.model.series[s], i);
  return [
    [
      {
        label: emphasized ? 'Nadruk verwijderen' : 'Cel benadrukken',
        icon: 'i-lucide-bold',
        onSelect: () => emit('cell-emphasis', s, i, !emphasized),
      },
      {
        label: 'Cel leegmaken',
        icon: 'i-lucide-eraser',
        disabled: props.model.series[s].values[i] === 0,
        onSelect: () => emit('value-edit', s, i, 0),
      },
    ],
    [
      {
        label: 'Rij erboven invoegen',
        icon: 'i-lucide-arrow-up-to-line',
        disabled: !canAddCategory.value,
        onSelect: () => emit('add-category-before', i),
      },
      {
        label: 'Rij eronder invoegen',
        icon: 'i-lucide-arrow-down-to-line',
        disabled: !canAddCategory.value,
        onSelect: () => emit('add-category-after', i),
      },
      {
        label: 'Serie links invoegen',
        icon: 'i-lucide-panel-left',
        disabled: !canAddSeries.value,
        onSelect: () => emit('add-series-before', s),
      },
      {
        label: 'Serie rechts invoegen',
        icon: 'i-lucide-panel-right',
        disabled: !canAddSeries.value,
        onSelect: () => emit('add-series-after', s),
      },
    ],
    [
      {
        label: 'Rij verwijderen',
        icon: 'i-lucide-trash-2',
        color: 'error',
        disabled: props.model.categories.length <= 1,
        onSelect: () => emit('remove-category', i),
      },
      {
        label: 'Serie verwijderen',
        icon: 'i-lucide-trash-2',
        color: 'error',
        disabled: props.singleSeries || props.model.series.length <= 1,
        onSelect: () => emit('remove-series', s),
      },
    ],
  ];
}

// --- focus/keyboard (Enter → rij omlaag, zoals de tabel) ------------

const inputRefs = new Map<string, HTMLInputElement>();
onBeforeUpdate(() => {
  inputRefs.clear();
});

function refKey(s: number, i: number): string {
  return String(s) + '-' + String(i);
}

function setInputRef(el: unknown, s: number, i: number): void {
  const target = inputElement(el);
  if (target !== null) inputRefs.set(refKey(s, i), target);
}

function inputElement(el: unknown): HTMLInputElement | null {
  if (el instanceof HTMLInputElement) return el;
  if (el === null || typeof el !== 'object') return null;
  const exposed = el as { inputRef?: HTMLInputElement | { value?: HTMLInputElement | null } | null };
  if (exposed.inputRef instanceof HTMLInputElement) return exposed.inputRef;
  if (
    exposed.inputRef !== null &&
    typeof exposed.inputRef === 'object' &&
    exposed.inputRef.value instanceof HTMLInputElement
  ) {
    return exposed.inputRef.value;
  }
  return null;
}

function onEnter(s: number, i: number): void {
  const nextRow = i + 1;
  if (nextRow >= props.model.categories.length) return;
  void nextTick(() => {
    const target = inputRefs.get(refKey(s, nextRow));
    if (target !== undefined) {
      target.focus({ preventScroll: true });
      target.select();
    }
  });
}

function cellClass(s: number, i: number): string {
  return isPointEmphasized(props.model.series[s], i) ? 'font-semibold' : '';
}

function categoryCellClass(i: number): string {
  return isCategoryEmphasized(props.model, i) ? 'font-semibold' : '';
}
</script>

<template>
  <div class="overflow-x-auto rounded-sm border border-muted bg-default">
    <table class="w-full border-separate border-spacing-0 text-sm">
      <caption class="sr-only">Grafiekdata bewerken</caption>
      <colgroup>
        <col class="w-8" />
        <col class="min-w-28" />
        <col v-for="cgi in colCount" :key="'cg-' + cgi" class="w-16" />
      </colgroup>
      <thead>
        <tr class="bg-muted/30 text-dimmed">
          <th scope="col" class="w-9 border-b border-r border-default px-1 py-1">
            <span class="sr-only">Rijen</span>
          </th>
          <th scope="col" class="border-b border-r border-default px-2 py-1.5 text-left">
            <span class="text-xs font-medium">Categorie</span>
          </th>
          <template v-for="(serie, sIdx) in shownSeries" :key="'serie-' + sIdx">
            <th scope="col" class="border-b border-r border-default px-1 py-1 last:border-r-0">
              <div class="flex items-center gap-1">
                <span :class="seriesSwatchClass(sIdx)" aria-hidden="true" />
                <UInput
                  :model-value="serie.name"
                  :placeholder="'Serie ' + (sIdx + 1)"
                  size="xs"
                  variant="none"
                  class="min-w-20 flex-1"
                  :aria-label="'Naam serie ' + (sIdx + 1)"
                  @update:model-value="(v: string | number) => emit('series-name', sIdx, String(v))"
                />
                <UDropdownMenu
                  :items="seriesMenuItems(sIdx)"
                  :content="menuContent"
                  :ui="dropdownUi"
                  :modal="false"
                  size="xs"
                >
                  <UButton
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    square
                    icon="i-lucide-chevron-down"
                    :aria-label="'Menu voor serie ' + (sIdx + 1)"
                    :title="'Menu voor serie ' + (sIdx + 1)"
                  />
                </UDropdownMenu>
              </div>
            </th>
            <th
              v-if="sIdx === 0 && showDeltaColumn"
              scope="col"
              class="border-b border-r border-default px-2 py-1.5 text-left last:border-r-0"
            >
              <span class="text-xs font-medium text-dimmed">Delta</span>
            </th>
          </template>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(category, cIdx) in model.categories" :key="'cat-' + cIdx">
          <th
            scope="row"
            class="w-9 border-b border-r border-muted bg-muted/20 px-1 py-0 text-center align-middle"
          >
            <UDropdownMenu
              :items="rowMenuItems(cIdx)"
              :content="menuContent"
              :ui="dropdownUi"
              :modal="false"
              size="xs"
            >
              <UButton
                color="neutral"
                variant="ghost"
                size="xs"
                square
                :label="String(cIdx + 1)"
                class="text-[11px] font-medium text-dimmed"
                :aria-label="'Rij ' + (cIdx + 1) + ' opties'"
                :title="'Rij ' + (cIdx + 1) + ' opties'"
              />
            </UDropdownMenu>
          </th>
          <td
            class="group/cell relative border-b border-r border-muted px-1 py-0.5 transition-colors hover:bg-muted/10"
          >
            <UInput
              :model-value="category"
              placeholder="Label…"
              size="sm"
              variant="none"
              class="w-full"
              :ui="{ base: 'pr-7 ' + categoryCellClass(cIdx) }"
              :aria-label="'Categorie ' + (cIdx + 1)"
              @update:model-value="(v: string | number) => emit('category-edit', cIdx, String(v))"
            />
            <UDropdownMenu
              :items="categoryMenuItems(cIdx)"
              :content="cellMenuContent"
              :ui="dropdownUi"
              :modal="false"
              size="xs"
            >
              <UButton
                color="neutral"
                variant="ghost"
                size="xs"
                square
                icon="i-lucide-ellipsis"
                class="absolute right-0.5 top-1/2 -translate-y-1/2 opacity-0 transition-opacity hover:bg-muted/70 focus:opacity-100 group-focus-within/cell:opacity-70 group-hover/cell:opacity-70"
                :aria-label="'Menu voor categorie rij ' + (cIdx + 1)"
                :title="'Menu voor categorie rij ' + (cIdx + 1)"
              />
            </UDropdownMenu>
          </td>
          <template v-for="(serie, sIdx) in shownSeries" :key="'cell-' + cIdx + '-' + sIdx">
          <td
            class="group/cell relative border-b border-r border-muted px-1 py-0.5 transition-colors last:border-r-0 hover:bg-muted/10"
          >
            <UInput
              :ref="(el) => setInputRef(el, sIdx, cIdx)"
              :model-value="serie.values[cIdx]"
              type="number"
              min="0"
              size="sm"
              variant="none"
              class="w-full"
              :ui="{ base: 'px-1 text-center tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ' + cellClass(sIdx, cIdx) }"
              :aria-label="'Waarde ' + (serie.name !== '' ? serie.name : 'serie ' + (sIdx + 1)) + ', ' + category"
              @update:model-value="(v: string | number) => emit('value-edit', sIdx, cIdx, v)"
              @keydown.enter.prevent="onEnter(sIdx, cIdx)"
            />
            <UDropdownMenu
              :items="cellMenuItems(sIdx, cIdx)"
              :content="cellMenuContent"
              :ui="dropdownUi"
              :modal="false"
              size="xs"
            >
              <UButton
                color="neutral"
                variant="ghost"
                size="xs"
                square
                icon="i-lucide-ellipsis"
                class="absolute right-0.5 top-1/2 -translate-y-1/2 opacity-0 transition-opacity hover:bg-muted/70 focus:opacity-100 group-focus-within/cell:opacity-70 group-hover/cell:opacity-70"
                :aria-label="'Menu voor waarde rij ' + (cIdx + 1) + ', serie ' + (sIdx + 1)"
                :title="'Menu voor waarde rij ' + (cIdx + 1) + ', serie ' + (sIdx + 1)"
              />
            </UDropdownMenu>
          </td>
          <td
            v-if="sIdx === 0 && showDeltaColumn"
            class="group/delta relative border-b border-r border-muted px-1 py-0.5 last:border-r-0"
          >
            <UInput
              :model-value="deltaOverrideValue(cIdx)"
              :placeholder="deltaPlaceholder(cIdx)"
              size="sm"
              variant="none"
              class="w-full"
              :ui="{ base: 'pr-7 text-right text-dimmed placeholder:text-dimmed/60' }"
              :aria-label="'Delta-override rij ' + (cIdx + 1)"
              @update:model-value="(v: string | number) => emit('delta-override-edit', cIdx, String(v))"
            />
            <UDropdownMenu
              :items="deltaArrowMenuItems(cIdx)"
              :content="cellMenuContent"
              :ui="dropdownUi"
              :modal="false"
              size="xs"
            >
              <UButton
                color="neutral"
                variant="ghost"
                size="xs"
                square
                icon="i-lucide-arrow-up-down"
                class="absolute right-0.5 top-1/2 -translate-y-1/2 opacity-0 transition-opacity hover:bg-muted/70 focus:opacity-100 group-focus-within/delta:opacity-70 group-hover/delta:opacity-70"
                :aria-label="'Pijl voor delta rij ' + (cIdx + 1)"
                :title="'Pijl voor delta rij ' + (cIdx + 1)"
              />
            </UDropdownMenu>
          </td>
          </template>
        </tr>
      </tbody>
    </table>
  </div>
</template>
