<script setup lang="ts">
/**
 * App.vue — Welder Editor iframe root (v0.2.0 chrome rewrite).
 *
 * Sprint 5 Wave 2 — replaces TabStrip layout with stacked panels.
 *
 * Layout:
 *   <UApp>
 *     initializing skeleton  — until 'init' bridge message arrives
 *     real UI:
 *       header card           — logo + intro + SlidePicker + skip toggle
 *       general card          — TitleDescriptionEditor + BadgeEditor + ImageEditor
 *       content card          — CardList + CardEditor + TimelineEditor
 *       graphs card           — TableEditor + JourneyEditor
 *       empty states          — noSlide / allEmpty / per-section absent
 *   </UApp>
 *
 * Data flow (ADR-0010):
 *   message-bus → usePluginBridge.onMessage → store actions → computed derived state → section props
 *   section emit → useEditorActions handler → optimistic store write + bridge.postAndWait
 *
 * Mutation discipline (ADR-0010 §3.1):
 *   App.vue NEVER writes to the store directly. All writes go through useEditorActions.
 *   Sections NEVER import the store — data arrives via props; user events arrive via emits.
 *
 * Pinia discipline (Sprint 5 Task 5.2 review):
 *   Pinia store: slides, activeSlideId, general, content, graphs, sync
 *   App.vue local refs: initializing, loadingSlide, selectedCardNodeId, busError
 *
 * Owner: ui-engineer. Resolves MON-2894436938 (Sprint 5, Task 5.2).
 */

import { ref, computed, onMounted } from 'vue';
import { storeToRefs } from 'pinia';

// ---- Store + actions ----
import { useEditorStore } from './stores/useEditorStore.js';
import { useEditorActions } from './composables/useEditorActions.js';
import { usePluginBridge } from './composables/usePluginBridge.js';

// ---- Sections ----
import { SlidePicker } from '@figma-plugins/sections-slide-picker';
import { PropertyPanel } from '@figma-plugins/sections-property-panel';
import { TitleDescriptionEditor } from '@figma-plugins/sections-title-description-editor';
import { BadgeEditor } from '@figma-plugins/sections-badge-editor';
import { IconPicker } from '@figma-plugins/sections-icon-picker';
import { ImageEditor } from '@figma-plugins/sections-image-editor';
import type { Transform } from '@figma-plugins/sections-image-editor';
import { CardList } from '@figma-plugins/sections-card-list';
import { CardEditor } from '@figma-plugins/sections-card-editor/CardEditor';
import type { CardItem } from '@figma-plugins/sections-card-editor/CardEditor';
import { TimelineEditor } from '@figma-plugins/sections-timeline-editor/TimelineEditor';
import { TableEditor } from '@figma-plugins/sections-table-editor';
import type { TableRow as CsvTableRow } from '@figma-plugins/sections-table-editor';
import { JourneyEditor } from '@figma-plugins/sections-journey-editor/JourneyEditor';

// ---- Shared message types ----
import type { Message } from '@shared/messages.js';

// ---- Assets ----
import welderLogo from './assets/welder-logo.svg';

// ---------------------------------------------------------------------------
// Store + actions + bridge
// ---------------------------------------------------------------------------

const store = useEditorStore();
const actions = useEditorActions();
const bridge = usePluginBridge();

const { slides, activeSlideId, general, content, graphs, sync } = storeToRefs(store);

// ---------------------------------------------------------------------------
// Local ephemeral state — NOT in Pinia (Sprint 5 Task 5.2 Pinia discipline)
// ---------------------------------------------------------------------------

/**
 * True until the first 'init' bridge message arrives. Shows full-page skeleton.
 *
 * Fast-path: if the store already has data (lastKnownAt > 0 from persisted state
 * hydration), skip the skeleton immediately. This handles both the warm-reload
 * case in production and the pre-populated-store pattern used in unit tests.
 */
const initializing = ref<boolean>(sync.value.lastKnownAt === 0);

/** True between user picking a slide and the slide-load:result arriving. */
const loadingSlide = ref<boolean>(false);

/** Top-level bus error from code side 'error' message. */
const busError = ref<string | null>(null);

