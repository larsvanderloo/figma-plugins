<!--
  JourneyEditor — v-model-gebonden editor voor één JourneyWrap-instance
  (spec §13 T45 — Slot-based JourneyWrap v1).

  T45.6: USlider range-mode (twee thumbs) — startPct + endPct via één
  v-model array. Pill-breedte = (endPct - startPct) van container-breedte.

  T45.8: dynamische min-steps-between-thumbs op basis van canvas-gemeten
  label-breedte. Slider kan nooit kleiner gemaakt worden dan de label
  visueel nodig heeft. updateItemLabel auto-expandt de range bij langere
  labels.

  T45.9: stabiliseer canvas-meting via Inter font-preload (document.fonts.load)
  + minSpan-cache per label-string. (T45.10: sync-flush gerevert — caused
  amplification bij intermediate emits.)

  T46: Kolommen-sectie boven Items-sectie. 4-7 kolommen (configureerbaar)
  met header/subheader per kolom (T46.6: body-veld verwijderd). Zelfde
  patroon als items: clone + diff + debounced emit. Modelt JourneyColumnModel[]
  in modelValue.columns.

  Props:   modelValue: JourneyWrapModel
  Emits:   update:modelValue (debounced 200ms)

  - Items: stack van item-cards, elk met:
    - IconPicker voor icon-selectie
    - UInput voor label
    - Start-positie slider (0-100%)
    - Visuele start-marker (dunne verticale lijn op de timeline)
    - X-knop om item te verwijderen
  - Empty-state CTA bij items.length === 0
  - "+ Item toevoegen" block-button (disabled bij JOURNEY_MAX_ITEMS)
  - Granulaire watches (T30-pattern) met `!== local`-guards
  - Debounced emit 200ms, cloneItems helper voor deep-clone
-->
<script setup lang="ts">
import { ref, watch, computed, onBeforeUnmount } from 'vue';
import type { JourneyWrapModel, JourneyItemModel, JourneyColumnModel } from '../../types';
import {
  JOURNEY_MAX_ITEMS,
  JOURNEY_DEFAULT_ITEM,
  JOURNEY_POS_MIN_PCT,
  JOURNEY_POS_MAX_PCT,
  JOURNEY_POS_MIN_SPAN,
  JOURNEY_WIDTH,
  JOURNEY_CONTAINER_PADDING,
  JOURNEY_PILL_FIXED_PX,
  JOURNEY_LABEL_FONT_PX,
  JOURNEY_LABEL_FONT_FAMILY,
  JOURNEY_LABEL_SAFETY_FACTOR,
  JOURNEY_MIN_COLUMNS,
  JOURNEY_MAX_COLUMNS,
  JOURNEY_DEFAULT_COLUMN,
} from '../../constants';
import IconPicker from './IconPicker.vue';

interface Props {
  modelValue: JourneyWrapModel;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: JourneyWrapModel];
}>();

// -------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------

function cloneItems(items: JourneyItemModel[]): JourneyItemModel[] {
  const out: JourneyItemModel[] = [];
  for (let i = 0; i < items.length; i++) {
    out.push({
      itemNodeId: items[i].itemNodeId,
      icon: items[i].icon,
      label: items[i].label,
      startPct: items[i].startPct,
      endPct: items[i].endPct,
    });
  }
  return out;
}

function itemsDiffer(a: JourneyItemModel[], b: JourneyItemModel[]): boolean {
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i++) {
    if (a[i].itemNodeId !== b[i].itemNodeId) return true;
    if (a[i].icon !== b[i].icon) return true;
    if (a[i].label !== b[i].label) return true;
    if (a[i].startPct !== b[i].startPct) return true;
    if (a[i].endPct !== b[i].endPct) return true;
  }
  return false;
}

function cloneColumns(cols: JourneyColumnModel[]): JourneyColumnModel[] {
  const out: JourneyColumnModel[] = [];
  for (let i = 0; i < cols.length; i++) {
    out.push({
      header: cols[i].header,
      subheader: cols[i].subheader,
    });
  }
  return out;
}

function columnsDiffer(a: JourneyColumnModel[], b: JourneyColumnModel[]): boolean {
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i++) {
    if (a[i].header !== b[i].header) return true;
    if (a[i].subheader !== b[i].subheader) return true;
  }
  return false;
}

// Module-level canvas-context voor text-width-meting. Aangemaakt-on-demand
// (eerste call) zodat we geen DOM-allocatie doen bij component-mount als
// de editor nooit gebruikt wordt.
let measureCtx: CanvasRenderingContext2D | null = null;

