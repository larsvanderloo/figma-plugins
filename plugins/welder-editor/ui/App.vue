<script setup lang="ts">
/**
 * App.vue — Welder Editor iframe root.
 *
 * Sprint 5 Task 5.2 — App.vue chrome rewrite.
 * Replaces TabStrip + tab panels with stacked <UCard> panels.
 * Wraps root in <UApp> per ADR-0013 (Nuxt UI v4 recovery step 5).
 * Adds <USkeleton> loaders for slow paths.
 *
 * Layout:
 *   <UApp>
 *     SlidePicker (always visible)
 *     [empty state OR stacked UCard panels]
 *       UCard v-if="general && activeSlideId"
 *         General panel: TitleDescriptionEditor / BadgeEditor+IconPicker / ImageEditor
 *       UCard v-if="content && activeSlideId"
 *         Content panel: CardList / CardEditor / TimelineEditor
 *       UCard v-if="graphs && activeSlideId (with tableModel or journeyModel)"
 *         Graphs panel: TableEditor / JourneyEditor
 *
 * Data flow (ADR-0010):
 *   message-bus → usePluginBridge.onMessage → store actions → computed state → props
 *   component emit → useEditorActions handler → optimistic store write + bridge
 *
 * Mutation discipline (ADR-0010 §3.1):
 *   App.vue NEVER writes to the store directly. All writes via useEditorActions.
 *   Components do NOT import the store.
 *
 * Owner: ui-engineer. Resolves MON-2894436938 (Sprint 5, Task 5.2).
 */

import { ref, computed } from 'vue';
import { storeToRefs } from 'pinia';

// ---- Store + actions ----
import { useEditorStore } from './stores/useEditorStore.js';
import { useEditorActions } from './composables/useEditorActions.js';
import { usePluginBridge } from './composables/usePluginBridge.js';

// ---- Components (explicit named imports — no auto-import for local components) ----
import SlidePicker from '@/components/SlidePicker.vue';
import PropertyPanel from '@/components/PropertyPanel.vue';
import TitleDescriptionEditor from '@/components/TitleDescriptionEditor.vue';
import BadgeEditor from '@/components/BadgeEditor.vue';
import IconPicker from '@/components/IconPicker.vue';
import ImageEditor from '@/components/ImageEditor.vue';
import CardList from '@/components/CardList.vue';
import CardEditor from '@/components/CardEditor.vue';
import TimelineEditor from '@/components/TimelineEditor.vue';
import TableEditor from '@/components/TableEditor.vue';
import type { TableRow as CsvTableRow } from '@/components/csv-schema.js';
import JourneyEditor from '@/components/JourneyEditor.vue';

// ---- Shared message types ----
import type { Message } from '@shared/messages.js';

// ---------------------------------------------------------------------------
// Store + reactive refs
// ---------------------------------------------------------------------------

const store = useEditorStore();
const actions = useEditorActions();
const bridge = usePluginBridge();

const { slides, activeSlideId, general, content, graphs, sync } = storeToRefs(store);

// ---------------------------------------------------------------------------
// Bridge: handle inbound messages from the code side
// ---------------------------------------------------------------------------

const busError = ref<string | null>(null);

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
      break;
    }

    case 'selection-changed': {
      const selectedSlide = slides.value.find((s) => msg.payload.selectedNodeIds.includes(s.id));
      if (selectedSlide !== undefined) {
        void actions.loadSlide(selectedSlide.id);
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
      break;
    }

    case 'error': {
      busError.value = msg.payload.message;
      break;
    }
  }
});

// ---------------------------------------------------------------------------
// Derived state
// ---------------------------------------------------------------------------

const isLoading = computed<boolean>(
  () => sync.value.inFlightRequestId !== null || sync.value.reconciling,
);

const noSlideSelected = computed<boolean>(() => activeSlideId.value === null);

/**
 * Show General panel when general is non-null and a slide is selected.
 */
const showGeneral = computed<boolean>(() => general.value !== null && activeSlideId.value !== null);

/**
 * Show Content panel when content is non-null and a slide is selected.
 */