/**
 * Active card in CardList→CardEditor flow.
 * Section-local ephemeral state: has no message-bus relevance (ADR-0010 §3.1).
 */
const selectedCardNodeId = ref<string | null>(null);

// ---------------------------------------------------------------------------
// Bridge: register inbound handlers BEFORE posting ui-ready
//
// Registration order matters: if main replies immediately to ui-ready with
// an 'init' message, the handler must already be registered to receive it.
// ---------------------------------------------------------------------------

bridge.onMessage((msg: Message) => {
  switch (msg.type) {
    case 'init': {
      store.reconcileFrom({
        fileKey: '',
        slides: msg.payload.slides,
        activeSlideId: msg.payload.initialSlideId,
        general: null,
        content: null,
        graphs: null,
      });

      if (msg.payload.initialSlideId !== null) {
        void actions.loadSlide(msg.payload.initialSlideId);
      }

      initializing.value = false;
      break;
    }

    case 'selection-changed': {
      const selectedSlide = slides.value.find((s) => msg.payload.selectedNodeIds.includes(s.id));
      if (selectedSlide !== undefined) {
        loadingSlide.value = true;
        void actions.loadSlide(selectedSlide.id).then(() => {
          loadingSlide.value = false;
        });
      }
      break;
    }

    case 'page-changed': {
      store.reconcileFrom({
        fileKey: sync.value.fileKey,
        slides: msg.payload.slides,
        activeSlideId: null,
        general: null,
        content: null,
        graphs: null,
      });
      selectedCardNodeId.value = null;
      break;
    }

    case 'error': {
      busError.value = msg.payload.message;
      break;
    }
  }
});

onMounted(() => {
  // ui-ready is a handshake message; not yet in the shared union type
  // (figma-api-engineer will add it in the next shared/messages.ts revision).
  // Cast to unknown first to avoid the union constraint.
  bridge.post({ type: 'ui-ready', version: 1 } as unknown as Message);
});

// ---------------------------------------------------------------------------
// Derived state
// ---------------------------------------------------------------------------

const isLoading = computed<boolean>(
  () => sync.value.inFlightRequestId !== null || sync.value.reconciling,
);

const noSlideSelected = computed<boolean>(() => activeSlideId.value === null);

/**
 * The SlideSummary for the active slide; used for the skip toggle.
 */
const currentSummary = computed(() => {
  if (activeSlideId.value === null) return null;
  return slides.value.find((s) => s.id === activeSlideId.value) ?? null;
});

const isSkipped = computed<boolean>(() => {
  const summary = currentSummary.value;
  return summary !== null && summary.isSkipped === true;
});

const hasGeneral = computed<boolean>(() => !noSlideSelected.value && general.value !== null);

const hasGraphs = computed<boolean>(
  () =>
    !noSlideSelected.value &&
    graphs.value !== null &&
    (graphs.value.tableModel !== null || graphs.value.journeyModel !== null),
);

const allEmpty = computed<boolean>(
  () =>
    !noSlideSelected.value &&
    general.value === null &&
    content.value === null &&
    graphs.value === null,
);

const sectionsDisabled = computed<boolean>(() => noSlideSelected.value || isLoading.value);

/** True when cards exist in the content slice. */
const hasCards = computed<boolean>(() => content.value !== null && content.value.cards.length > 0);

/** True when timeline items exist in the content slice. */
const hasTimeline = computed<boolean>(
  () => content.value !== null && content.value.timelineItems.length > 0,
);

/** True when content loaded but both cards AND timeline are empty. */
const contentLoadedButEmpty = computed<boolean>(
  () => content.value !== null && !hasCards.value && !hasTimeline.value,
);

/**
 * The CardItem currently active in CardEditor.
 * Resets to null when content changes (new slide loaded).
 */
const selectedCard = computed<CardItem | null>(() => {
  if (content.value === null || selectedCardNodeId.value === null) return null;
  return content.value.cards.find((c) => c.cardNodeId === selectedCardNodeId.value) ?? null;
});

// ---------------------------------------------------------------------------
// SlidePicker event handler
// ---------------------------------------------------------------------------

function handleSlideSelect(slideId: string): void {
  loadingSlide.value = true;
  selectedCardNodeId.value = null;
  void actions.loadSlide(slideId).then(() => {
    loadingSlide.value = false;
  });
}