function getMeasureCtx(): CanvasRenderingContext2D | null {
  if (measureCtx !== null) return measureCtx;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (ctx === null) return null;
  ctx.font = `${JOURNEY_LABEL_FONT_PX}px ${JOURNEY_LABEL_FONT_FAMILY}`;
  measureCtx = ctx;
  return ctx;
}

// Reactive flag: triggert recompute van minSpans zodra Inter geladen is.
// Tot die tijd valt canvas terug op OS-default sans-serif (bredere letters →
// over-conservatieve min-span, geen mid-word risk maar wel jitter bij font-load).
const fontsReady = ref<boolean>(false);

if (typeof document !== 'undefined' && (document as any).fonts !== undefined) {
  // Preload Inter zodat measureText vanaf de start de juiste font gebruikt.
  (document as any).fonts
    .load(`${JOURNEY_LABEL_FONT_PX}px Inter`)
    .then(() => {
      // Invalideer de cached context zodat de volgende getMeasureCtx een verse
      // ctx maakt met de nu-geladen Inter font.
      measureCtx = null;
      minSpanCache.clear();
      fontsReady.value = true; // triggert reactivity → minSpans computed re-runt
    })
    .catch(() => {
      /* silent fallback — meting werkt nog, alleen iets minder accuraat */
    });
}

// Module-level cache: label-string → min-span percentage. Voorkomt dubbele
// canvas.measureText-calls voor dezelfde label tijdens watch-roundtrips.
const minSpanCache = new Map<string, number>();

const JOURNEY_CONTENT_WIDTH = JOURNEY_WIDTH - JOURNEY_CONTAINER_PADDING * 2;

/**
 * Bereken de minimum-spread (in %) tussen de twee thumbs voor een gegeven
 * label. Gebaseerd op canvas-text-width + vaste pill-overhead, geconverteerd
 * naar percentage van content-breedte, met safety-factor en floor op
 * JOURNEY_POS_MIN_SPAN.
 */
function computeMinSpan(label: string): number {
  const cached = minSpanCache.get(label);
  if (cached !== undefined) return cached;

  const ctx = getMeasureCtx();
  if (ctx === null) return JOURNEY_POS_MIN_SPAN;
  const labelPx = ctx.measureText(label).width;
  const pillPx = (labelPx + JOURNEY_PILL_FIXED_PX) * JOURNEY_LABEL_SAFETY_FACTOR;
  const pct = (pillPx / JOURNEY_CONTENT_WIDTH) * 100;
  let result = Math.ceil(pct);
  if (result < JOURNEY_POS_MIN_SPAN) result = JOURNEY_POS_MIN_SPAN;
  if (result > JOURNEY_POS_MAX_PCT) result = JOURNEY_POS_MAX_PCT;

  minSpanCache.set(label, result);
  return result;
}

// -------------------------------------------------------------------
// Lokale state
// -------------------------------------------------------------------

const localItems = ref<JourneyItemModel[]>(cloneItems(props.modelValue.items));
const localColumns = ref<JourneyColumnModel[]>(cloneColumns(props.modelValue.columns));

const canAddItem = computed<boolean>(() => localItems.value.length < JOURNEY_MAX_ITEMS);
const canAddColumn = computed<boolean>(() => localColumns.value.length < JOURNEY_MAX_COLUMNS);
const canRemoveColumn = computed<boolean>(() => localColumns.value.length > 0);

const minSpans = computed<number[]>(() => {
  // Reactive dep op fontsReady zodat na font-load alle min-spans hercomputeren.
  void fontsReady.value;
  return localItems.value.map((item) => computeMinSpan(item.label));
});

// -------------------------------------------------------------------
// Granulaire watches (T30-pattern) met `!== local`-guards
// -------------------------------------------------------------------

watch(
  () => props.modelValue.items,
  (next) => {
    if (itemsDiffer(next, localItems.value)) localItems.value = cloneItems(next);
  },
);

watch(
  () => props.modelValue.columns,
  (next) => {
    if (columnsDiffer(next, localColumns.value)) localColumns.value = cloneColumns(next);
  },
);

// -------------------------------------------------------------------
// Debounced emit
// -------------------------------------------------------------------

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleEmit(): void {
  if (debounceTimer !== null) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    emit('update:modelValue', {
      slotId: props.modelValue.slotId,
      columns: cloneColumns(localColumns.value),
      items: cloneItems(localItems.value),
    });
  }, 200);
}

