<!--
  ContentPanel — orkestrator voor de Content-tab (spec §9 T11 + §13 T31 + T45).

  Drie show-only-if-present-secties:
    1. Cards (v-for over `useCardEditor().cards`).
    2. Timeline (v-for over `useTimelineEditor().items`).
    3. Journey (single editor via `useJourneyEditor()`).

  Elke composable wikkelt store + bridge (incl. card-visual previews).
-->
<script setup lang="ts">
import CardItemEditor from './CardItemEditor.vue';
import TimelineItemEditor from './TimelineItemEditor.vue';
import JourneyEditor from './JourneyEditor.vue';
import type { TimelineItem } from '../../types';
import { useCardEditor } from '../composables/useCardEditor';
import { useTimelineEditor } from '../composables/useTimelineEditor';
import { useJourneyEditor } from '../composables/useJourneyEditor';

const cardEditor = useCardEditor();
const timelineEditor = useTimelineEditor();
const journeyEditor = useJourneyEditor();

// Card-size tile picker options. Order: text only → compact → default.
const sizeOptions = [
  { value: 'NO_ICON' as const, label: 'Alleen tekst', icon: 'i-lucide-type' },
  { value: 'SM' as const, label: 'Compact', icon: 'i-lucide-rows-3' },
  { value: 'LG' as const, label: 'Standaard', icon: 'i-lucide-rows-2' },
];
</script>

<template>
  <div class="space-y-5">
    <p
      v-if="
        cardEditor.cards.length === 0 &&
        timelineEditor.items.length === 0 &&
        journeyEditor.model === null
      "
      class="text-sm text-muted"
    >
      Geen onderdelen op deze slide.
    </p>

    <section v-if="cardEditor.cards.length > 0" class="space-y-2">
      <h2 class="text-base font-semibold text-highlighted px-1">Kaarten</h2>
      <div
        class="rounded-[calc(var(--ui-radius)*4)] bg-default shadow-[0_4px_16px_-6px_rgba(0,0,0,0.08)] overflow-hidden divide-y divide-default"
      >
        <section class="space-y-3 px-5 py-5">
          <h3 class="text-sm font-semibold text-highlighted">Kaartweergave</h3>
          <div class="grid grid-cols-3 gap-2">
            <button
              v-for="opt in sizeOptions"
              :key="opt.value"
              type="button"
              class="relative flex flex-col items-center justify-center gap-1.5 rounded-lg border px-3 py-3 transition-colors focus:outline-none overflow-hidden"
              :class="
                cardEditor.cardSize === opt.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-default bg-default text-default hover:bg-elevated'
              "
              @click="(e) => { cardEditor.commitCardSize(opt.value); (e.currentTarget as HTMLElement).blur(); }"
            >
              <UIcon
                :name="opt.icon"
                class="size-5 transition-opacity"
                :class="{ 'opacity-60': cardEditor.isApplyingCardSize && cardEditor.cardSize === opt.value }"
              />
              <span
                class="text-xs font-medium transition-opacity"
                :class="{ 'opacity-60': cardEditor.isApplyingCardSize && cardEditor.cardSize === opt.value }"
              >
                {{ opt.label }}
              </span>
              <span
                v-if="cardEditor.isApplyingCardSize && cardEditor.cardSize === opt.value"
                class="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden"
                aria-hidden="true"
              >
                <span class="block h-full w-1/3 bg-primary/80 animate-tile-progress" />
              </span>
            </button>
          </div>
        </section>

        <section class="divide-y divide-default">
          <CardItemEditor
            v-for="(card, idx) in cardEditor.cards"
            :key="card.cardNodeId"
            :model-value="card"
            :index="idx + 1"
            :preview-url="cardEditor.previewUrls[card.cardNodeId] || null"
            :size-bytes="cardEditor.previewSizes[card.cardNodeId] || null"
            :icon-disabled="cardEditor.cardSize === 'NO_ICON'"
            @update:model-value="cardEditor.update"
            @upload-visual="(bytes) => cardEditor.uploadVisual(card.cardNodeId, bytes)"
          />
        </section>
      </div>
    </section>

    <section v-if="timelineEditor.items.length > 0" class="space-y-2">
      <h2 class="text-base font-semibold text-highlighted px-1">Tijdlijn</h2>
      <div
        class="rounded-[calc(var(--ui-radius)*4)] bg-default shadow-[0_4px_16px_-6px_rgba(0,0,0,0.08)] overflow-hidden divide-y divide-default"
      >
        <TimelineItemEditor
          v-for="(item, idx) in timelineEditor.items"
          :key="item.copyWrapNodeId"
          :model-value="item"
          :index="idx + 1"
          @update:model-value="(val: TimelineItem) => timelineEditor.update(item.copyWrapNodeId, val)"
        />
      </div>
    </section>

    <section v-if="journeyEditor.model !== null" class="space-y-2">
      <h2 class="text-base font-semibold text-highlighted px-1">Traject</h2>
      <JourneyEditor :model-value="journeyEditor.model" @update:model-value="journeyEditor.update" />
    </section>
  </div>
</template>