// ---------------------------------------------------------------------------
// Skip toggle
// ---------------------------------------------------------------------------

function toggleSkip(): void {
  const summary = currentSummary.value;
  if (summary === null || summary.isSkipped === null) return;
  bridge.post({
    type: 'set-slide-skipped',
    version: 1,
    payload: { slideId: summary.id, skipped: !summary.isSkipped },
  } as unknown as Message);
}

// ---------------------------------------------------------------------------
// TitleDescriptionEditor
// ---------------------------------------------------------------------------

function handleTitleDescriptionUpdate(patch: { heading: string; paragraph: string | null }): void {
  if (general.value === null || general.value.titleDescription === null) return;
  const { copyWrapId } = general.value.titleDescription;
  void actions.applyTitleDescription({
    copyWrapId,
    heading: patch.heading,
    ...(patch.paragraph !== null ? { paragraph: patch.paragraph } : {}),
  });
}

// ---------------------------------------------------------------------------
// BadgeEditor
// ---------------------------------------------------------------------------

function handleBadgeUpdate(patch: { label: string; icon: string }): void {
  if (general.value === null || general.value.badge === null) return;
  const { badgeNodeId } = general.value.badge;
  void actions.applyBadge({ badgeNodeId, label: patch.label, icon: patch.icon });
}

// ---------------------------------------------------------------------------
// ImageEditor
// ---------------------------------------------------------------------------

function handleImageUpdate(bytes: Uint8Array): void {
  if (general.value === null || general.value.image === null) return;
  const { imageWrapId } = general.value.image;
  void actions.applyImage({ imageWrapId, bytes });
}

function handleCropTransformUpdate(_transform: Transform): void {
  // apply-crop is a v0.2.0 action — not wired in v0.1.0. Silently drop.
}

// ---------------------------------------------------------------------------
// CardList + CardEditor
// ---------------------------------------------------------------------------

function handleCardSelect(cardNodeId: string): void {
  selectedCardNodeId.value = cardNodeId;
}

function handleCardHeadingUpdate(payload: { cardNodeId: string; heading: string }): void {
  void actions.applyCard({ cardNodeId: payload.cardNodeId, heading: payload.heading });
}

function handleCardParagraphUpdate(payload: { cardNodeId: string; paragraph: string }): void {
  void actions.applyCard({ cardNodeId: payload.cardNodeId, paragraph: payload.paragraph });
}

function handleCardIconUpdate(payload: { cardNodeId: string; iconName: string }): void {
  void actions.applyCard({ cardNodeId: payload.cardNodeId, icon: payload.iconName });
}

function handleCardVisualUpdate(payload: { cardNodeId: string; bytes: Uint8Array }): void {
  // Future: requires card imageWrapId in message contract. Accept and drop.
  void payload;
}

// ---------------------------------------------------------------------------
// TimelineEditor
// ---------------------------------------------------------------------------

function handleTimelineItemHeadingUpdate(payload: { itemId: string; value: string }): void {
  void actions.applyTimeline({ copyWrapNodeId: payload.itemId, heading: payload.value });
}

function handleTimelineItemParagraphUpdate(payload: { itemId: string; value: string }): void {
  void actions.applyTimeline({ copyWrapNodeId: payload.itemId, paragraph: payload.value });
}

// ---------------------------------------------------------------------------
// TableEditor
// ---------------------------------------------------------------------------

function handleTableWidth(payload: { slotId: string; width: 'sm' | 'md' | 'lg' }): void {
  if (graphs.value === null || graphs.value.tableModel === null) return;
  void actions.applyTable({
    slotId: payload.slotId,
    desired: { ...graphs.value.tableModel, width: payload.width },
  });
}

function handleTableTextSize(payload: { slotId: string; textSize: 'sm' | 'md' | 'lg' }): void {
  if (graphs.value === null || graphs.value.tableModel === null) return;
  void actions.applyTable({
    slotId: payload.slotId,
    desired: { ...graphs.value.tableModel, textSize: payload.textSize },
  });
}

