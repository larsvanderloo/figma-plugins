<!--
  ContentPanel — orkestrator voor de Content-tab (spec §9 T11 + §13 T31).

  Twee show-only-if-present-secties:
    1. Cards (v-for over `useCardEditor().cards`).
    2. Timeline (v-for over `useTimelineEditor().items`).

  Elke composable wikkelt store + bridge (incl. card-visual previews).
-->
<script setup lang="ts">
import CardItemEditor from '../editors/CardItemEditor.vue';
import TimelineItemEditor from '../editors/TimelineItemEditor.vue';
import WCard from '../ui/WCard.vue';
import type { TimelineItem } from '../../../types';
import { useCardEditor } from '../../composables/useCardEditor';
import { useTimelineEditor } from '../../composables/useTimelineEditor';

const cardEditor = useCardEditor();
const timelineEditor = useTimelineEditor();

// Card-size tile picker options. Order: text only → compact → default.
type CardSize = 'NO_ICON' | 'SM' | 'LG';

const sizeOptions: Array<{ value: CardSize; label: string; icon: string }> = [
  { value: 'NO_ICON', label: 'Alleen tekst', icon: 'i-lucide-type' },
  { value: 'SM', label: 'Compact', icon: 'i-lucide-rows-3' },
  { value: 'LG', label: 'Standaard', icon: 'i-lucide-rows-2' },
];

function onCardSizeChange(value: string | number | undefined): void {
  if (value === 'NO_ICON' || value === 'SM' || value === 'LG') {
    cardEditor.commitCardSize(value);
  }
}
</script>

<template>
  <div class="space-y-5">
    <UEmpty
      v-if="
        cardEditor.cards.length === 0 &&
        timelineEditor.items.length === 0
      "
      icon="i-lucide-layers"
      description="Geen onderdelen op deze slide."
      variant="naked"
      size="sm"
    />

    <section v-if="cardEditor.cards.length > 0" class="space-y-2">
      <h2 class="text-base font-semibold text-highlighted px-1">Kaarten</h2>
      <WCard title="Kaartweergave">
        <URadioGroup
          :model-value="cardEditor.cardSize"
          :items="sizeOptions"
          value-key="value"
          variant="card"
          orientation="horizontal"
          indicator="hidden"
          size="md"
          :ui="{
            fieldset: 'grid grid-cols-3 gap-2',
            item: 'relative overflow-hidden p-0',
            wrapper: 'w-full',
            label: 'w-full cursor-pointer',
          }"
          @update:model-value="onCardSizeChange"
        >
          <template #label="{ item }">
            <span
              class="relative flex flex-col items-center justify-center gap-1.5 px-3 py-3 transition-colors"
              :class="
                cardEditor.cardSize === item.value
                  ? 'bg-primary/10 text-primary'
                  : 'bg-default text-default hover:bg-elevated'
              "
            >
              <UIcon
                :name="item.icon"
                class="size-5 transition-opacity"
                :class="{ 'opacity-60': cardEditor.isApplyingCardSize && cardEditor.cardSize === item.value }"
              />
              <span
                class="text-xs font-medium transition-opacity"
                :class="{ 'opacity-60': cardEditor.isApplyingCardSize && cardEditor.cardSize === item.value }"
              >
                {{ item.label }}
              </span>
              <span
                v-if="cardEditor.isApplyingCardSize && cardEditor.cardSize === item.value"
                class="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden"
                aria-hidden="true"
              >
                <span class="block h-full w-1/3 bg-primary/80 animate-tile-progress" />
              </span>
            </span>
          </template>
        </URadioGroup>
      </WCard>
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

    <section v-if="timelineEditor.items.length > 0" class="space-y-2">
      <h2 class="text-base font-semibold text-highlighted px-1">Tijdlijn</h2>
      <TimelineItemEditor
        v-for="(item, idx) in timelineEditor.items"
        :key="item.copyWrapNodeId"
        :model-value="item"
        :index="idx + 1"
        @update:model-value="(val: TimelineItem) => timelineEditor.update(item.copyWrapNodeId, val)"
      />
    </section>

  </div>
</template>