onBeforeUnmount(() => {
  if (debounceTimer !== null) clearTimeout(debounceTimer);
});

// -------------------------------------------------------------------
// Handlers
// -------------------------------------------------------------------

function addItem(): void {
  if (!canAddItem.value) return;
  localItems.value.push({
    itemNodeId: '',
    icon: JOURNEY_DEFAULT_ITEM.icon,
    label: JOURNEY_DEFAULT_ITEM.label,
    startPct: JOURNEY_DEFAULT_ITEM.startPct,
    endPct: JOURNEY_DEFAULT_ITEM.endPct,
  });
  scheduleEmit();
}

function removeItem(index: number): void {
  if (index < 0 || index >= localItems.value.length) return;
  localItems.value.splice(index, 1);
  scheduleEmit();
}

function updateItemIcon(index: number, icon: string): void {
  const item = localItems.value[index];
  if (item === undefined || item.icon === icon) return;
  localItems.value[index].icon = icon;
  scheduleEmit();
}

function updateItemLabel(index: number, value: string): void {
  const item = localItems.value[index];
  if (item === undefined || item.label === value) return;
  localItems.value[index].label = value;

  // Auto-expand range als nieuwe label te breed is voor huidige range.
  const requiredSpan = computeMinSpan(value);
  const currentSpan = item.endPct - item.startPct;
  if (currentSpan < requiredSpan) {
    let newEnd = item.startPct + requiredSpan;
    let newStart = item.startPct;
    if (newEnd > JOURNEY_POS_MAX_PCT) {
      newEnd = JOURNEY_POS_MAX_PCT;
      newStart = newEnd - requiredSpan;
      if (newStart < JOURNEY_POS_MIN_PCT) newStart = JOURNEY_POS_MIN_PCT;
    }
    localItems.value[index].startPct = newStart;
    localItems.value[index].endPct = newEnd;
  }

  scheduleEmit();
}

function updateItemRange(index: number, range: [number, number]): void {
  const item = localItems.value[index];
  if (item === undefined) return;
  const dynMinSpan = computeMinSpan(item.label);
  const [start, end] = range;
  // USlider zorgt al voor min-steps-between-thumbs, maar defensieve clamp:
  let s = Math.max(JOURNEY_POS_MIN_PCT, Math.min(JOURNEY_POS_MAX_PCT - dynMinSpan, start));
  let e = Math.max(s + dynMinSpan, Math.min(JOURNEY_POS_MAX_PCT, end));
  if (s === item.startPct && e === item.endPct) return;
  localItems.value[index].startPct = s;
  localItems.value[index].endPct = e;
  scheduleEmit();
}

function addColumn(): void {
  if (!canAddColumn.value) return;
  localColumns.value.push({
    header: JOURNEY_DEFAULT_COLUMN.header,
    subheader: JOURNEY_DEFAULT_COLUMN.subheader,
  });
  scheduleEmit();
}

function removeColumn(index: number): void {
  if (!canRemoveColumn.value) return;
  if (index < 0 || index >= localColumns.value.length) return;
  localColumns.value.splice(index, 1);
  scheduleEmit();
}

function updateColumnHeader(index: number, value: string): void {
  const col = localColumns.value[index];
  if (col === undefined || col.header === value) return;
  localColumns.value[index].header = value;
  scheduleEmit();
}

function updateColumnSubheader(index: number, value: string): void {
  const col = localColumns.value[index];
  if (col === undefined || col.subheader === value) return;
  localColumns.value[index].subheader = value;
  scheduleEmit();
}
</script>