function handleTableHasColumnHeader(payload: { slotId: string; hasColumnHeader: boolean }): void {
  if (graphs.value === null || graphs.value.tableModel === null) return;
  void actions.applyTable({
    slotId: payload.slotId,
    desired: { ...graphs.value.tableModel, hasColumnHeader: payload.hasColumnHeader },
  });
}

function handleTableRowCount(payload: { slotId: string; delta: 1 | -1 }): void {
  if (graphs.value === null || graphs.value.tableModel === null) return;
  const model = graphs.value.tableModel;
  const rows = [...model.rows];
  if (payload.delta === 1) {
    const colCount = rows[0]?.cells.length ?? 0;
    rows.push({
      rowNodeId: '',
      cells: Array.from({ length: colCount }, () => ({ cellNodeId: '', value: '' })),
    });
  } else {
    if (rows.length > 1) rows.pop();
  }
  void actions.applyTable({ slotId: payload.slotId, desired: { ...model, rows } });
}

function handleTableColCount(payload: { slotId: string; delta: 1 | -1 }): void {
  if (graphs.value === null || graphs.value.tableModel === null) return;
  const model = graphs.value.tableModel;
  const rows = model.rows.map((row) => {
    const cells = [...row.cells];
    if (payload.delta === 1) {
      cells.push({ cellNodeId: '', value: '' });
    } else {
      if (cells.length > 1) cells.pop();
    }
    return { ...row, cells };
  });
  void actions.applyTable({ slotId: payload.slotId, desired: { ...model, rows } });
}

function handleTableCell(payload: {
  slotId: string;
  row: number;
  col: number;
  value: string;
}): void {
  if (graphs.value === null || graphs.value.tableModel === null) return;
  const model = graphs.value.tableModel;
  const rows = model.rows.map((row, rIdx) => {
    if (rIdx !== payload.row) return row;
    const cells = row.cells.map((cell, cIdx) =>
      cIdx === payload.col ? { ...cell, value: payload.value } : cell,
    );
    return { ...row, cells };
  });
  void actions.applyTable({ slotId: payload.slotId, desired: { ...model, rows } });
}

function handleTableReplaceContent(payload: { slotId: string; rows: CsvTableRow[] }): void {
  if (graphs.value === null || graphs.value.tableModel === null) return;
  const model = graphs.value.tableModel;
  void actions.applyTable({ slotId: payload.slotId, desired: { ...model, rows: payload.rows } });
}

// ---------------------------------------------------------------------------
// JourneyEditor
// ---------------------------------------------------------------------------

function handleJourneyColumnHeader(payload: {
  slotId: string;
  columnIndex: number;
  header?: string;
  subheader?: string;
}): void {
  if (graphs.value === null || graphs.value.journeyModel === null) return;
  const model = graphs.value.journeyModel;
  const columns = model.columns.map((col, idx) => {
    if (idx !== payload.columnIndex) return col;
    return {
      header: payload.header !== undefined ? payload.header : col.header,
      subheader: payload.subheader !== undefined ? payload.subheader : col.subheader,
    };
  });
  void actions.applyJourney({ slotId: payload.slotId, desired: { ...model, columns } });
}

function handleJourneyItemLabel(payload: { itemId: string; label: string }): void {
  if (graphs.value === null || graphs.value.journeyModel === null) return;
  const model = graphs.value.journeyModel;
  const items = model.items.map((item) =>
    item.itemNodeId === payload.itemId ? { ...item, label: payload.label } : item,
  );
  void actions.applyJourney({ slotId: model.slotId, desired: { ...model, items } });
}

function handleJourneyItemIcon(payload: { itemId: string; icon: string }): void {
  if (graphs.value === null || graphs.value.journeyModel === null) return;
  const model = graphs.value.journeyModel;
  const items = model.items.map((item) =>
    item.itemNodeId === payload.itemId ? { ...item, icon: payload.icon } : item,
  );
  void actions.applyJourney({ slotId: model.slotId, desired: { ...model, items } });
}

function handleJourneyItemRange(payload: {
  itemId: string;
  startPct?: number;
  endPct?: number;
}): void {
  if (graphs.value === null || graphs.value.journeyModel === null) return;
  const model = graphs.value.journeyModel;
  const items = model.items.map((item) => {
    if (item.itemNodeId !== payload.itemId) return item;
    return {
      ...item,
      ...(payload.startPct !== undefined ? { startPct: payload.startPct } : {}),
      ...(payload.endPct !== undefined ? { endPct: payload.endPct } : {}),
    };
  });
  void actions.applyJourney({ slotId: model.slotId, desired: { ...model, items } });
}
</script>

