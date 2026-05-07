<!--
  ContentPanel — orkestrator voor de Content-tab (spec §9 T11 + §13 T31 + T45).

  Rendert drie secties:
    1. Cards-sectie (v-for over `content.cards`, delegated naar `<CardItemEditor>`).
    2. Timeline-sectie (v-for over `content.timelineItems`, delegated naar
       `<TimelineItemEditor>`) — zichtbaar wanneer de slide een
       TimelineWrap heeft met ≥1 CopyWrap-item (spec §13 T31).
    3. Journey-sectie (JourneyEditor) — zichtbaar wanneer de slide een
       JourneyWrap heeft (spec §13 T45).

  App.vue toont de overall empty-state wanneer `content === null`, dus we
  gaan ervan uit dat `content` niet-null is bij mount (defensief renderen
  we echter alsnog een fallback).

  Mutatie-flow:
    - CardItemEditor's update:modelValue → `update-card`-message met
      payload `{ heading, paragraph }` (debounced 200ms binnen de
      editor). Visual-hash wordt niet via deze route gemuteerd — die
      komt via `upload-visual`.
    - CardItemEditor's upload-visual(bytes) → `upload-image`-message
      met targetNodeId = cardNodeId. Main-thread herkent de card-
      context en routeert naar applyCardVisual (zie code.ts).
    - TimelineItemEditor's update:modelValue → `update-timeline-item`-
      message met `copyWrapNodeId` + payload `{ heading, paragraph }`
      (debounced 200ms binnen de editor).
    - JourneyEditor's update:modelValue → `update-journey`-message
      met `slotId` + `desired` (debounced 200ms binnen JourneyEditor).
-->
<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import CardItemEditor from './CardItemEditor.vue';
import TimelineItemEditor from './TimelineItemEditor.vue';
import JourneyEditor from './JourneyEditor.vue';
import type { CardItem, TimelineItem, JourneyWrapModel } from '../../types';
import { usePluginBridge } from '../composables/usePluginBridge';
import { usePluginView } from '../stores/usePluginView';

const bridge = usePluginBridge();
const view = usePluginView();

// Card visual previews — bytes come from the sandbox via
// `card-visual-preview`, one message per Type=Image / Type=User card
// with a non-null visualHash. URLs feed `<img :src>`; the sizes feed
// the per-card status row (e.g. "742 KB"). Cleared whenever the slide
// changes so stale data from a previous slide doesn't bleed through.
const cardPreviewUrls = ref<Record<string, string>>({});
const cardPreviewSizes = ref<Record<string, number>>({});

function bytesToDataUrl(bytes: Uint8Array): string {
  let mime = 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    mime = 'image/jpeg';
  }
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunkSize)) as unknown as number[],
    );
  }
  return 'data:' + mime + ';base64,' + btoa(binary);
}

const unsubCardPreview = bridge.onMessage((msg) => {
  if (msg.type !== 'card-visual-preview') return;
  cardPreviewUrls.value = {
    ...cardPreviewUrls.value,
    [msg.cardNodeId]: bytesToDataUrl(msg.bytes),
  };
  cardPreviewSizes.value = {
    ...cardPreviewSizes.value,
    [msg.cardNodeId]: msg.bytes.length,
  };
});
onUnmounted(unsubCardPreview);

watch(
  () => view.state.currentSlideId,
  () => {
    cardPreviewUrls.value = {};
    cardPreviewSizes.value = {};
  },
);

const content = computed(() => view.state.content);
const slideId = computed(() => view.state.currentSlideId);
const cards = computed<CardItem[]>(() => content.value?.cards || []);
const timelineItems = computed<TimelineItem[]>(() => content.value?.timelineItems || []);
const journeyModel = computed<JourneyWrapModel | null>(() =>
  content.value !== null ? content.value.journeyModel : null,
);

