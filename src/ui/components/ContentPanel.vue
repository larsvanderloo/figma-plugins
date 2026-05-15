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
      No cards on this slide.
    </p>

    <section v-if="cardEditor.cards.length > 0" class="space-y-3">
      <CardItemEditor
        v-for="(card, idx) in cardEditor.cards"
        :key="card.cardNodeId"
        :model-value="card"
        :index="idx + 1"
        :preview-url="cardEditor.previewUrls[card.cardNodeId] || null"
        :size-bytes="cardEditor.previewSizes[card.cardNodeId] || null"
        @update:model-value="cardEditor.update"
        @upload-visual="(bytes) => cardEditor.uploadVisual(card.cardNodeId, bytes)"
      />
    </section>

    <section v-if="timelineEditor.items.length > 0" class="space-y-3">
      <h2 class="text-sm font-semibold text-highlighted">Timeline</h2>
      <TimelineItemEditor
        v-for="(item, idx) in timelineEditor.items"
        :key="item.copyWrapNodeId"
        :model-value="item"
        :index="idx + 1"
        @update:model-value="(val: TimelineItem) => timelineEditor.update(item.copyWrapNodeId, val)"
      />
    </section>

    <section v-if="journeyEditor.model !== null" class="space-y-3">
      <h2 class="text-sm font-semibold text-highlighted">Journey</h2>
      <JourneyEditor :model-value="journeyEditor.model" @update:model-value="journeyEditor.update" />
    </section>
  </div>
</template>