<template>
  <UApp>
    <!--
      Initializing skeleton — shown until the 'init' bridge message arrives.
      Mirrors v0.2.1 pattern: full chrome skeleton so the user sees layout
      immediately, not a blank screen.
    -->
    <div v-if="initializing" class="flex h-full flex-col bg-elevated text-default">
      <main class="flex-1 overflow-y-auto">
        <div class="mx-auto max-w-2xl space-y-3 p-3">
          <!-- Header skeleton -->
          <section
            class="bg-default rounded-[calc(var(--ui-radius)*4)] px-5 py-8 shadow-[0_4px_16px_-6px_rgba(0,0,0,0.08)] space-y-5"
            aria-label="Loading"
            aria-busy="true"
          >
            <div class="flex flex-col items-center space-y-3">
              <USkeleton class="h-8 w-40" />
              <USkeleton class="h-4 w-3/4" />
              <USkeleton class="h-4 w-1/2" />
            </div>
            <div class="space-y-2">
              <USkeleton class="h-4 w-16" />
              <USkeleton class="h-9 w-full" />
            </div>
          </section>
          <!-- Editor section skeleton -->
          <section
            class="bg-default rounded-[calc(var(--ui-radius)*4)] px-5 py-8 shadow-[0_4px_16px_-6px_rgba(0,0,0,0.08)] space-y-3"
            aria-hidden="true"
          >
            <USkeleton class="h-4 w-24" />
            <USkeleton class="h-9 w-full" />
            <USkeleton class="h-20 w-full" />
          </section>
        </div>
      </main>
    </div>

    <!-- Real UI — shown once 'init' received -->
    <div v-else class="flex h-full flex-col bg-elevated text-default">
      <!--
        Bus-level error: shown when code side sends an 'error' message.
        role="alert" on UAlert announces immediately to screen readers.
      -->
      <UAlert
        v-if="busError !== null"
        color="error"
        icon="i-lucide-circle-alert"
        :description="busError"
        class="rounded-none border-b border-error-200"
      />

      <main class="flex-1 overflow-y-auto">
        <div class="mx-auto max-w-2xl space-y-3 p-3">
          <!-- ----------------------------------------------------------------
               Header card: logo + intro + slide picker + skip toggle
               ---------------------------------------------------------------- -->
          <section
            class="bg-default rounded-[calc(var(--ui-radius)*4)] px-5 py-8 shadow-[0_4px_16px_-6px_rgba(0,0,0,0.08)] space-y-5"
            aria-label="Welder Editor"
          >
            <div class="flex flex-col items-center text-center space-y-3">
              <img :src="welderLogo" alt="Welder" class="h-8 w-auto" />
              <p class="text-sm text-muted max-w-xs leading-relaxed">
                Pick a slide to edit its title, badge, image, cards, timeline, and graphs.
              </p>
            </div>

            <div class="space-y-2">
              <div class="flex items-center gap-2">
                <SlidePicker
                  :slides="slides"
                  :active-slide-id="activeSlideId"
                  :loading="isLoading"
                  class="flex-1"
                  @select="handleSlideSelect"
                />
                <!--
                  Skip toggle: only rendered in Slides editor (isSkipped !== null).
                  aria-label describes both the icon-only button states.
                -->
                <UButton
                  v-if="currentSummary !== null && currentSummary.isSkipped !== null"
                  :icon="isSkipped ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                  variant="ghost"
                  color="neutral"
                  size="md"
                  class="shrink-0"
                  :aria-label="
                    isSkipped ? 'Slide skipped — click to include' : 'Include slide — click to skip'
                  "
                  :aria-pressed="isSkipped"
                  @click="toggleSkip"
                />
              </div>
            </div>
          </section>

          <!-- ----------------------------------------------------------------
               Slide loading skeleton — header stays real; editors pulse
               ---------------------------------------------------------------- -->
          <template v-if="loadingSlide">
            <section
              class="bg-default rounded-[calc(var(--ui-radius)*4)] px-5 py-8 shadow-[0_4px_16px_-6px_rgba(0,0,0,0.08)] space-y-3"
              aria-label="Loading slide"
              aria-busy="true"
            >
              <USkeleton class="h-4 w-24" />
              <USkeleton class="h-9 w-full" />
              <USkeleton class="h-20 w-full" />
            </section>
            <section
              class="bg-default rounded-[calc(var(--ui-radius)*4)] px-5 py-8 shadow-[0_4px_16px_-6px_rgba(0,0,0,0.08)] space-y-3"
              aria-hidden="true"
            >
              <USkeleton class="h-4 w-20" />
              <USkeleton class="h-9 w-full" />
              <USkeleton class="h-9 w-2/3" />
            </section>
          </template>

          <template v-else>
            <!-- No slide selected -->
            <section
              v-if="noSlideSelected"
              class="bg-default rounded-[calc(var(--ui-radius)*4)] px-5 py-8 shadow-[0_4px_16px_-6px_rgba(0,0,0,0.08)]"
            >
              <UAlert
                color="neutral"
                icon="i-lucide-info"
                description="Pick a slide above to start editing."
              />
            </section>

            <!-- Slide selected but no editable wrappers at all -->
            <section
              v-else-if="allEmpty"
              class="bg-default rounded-[calc(var(--ui-radius)*4)] px-5 py-8 shadow-[0_4px_16px_-6px_rgba(0,0,0,0.08)]"
            >
              <UAlert
                color="neutral"
                icon="i-lucide-info"
                description="This slide has no editable wrappers. Add a CopyWrap, CardWrap, or TableWrap from the Welder library."
              />
            </section>

            <!--
              Stacked editor cards.
              Wrapped in fieldset[disabled] when the slide is skipped so all
              form controls are disabled automatically. opacity-50 + pointer-events-none
              provide visual + click-block feedback beyond the fieldset semantics.
            -->
            <fieldset
              v-else
              :disabled="isSkipped"
              :class="[isSkipped ? 'opacity-50 pointer-events-none' : '', 'contents']"
              style="border: 0; padding: 0; margin: 0; min-width: 0"
            >
              <!-- ----------------------------------------------------------
                   General card
                   ---------------------------------------------------------- -->
              <section
                v-if="hasGeneral"
                class="bg-default rounded-[calc(var(--ui-radius)*4)] shadow-[0_4px_16px_-6px_rgba(0,0,0,0.08)]"
                aria-labelledby="section-heading-general"
              >
                <div class="px-5 py-6 space-y-4">
                  <h3 id="section-heading-general" class="text-sm font-semibold text-highlighted">
                    General
                  </h3>

                  <!-- TitleDescriptionEditor -->
                  <PropertyPanel
                    v-if="general !== null && general.titleDescription !== null"
                    title="Title &amp; Description"
                  >
                    <TitleDescriptionEditor
                      :model="general.titleDescription"
                      :disabled="sectionsDisabled"
                      @update:model="handleTitleDescriptionUpdate"
                    />
                  </PropertyPanel>

                  <!-- BadgeEditor -->
                  <PropertyPanel v-if="general !== null && general.badge !== null" title="Badge">
                    <BadgeEditor
                      :model="general.badge"
                      :disabled="sectionsDisabled"
                      @update:model="handleBadgeUpdate"
                    >
                      <template #icon-picker="{ icon, onChange, disabled: slotDisabled }">
                        <IconPicker
                          :model-value="icon"
                          :disabled="slotDisabled === true"
                          @update:model-value="(key: string) => onChange(key)"
                        />
                      </template>
                    </BadgeEditor>
                  </PropertyPanel>

                  <!-- ImageEditor -->
                  <PropertyPanel v-if="general !== null && general.image !== null" title="Image">
                    <ImageEditor
                      :model="general.image"
                      :disabled="sectionsDisabled"
                      @update:image="handleImageUpdate"
                      @update:crop-transform="handleCropTransformUpdate"
                    />
                  </PropertyPanel>

                  <!--
                    general !== null but all sub-sections absent:
                    slide has a GeneralSections record with no CopyWrap/Badge/ImageWrap.
                  -->
                  <UAlert
                    v-if="
                      general !== null &&
                      general.titleDescription === null &&
                      general.badge === null &&
                      general.image === null
                    "
                    color="neutral"
                    icon="i-lucide-info"
                    description="No editable general elements on this slide."
                  />
                </div>
              </section>

              <!-- ----------------------------------------------------------
                   Content card
                   ---------------------------------------------------------- -->
              <section
                v-if="content !== null"
                class="bg-default rounded-[calc(var(--ui-radius)*4)] shadow-[0_4px_16px_-6px_rgba(0,0,0,0.08)]"
                aria-labelledby="section-heading-content"
              >
                <div class="px-5 py-6 space-y-4">
                  <h3 id="section-heading-content" class="text-sm font-semibold text-highlighted">
                    Content
                  </h3>

                  <!-- Cards block -->
                  <PropertyPanel v-if="hasCards" title="Cards">
                    <div class="space-y-3">
                      <CardList
                        :model="content"
                        :active-card-node-id="selectedCardNodeId"
                        :disabled="sectionsDisabled"
                        @select="handleCardSelect"
                      />
                      <CardEditor
                        v-if="selectedCard !== null"
                        :card="selectedCard"
                        :label="`Card ${content!.cards.findIndex((c) => c.cardNodeId === selectedCardNodeId) + 1} of ${content!.cards.length}`"
                        :disabled="sectionsDisabled"
                        @update:heading="handleCardHeadingUpdate"
                        @update:paragraph="handleCardParagraphUpdate"
                        @update:icon="handleCardIconUpdate"
                        @update:visual="handleCardVisualUpdate"
                      />
                    </div>
                  </PropertyPanel>

                  <!-- Timeline block -->
                  <PropertyPanel v-if="hasTimeline" title="Timeline">
                    <TimelineEditor
                      :items="content!.timelineItems"
                      :disabled="sectionsDisabled"
                      @update:item-heading="handleTimelineItemHeadingUpdate"
                      @update:item-paragraph="handleTimelineItemParagraphUpdate"
                    />
                  </PropertyPanel>

                  <!-- Content loaded but empty (no cards, no timeline) -->
                  <UAlert
                    v-if="contentLoadedButEmpty"
                    color="neutral"
                    icon="i-lucide-info"
                    description="No cards or timeline items on this slide."
                  />
                </div>
              </section>

              <!-- ----------------------------------------------------------
                   Graphs card
                   ---------------------------------------------------------- -->
              <section
                v-if="hasGraphs"
                class="bg-default rounded-[calc(var(--ui-radius)*4)] shadow-[0_4px_16px_-6px_rgba(0,0,0,0.08)]"
                aria-labelledby="section-heading-graphs"
              >
                <div class="px-5 py-6 space-y-4">
                  <h3 id="section-heading-graphs" class="text-sm font-semibold text-highlighted">
                    Graphs
                  </h3>

                  <!-- TableEditor block -->
                  <PropertyPanel v-if="graphs !== null && graphs.tableModel !== null" title="Table">
                    <TableEditor
                      :table-data="graphs.tableModel"
                      :disabled="sectionsDisabled"
                      @update:width="handleTableWidth"
                      @update:text-size="handleTableTextSize"
                      @update:has-column-header="handleTableHasColumnHeader"
                      @update:row-count="handleTableRowCount"
                      @update:col-count="handleTableColCount"
                      @update:cell="handleTableCell"
                      @update:replace-content="handleTableReplaceContent"
                    />
                  </PropertyPanel>

                  <!-- JourneyEditor block -->
                  <PropertyPanel
                    v-if="graphs !== null && graphs.journeyModel !== null"
                    title="Journey"
                  >
                    <JourneyEditor
                      :model="graphs.journeyModel"
                      :disabled="sectionsDisabled"
                      @update:column-header="handleJourneyColumnHeader"
                      @update:item-label="handleJourneyItemLabel"
                      @update:item-icon="handleJourneyItemIcon"
                      @update:item-range="handleJourneyItemRange"
                    />
                  </PropertyPanel>
                </div>
              </section>
            </fieldset>
          </template>
        </div>
      </main>
    </div>
  </UApp>
</template>