const showContent = computed<boolean>(() => content.value !== null && activeSlideId.value !== null);

/**
 * Show Graphs panel when graphs is non-null and has at least one model, and a slide is selected.
 */
const showGraphs = computed<boolean>(
  () =>
    graphs.value !== null &&
    activeSlideId.value !== null &&
    (graphs.value.tableModel !== null || graphs.value.journeyModel !== null),
);

const sectionsDisabled = computed<boolean>(() => noSlideSelected.value || isLoading.value);

// ---------------------------------------------------------------------------
// SlidePicker handler
// ---------------------------------------------------------------------------

function handleSlideSelect(slideId: string): void {
  void actions.loadSlide(slideId);
}

// ---------------------------------------------------------------------------
// TitleDescriptionEditor handler
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
// BadgeEditor handler
// ---------------------------------------------------------------------------

function handleBadgeUpdate(patch: { label: string; icon: string }): void {
  if (general.value === null || general.value.badge === null) return;
  const { badgeNodeId } = general.value.badge;
  void actions.applyBadge({
    badgeNodeId,
    label: patch.label,
    icon: patch.icon,
  });
}

// ---------------------------------------------------------------------------
// ImageEditor handlers
// ---------------------------------------------------------------------------

function handleImageUpdate(bytes: Uint8Array): void {
  if (general.value === null || general.value.image === null) return;
  const { imageWrapId } = general.value.image;
  void actions.applyImage({ imageWrapId, bytes });
}

function handleCropTransformUpdate(
  _transform: [[number, number, number], [number, number, number]],
): void {
  // apply-crop is v0.2.0 — accepted and silently dropped so ImageEditor renders without error.
}

// ---------------------------------------------------------------------------
// Content panel — CardList ephemeral state
// ---------------------------------------------------------------------------

const selectedCardNodeId = ref<string | null>(null);

import type { CardItem } from '@shared/messages.js';

const selectedCard = computed<CardItem | null>(() => {
  if (content.value === null || selectedCardNodeId.value === null) return null;
  return content.value.cards.find((c) => c.cardNodeId === selectedCardNodeId.value) ?? null;
});

const hasCards = computed<boolean>(() => content.value !== null && content.value.cards.length > 0);

const hasTimeline = computed<boolean>(
  () => content.value !== null && content.value.timelineItems.length > 0,
);

const contentLoadedButEmpty = computed<boolean>(
  () => content.value !== null && !hasCards.value && !hasTimeline.value,
);

// ---------------------------------------------------------------------------
// CardList handler
// ---------------------------------------------------------------------------

function handleCardSelect(cardNodeId: string): void {
  selectedCardNodeId.value = cardNodeId;
}

// ---------------------------------------------------------------------------
// CardEditor handlers
// ---------------------------------------------------------------------------

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
  void payload; // v0.2.0 — accepted and dropped
}

// ---------------------------------------------------------------------------
// TimelineEditor handlers
// ---------------------------------------------------------------------------

function handleTimelineItemHeadingUpdate(payload: { itemId: string; value: string }): void {
  void actions.applyTimeline({ copyWrapNodeId: payload.itemId, heading: payload.value });
}

function handleTimelineItemParagraphUpdate(payload: { itemId: string; value: string }): void {
  void actions.applyTimeline({ copyWrapNodeId: payload.itemId, paragraph: payload.value });
}