<template>
  <div
    class="rounded-[calc(var(--ui-radius)*4)] bg-default shadow-[0_4px_16px_-6px_rgba(0,0,0,0.08)] overflow-hidden divide-y divide-[var(--ui-border)]"
  >
    <!-- Kolommen-sectie -->
    <section class="space-y-3 px-5 py-6">
      <div class="flex items-center justify-between gap-2">
        <h3 class="text-sm font-semibold text-highlighted">Kolommen</h3>
        <span class="text-xs text-muted"
          >{{ localColumns.length }} / {{ JOURNEY_MAX_COLUMNS }}</span
        >
      </div>

      <!-- Column-cards -->
      <div
        v-for="(col, idx) in localColumns"
        :key="'col-' + idx"
        class="rounded-[calc(var(--ui-radius)*2)] border border-[var(--ui-border)] overflow-hidden"
      >
        <!-- Card-header -->
        <div
          class="flex items-center justify-between gap-2 px-4 py-2 bg-elevated border-b border-[var(--ui-border)]"
        >
          <span class="text-sm font-semibold text-default">Kolom {{ idx + 1 }}</span>
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-x"
            size="xs"
            :disabled="!canRemoveColumn"
            :aria-label="`Verwijder kolom ${idx + 1}`"
            @click="removeColumn(idx)"
          />
        </div>

        <!-- Card-body: 3 inputs -->
        <div class="space-y-2 px-4 py-3 bg-elevated">
          <div class="grid grid-cols-[80px_1fr] items-center gap-3">
            <span class="text-xs font-medium text-muted">Header</span>
            <UInput
              :model-value="col.header"
              placeholder="Titel"
              size="sm"
              @update:model-value="(v: string) => updateColumnHeader(idx, v)"
            />
          </div>
          <div class="grid grid-cols-[80px_1fr] items-center gap-3">
            <span class="text-xs font-medium text-muted">Subheader</span>
            <UInput
              :model-value="col.subheader"
              placeholder="Beschrijving"
              size="sm"
              @update:model-value="(v: string) => updateColumnSubheader(idx, v)"
            />
          </div>
        </div>
      </div>

      <!-- Add-button -->
      <UButton
        color="neutral"
        variant="subtle"
        icon="i-lucide-plus"
        size="md"
        :disabled="!canAddColumn"
        block
        @click="addColumn"
        >Kolom toevoegen</UButton
      >
    </section>

    <!-- Items -->
    <section class="space-y-3 px-5 py-6">
      <div class="flex items-center justify-between gap-2">
        <h3 class="text-sm font-semibold text-highlighted">Items</h3>
        <span class="text-xs text-muted">{{ localItems.length }} / {{ JOURNEY_MAX_ITEMS }}</span>
      </div>

      <!-- Empty-state -->
      <div v-if="localItems.length === 0" class="space-y-3 py-4 text-center">
        <p class="text-sm text-muted">Nog geen items — voeg een item toe om te starten.</p>
        <UButton color="neutral" variant="soft" icon="i-lucide-plus" size="md" @click="addItem">
          Eerste item toevoegen
        </UButton>
      </div>

      <template v-else>
        <!-- Item-cards -->
        <div
          v-for="(item, idx) in localItems"
          :key="item.itemNodeId !== '' ? item.itemNodeId : 'item-' + idx"
          class="rounded-[calc(var(--ui-radius)*2)] border border-[var(--ui-border)] overflow-hidden"
        >
          <!-- Card-header -->
          <div
            class="flex items-center justify-between gap-2 px-4 py-2 bg-elevated border-b border-[var(--ui-border)]"
          >
            <span class="text-sm font-semibold text-default">Item {{ idx + 1 }}</span>
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-x"
              size="xs"
              :aria-label="`Verwijder item ${idx + 1}`"
              @click="removeItem(idx)"
            />
          </div>

          <!-- Card-body -->
          <div class="space-y-3 px-4 py-3 bg-elevated">
            <!-- Icon + Label op één rij -->
            <div class="flex items-center gap-3">
              <IconPicker
                :model-value="item.icon"
                @update:model-value="(v: string) => updateItemIcon(idx, v)"
              />
              <UInput
                :model-value="item.label"
                placeholder="Pill-tekst"
                size="sm"
                class="flex-1"
                @update:model-value="(v: string) => updateItemLabel(idx, v)"
              />
            </div>

            <!-- Range-slider (twee thumbs: start + eind) -->
            <UFormField
              name="range"
              :label="`Start: ${Math.round(item.startPct)}% — Eind: ${Math.round(item.endPct)}%`"
              size="md"
            >
              <USlider
                :model-value="[item.startPct, item.endPct]"
                :min="JOURNEY_POS_MIN_PCT"
                :max="JOURNEY_POS_MAX_PCT"
                :step="1"
                :min-steps-between-thumbs="minSpans[idx]"
                size="md"
                color="primary"
                @update:model-value="(v: number[]) => updateItemRange(idx, [v[0], v[1]])"
              />
            </UFormField>
          </div>
        </div>

        <!-- Add-button -->
        <UButton
          color="neutral"
          variant="subtle"
          icon="i-lucide-plus"
          size="md"
          :disabled="!canAddItem"
          block
          @click="addItem"
          >Item toevoegen</UButton
        >
      </template>
    </section>
  </div>
</template>