function onCardUpdate(value: CardItem): void {
  const id = slideId.value;
  if (id === null) return;
  // Lokale store-update voor instant UI-reflectie; main-thread-echo
  // loopt via `target-updated` voor de save-indicator (toekomstig).
  const list = view.state.content ? view.state.content.cards : null;
  if (list !== null) {
    const idx = list.findIndex((c) => c.cardNodeId === value.cardNodeId);
    if (idx >= 0) {
      list[idx].heading = value.heading;
      list[idx].paragraph = value.paragraph;
      list[idx].icon = value.icon;
    }
  }
  // T32: icon kan null zijn (icon-instance niet zichtbaar) — stuur het dan
  // niet mee in de payload (main-thread silent-skip bij ontbrekend icon-veld).
  const iconPayload: { icon?: string } = value.icon !== null ? { icon: value.icon } : {};
  bridge.post({
    type: 'update-card',
    slideId: id,
    cardNodeId: value.cardNodeId,
    payload: {
      heading: value.heading,
      paragraph: value.paragraph,
      ...iconPayload,
    },
  });
}

function onCardVisualUpload(cardNodeId: string, bytes: Uint8Array): void {
  const id = slideId.value;
  if (id === null) return;
  // Visual-upload hergebruikt het `upload-image`-kanaal (spec §5):
  // targetNodeId = cardNodeId; main routeert naar applyCardVisual op
  // basis van card-parent (zie code.ts upload-image-handler).
  bridge.post({
    type: 'upload-image',
    targetNodeId: cardNodeId,
    bytes: bytes,
  });
}

function onTimelineItemUpdate(copyWrapNodeId: string, value: TimelineItem): void {
  const id = slideId.value;
  if (id === null) return;
  // Lokale store-update voor instant UI-reflectie (spiegel van
  // onCardUpdate — houdt de view consistent tijdens debounce-window).
  const list = view.state.content ? view.state.content.timelineItems : null;
  if (list !== null) {
    const idx = list.findIndex((t) => t.copyWrapNodeId === copyWrapNodeId);
    if (idx >= 0) {
      list[idx].heading = value.heading;
      list[idx].paragraph = value.paragraph;
    }
  }
  bridge.post({
    type: 'update-timeline-item',
    slideId: id,
    copyWrapNodeId: copyWrapNodeId,
    payload: {
      heading: value.heading,
      paragraph: value.paragraph,
    },
  });
}

function onJourneyUpdate(value: JourneyWrapModel): void {
  const id = slideId.value;
  if (id === null) return;
  // Lokale store-update voor instant UI-reflectie.
  if (view.state.content !== null) {
    view.state.content.journeyModel = value;
  }
  bridge.post({
    type: 'update-journey',
    slideId: id,
    slotId: value.slotId,
    desired: value,
  });
}
</script>

<template>
  <div class="space-y-5">
    <p
      v-if="cards.length === 0 && timelineItems.length === 0 && journeyModel === null"
      class="text-sm text-muted"
    >
      No cards on this slide.
    </p>

    <section v-if="cards.length > 0" class="space-y-3">
      <CardItemEditor
        v-for="(card, idx) in cards"
        :key="card.cardNodeId"
        :model-value="card"
        :index="idx + 1"
        :preview-url="cardPreviewUrls[card.cardNodeId] || null"
        :size-bytes="cardPreviewSizes[card.cardNodeId] || null"
        @update:model-value="onCardUpdate"
        @upload-visual="(bytes) => onCardVisualUpload(card.cardNodeId, bytes)"
      />
    </section>

    <section v-if="timelineItems.length > 0" class="space-y-3">
      <h2 class="text-sm font-semibold text-highlighted">Timeline</h2>
      <TimelineItemEditor
        v-for="(item, idx) in timelineItems"
        :key="item.copyWrapNodeId"
        :model-value="item"
        :index="idx + 1"
        @update:model-value="(val: TimelineItem) => onTimelineItemUpdate(item.copyWrapNodeId, val)"
      />
    </section>

    <section v-if="journeyModel !== null" class="space-y-3">
      <h2 class="text-sm font-semibold text-highlighted">Journey</h2>
      <JourneyEditor :model-value="journeyModel" @update:model-value="onJourneyUpdate" />
    </section>
  </div>
</template>