// ---------------------------------------------------------------------------
// TableEditor handlers
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
// JourneyEditor handlers
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
    <main class="welder-editor">
      <!--
        Bus-level error — role="alert" announces immediately via UAlert.
        Sits at top so it's visible regardless of panel state.
      -->
      <UAlert
        v-if="busError !== null"
        color="error"
        variant="subtle"
        :description="busError"
        role="alert"
        class="welder-editor__bus-error"
      />

      <!-- ------------------------------------------------------------------ -->
      <!-- SlidePicker — always visible                                         -->
      <!-- ------------------------------------------------------------------ -->
      <div class="welder-editor__slide-picker">
        <SlidePicker
          :slides="slides"
          :active-slide-id="activeSlideId"
          :loading="isLoading"
          @select="handleSlideSelect"
        />
      </div>

      <!-- ------------------------------------------------------------------ -->
      <!-- Empty state: no slide selected                                       -->
      <!-- ------------------------------------------------------------------ -->
      <div v-if="noSlideSelected" class="welder-editor__empty-state">
        <p class="welder-editor__empty-text" role="status" aria-live="polite">
          Pick a slide above to start editing
        </p>
      </div>

      <!-- ------------------------------------------------------------------ -->
      <!-- Stacked panels — visible when a slide is selected                   -->
      <!-- ------------------------------------------------------------------ -->
      <template v-else>
        <!-- ================================================================ -->
        <!-- General panel                                                      -->
        <!-- v-if gated by store.general !== null                              -->
        <!-- ================================================================ -->
        <UCard v-if="showGeneral" class="welder-editor__panel">
          <template #header>
            <h2 class="welder-editor__panel-heading">General</h2>
          </template>

          <!--
            USkeleton loaders shown while general data is loading.
            Loading: sync.inFlightRequestId !== null AND general is null.
            (When general is non-null showGeneral is true — skeletons not needed.)
          -->
          <div class="welder-editor__panel-stack">
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

            <!-- BadgeEditor + IconPicker slot -->
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

            <!-- General empty state -->
            <div
              v-if="
                general !== null &&
                general.titleDescription === null &&
                general.badge === null &&
                general.image === null
              "
              class="welder-editor__section-empty"
              role="status"
            >
              No editable general elements on this slide
            </div>
          </div>
        </UCard>

        <!-- ================================================================ -->
        <!-- Content panel                                                      -->
        <!-- ================================================================ -->
        <UCard v-if="showContent" class="welder-editor__panel">
          <template #header>
            <h2 class="welder-editor__panel-heading">Content</h2>
          </template>

          <div class="welder-editor__panel-stack">
            <!-- Cards block -->
            <PropertyPanel v-if="hasCards" title="Cards">
              <div class="welder-editor__content-cards">
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

            <!-- Content empty state -->
            <div v-if="contentLoadedButEmpty" class="welder-editor__section-empty" role="status">
              No cards or timeline items on this slide
            </div>
          </div>
        </UCard>

        <!-- ================================================================ -->
        <!-- Graphs panel                                                        -->
        <!-- ================================================================ -->
        <UCard v-if="showGraphs" class="welder-editor__panel">
          <template #header>
            <h2 class="welder-editor__panel-heading">Graphs</h2>
          </template>

          <div class="welder-editor__panel-stack">
            <!-- TableEditor -->
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

            <!-- JourneyEditor -->
            <PropertyPanel v-if="graphs !== null && graphs.journeyModel !== null" title="Journey">
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
        </UCard>
      </template>
    </main>
  </UApp>
</template>

<style scoped>
.welder-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-text, #111827);
  background: var(--color-surface, #ffffff);
  gap: 0;
}

.welder-editor__bus-error {
  flex-shrink: 0;
}

.welder-editor__slide-picker {
  flex-shrink: 0;
  padding: 8px 10px 6px;
  border-bottom: 1px solid var(--color-panel-border, #e5e7eb);
}

.welder-editor__empty-state {
  flex: 1;
  display: flex;
  align-items: flex-start;
  padding: 10px;
}

.welder-editor__empty-text {
  margin: 0;
  font-size: 12px;
  color: var(--color-label, #6b7280);
}

.welder-editor__panel {
  border-radius: 0;
  border-left: none;
  border-right: none;
  border-top: none;
}

.welder-editor__panel:first-of-type {
  border-top: 1px solid var(--color-panel-border, #e5e7eb);
}

.welder-editor__panel-heading {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--color-panel-title, #374151);
}

.welder-editor__panel-stack {
  display: flex;
  flex-direction: column;
}

.welder-editor__section-empty {
  padding: 10px;
  font-size: 11px;
  color: var(--color-label, #6b7280);
}

.welder-editor__content-cards {
  display: flex;
  flex-direction: column;
}
</style>
