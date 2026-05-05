<script setup lang="ts">
/**
 * App.vue — Welder Editor iframe root.
 *
 * Sprint 2 assembly: wires all 7 sections + Pinia store + usePluginBridge
 * into the plugin's single-screen layout.
 *
 * Layout:
 *   ┌─────────────────────────┐
 *   │  SlidePicker            │  always visible
 *   │  TabStrip               │  always visible (hides empty tabs)
 *   │  ┌──────────────────┐   │
 *   │  │ general panel    │   │  visible when store.general != null
 *   │  │ content panel    │   │  Sprint 3 placeholder
 *   │  │ graphs panel     │   │  Sprint 4 placeholder
 *   │  └──────────────────┘   │
 *   └─────────────────────────┘
 *
 * Data flow (ADR-0010):
 *   message-bus → usePluginBridge.onMessage → store actions (reconcileFrom /
 *   applySlide*) → computed derived state → section props
 *
 *   section emit → useEditorActions handler → optimistic store write +
 *   bridge.postAndWait → store result write / rollback
 *
 * Mutation discipline (ADR-0010 §3.1):
 *   App.vue NEVER writes to the store directly. All writes go through
 *   useEditorActions. Sections NEVER import the store — data arrives via
 *   props; user events arrive via emits wired here.
 *
 * Owner: ui-engineer. Resolves MON-2893895223 (Sprint 2, Task 2.9).
 */

import { ref, computed } from 'vue';
import { storeToRefs } from 'pinia';

// ---- Store + actions ----
import { useEditorStore } from './stores/useEditorStore.js';
import { useEditorActions } from './composables/useEditorActions.js';
import { usePluginBridge } from './composables/usePluginBridge.js';

// ---- Sections ----
import { SlidePicker } from '@figma-plugins/sections-slide-picker';
import { TabStrip } from '@figma-plugins/sections-tab-strip';
import type { TabId } from '@figma-plugins/sections-tab-strip';
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

// ---- Shared message types ----
import type { Message } from '@shared/messages.js';

// ---- Components ----
import { StatusMessage } from '@figma-plugins/components';

// ---------------------------------------------------------------------------
// Store + reactive refs
// ---------------------------------------------------------------------------

const store = useEditorStore();
const actions = useEditorActions();
const bridge = usePluginBridge();

// Destructure the slices we need as reactive refs (storeToRefs preserves
// reactivity without triggering the pinia-mutation ESLint rule).
const { slides, activeSlideId, general, content, graphs, sync } = storeToRefs(store);

// ---------------------------------------------------------------------------
// Section-level ephemeral state — NOT stored in Pinia (per Sprint 2 task 2.2
// review note: section-local ephemeral state lives in App.vue, not the store).
// ---------------------------------------------------------------------------

/** Active tab id for TabStrip. Local ref; TabStrip auto-promotes on hide-empty. */
const activeTab = ref<TabId>('general');

// ---------------------------------------------------------------------------
// Bridge: handle inbound messages from the code side
//
// usePluginBridge.onMessage is called inside setup() so auto-unsubscribe on
// component unmount is active (getCurrentInstance() !== null).
//
// Messages handled here:
//   'init'               — initial slide list + optional pre-selection
//   'selection-changed'  — Figma selection changed; auto-load if known slide
//   'page-changed'       — page switched; refresh slide list
//   'error'              — unhandled code-side exception; surface to user
//
// Messages handled via postAndWait in useEditorActions (not here):
//   slide-list:result, slide-load:result, apply-*:result
// ---------------------------------------------------------------------------

/** Top-level bus error message; shown in a StatusMessage alert. */
const busError = ref<string | null>(null);

bridge.onMessage((msg: Message) => {
  switch (msg.type) {
    case 'init': {
      // The init message carries the initial slide list and, optionally, a
      // pre-selected slide id (canvas selection at plugin-open time).
      store.reconcileFrom({
        fileKey: '', // figma-api-engineer will add fileKey to init in v0.2.0
        slides: msg.payload.slides,
        activeSlideId: msg.payload.initialSlideId,
        general: null,
        content: null,
        graphs: null,
      });

      // If the code side already resolved a slide, load it immediately.
      if (msg.payload.initialSlideId !== null) {
        void actions.loadSlide(msg.payload.initialSlideId);
      }
      break;
    }

    case 'selection-changed': {
      // If the newly selected node ids include a known slide, auto-load it.
      const selectedSlide = slides.value.find((s) => msg.payload.selectedNodeIds.includes(s.id));
      if (selectedSlide !== undefined) {
        void actions.loadSlide(selectedSlide.id);
      }
      break;
    }

    case 'page-changed': {
      // Refresh the slide picker; clear per-slide state optimistically so
      // stale section content does not remain on screen while the new list arrives.
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

    // All result messages (slide-list:result, slide-load:result, apply-*:result)
    // are handled by useEditorActions via postAndWait — they resolve their
    // pending correlationId Promises directly in usePluginBridge and never
    // reach this switch.
  }
});

// ---------------------------------------------------------------------------
// Derived state for section props
// ---------------------------------------------------------------------------

/**
 * True while any request is in-flight or a reconcile is in progress.
 * Used to show the SlidePicker loading state.
 */
const isLoading = computed<boolean>(
  () => sync.value.inFlightRequestId !== null || sync.value.reconciling,
);

/**
 * True when no slide is selected. Drives the "pick a slide" empty state.
 */
const noSlideSelected = computed<boolean>(() => activeSlideId.value === null);

/**
 * TabStrip hide-empty props: pass null-ness of each slice.
 */
const generalNull = computed<boolean>(() => general.value === null);
const contentNull = computed<boolean>(() => content.value === null);
const graphsNull = computed<boolean>(() => graphs.value === null);

/**
 * Section disabled flag: disable all editors when no slide is selected or a
 * request is in-flight.
 */
const sectionsDisabled = computed<boolean>(() => noSlideSelected.value || isLoading.value);

// ---------------------------------------------------------------------------
// SlidePicker event handler
// ---------------------------------------------------------------------------

function handleSlideSelect(slideId: string): void {
  void actions.loadSlide(slideId);
}

// ---------------------------------------------------------------------------
// TitleDescriptionEditor event handler
//
// The section emits { heading, paragraph } — App.vue builds the full
// message-bus payload by adding copyWrapId from the store slice.
// ---------------------------------------------------------------------------

function handleTitleDescriptionUpdate(patch: { heading: string; paragraph: string | null }): void {
  if (general.value === null || general.value.titleDescription === null) return;

  const { copyWrapId } = general.value.titleDescription;

  void actions.applyTitleDescription({
    copyWrapId,
    heading: patch.heading,
    // paragraph is optional in the message contract; omit if null (no paragraph node)
    ...(patch.paragraph !== null ? { paragraph: patch.paragraph } : {}),
  });
}

// ---------------------------------------------------------------------------
// BadgeEditor event handler
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
// ImageEditor event handlers
// ---------------------------------------------------------------------------

function handleImageUpdate(bytes: Uint8Array): void {
  if (general.value === null || general.value.image === null) return;

  const { imageWrapId } = general.value.image;

  void actions.applyImage({ imageWrapId, bytes });
}

function handleCropTransformUpdate(_transform: Transform): void {
  // apply-crop is a v0.2.0 action — not wired in Sprint 2.
  // The emit is accepted and silently dropped so ImageEditor renders without error.
}

// ---------------------------------------------------------------------------
// Content tab — ephemeral state
//
// selectedCardNodeId tracks which card row is active in CardList.
// It is section-local ephemeral state (per Sprint 2 task 2.2 review note):
// lives in App.vue, not in the store, because it has no message-bus relevance.
//
// It resets to null whenever the content slice changes (new slide loaded).
// ---------------------------------------------------------------------------

const selectedCardNodeId = ref<string | null>(null);

/**
 * The CardItem currently selected in CardList.
 * null when no card is selected or content is null.
 * Drives whether CardEditor is shown and which card it edits.
 */
const selectedCard = computed<CardItem | null>(() => {
  if (content.value === null || selectedCardNodeId.value === null) return null;
  return content.value.cards.find((c) => c.cardNodeId === selectedCardNodeId.value) ?? null;
});

/**
 * True when cards block should be shown: content is loaded AND has cards.
 */
const hasCards = computed<boolean>(() => content.value !== null && content.value.cards.length > 0);

/**
 * True when timeline block should be shown: content is loaded AND has items.
 */
const hasTimeline = computed<boolean>(
  () => content.value !== null && content.value.timelineItems.length > 0,
);

/**
 * True when content is loaded but both cards AND timeline are empty.
 * Drives the "No cards or timeline items on this slide" status message.
 */
const contentLoadedButEmpty = computed<boolean>(
  () => content.value !== null && !hasCards.value && !hasTimeline.value,
);

// ---------------------------------------------------------------------------
// Content tab — CardList event handler
// ---------------------------------------------------------------------------

function handleCardSelect(cardNodeId: string): void {
  selectedCardNodeId.value = cardNodeId;
}

// ---------------------------------------------------------------------------
// Content tab — CardEditor event handlers
//
// Each emit mirrors one optional field in the apply-card message payload.
// App.vue dispatches; CardEditor/CardList are dumb renderers.
// ---------------------------------------------------------------------------

function handleCardHeadingUpdate(payload: { cardNodeId: string; heading: string }): void {
  void actions.applyCard({
    cardNodeId: payload.cardNodeId,
    heading: payload.heading,
  });
}

function handleCardParagraphUpdate(payload: { cardNodeId: string; paragraph: string }): void {
  void actions.applyCard({
    cardNodeId: payload.cardNodeId,
    paragraph: payload.paragraph,
  });
}

function handleCardIconUpdate(payload: { cardNodeId: string; iconName: string }): void {
  void actions.applyCard({
    cardNodeId: payload.cardNodeId,
    icon: payload.iconName,
  });
}

function handleCardVisualUpdate(payload: { cardNodeId: string; bytes: Uint8Array }): void {
  // Visual updates for cards are future-wired (requires card imageWrapId from the
  // code side — not yet in the message contract). Accept and drop for now so
  // CardEditor renders without error; the ImageEditor button is non-destructive.
  void payload;
}

// ---------------------------------------------------------------------------
// Content tab — TimelineEditor event handlers
// ---------------------------------------------------------------------------

function handleTimelineItemHeadingUpdate(payload: { itemId: string; value: string }): void {
  void actions.applyTimeline({
    copyWrapNodeId: payload.itemId,
    heading: payload.value,
  });
}

function handleTimelineItemParagraphUpdate(payload: { itemId: string; value: string }): void {
  void actions.applyTimeline({
    copyWrapNodeId: payload.itemId,
    paragraph: payload.value,
  });
}
</script>

<template>
  <div class="welder-editor">
    <!--
      Bus-level error: shown when code side sends an unhandled 'error' message.
      role="alert" on StatusMessage (variant="alert") announces immediately.
      Sits at the top so it is visible regardless of tab state.
    -->
    <StatusMessage
      v-if="busError !== null"
      :message="busError"
      variant="alert"
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
    <!-- The TabStrip + editors are hidden until the user picks a slide so  -->
    <!-- that sections don't render with null models.                         -->
    <!-- ------------------------------------------------------------------ -->
    <div v-if="noSlideSelected" class="welder-editor__empty-state">
      <StatusMessage message="Pick a slide above to start editing" variant="status" />
    </div>

    <!-- ------------------------------------------------------------------ -->
    <!-- Main editing surface: visible when a slide is selected              -->
    <!-- ------------------------------------------------------------------ -->
    <template v-else>
      <!-- TabStrip — active-tab is section-local ephemeral state (ref above) -->
      <TabStrip
        v-model:model-value="activeTab"
        :general-null="generalNull"
        :content-null="contentNull"
        :graphs-null="graphsNull"
      >
        <!-- ---------------------------------------------------------------- -->
        <!-- General tab                                                        -->
        <!-- ---------------------------------------------------------------- -->
        <template #general>
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

            <!-- BadgeEditor (with IconPicker wired into the icon-picker slot) -->
            <PropertyPanel v-if="general !== null && general.badge !== null" title="Badge">
              <BadgeEditor
                :model="general.badge"
                :disabled="sectionsDisabled"
                @update:model="handleBadgeUpdate"
              >
                <!--
                  icon-picker slot contract from BadgeEditor:
                    icon     — current Lucide key string
                    onChange — callback with the new Lucide key
                    disabled — forwarded from BadgeEditor's disabled prop
                -->
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
              If all three general sub-sections are absent (general !== null
              but all fields are null), show an informational message.
              This state is valid: a slide can have a GeneralSections record
              with no CopyWrap, Badge, or ImageWrap instances.
            -->
            <div
              v-if="
                general !== null &&
                general.titleDescription === null &&
                general.badge === null &&
                general.image === null
              "
              class="welder-editor__section-empty"
            >
              <StatusMessage
                message="No editable general elements on this slide"
                variant="status"
              />
            </div>
          </div>
        </template>

        <!-- ---------------------------------------------------------------- -->
        <!-- Content tab                                                        -->
        <!-- ---------------------------------------------------------------- -->
        <template #content>
          <div class="welder-editor__panel-stack">
            <!--
              Cards block — shown when content is loaded AND cards exist.
              PropertyPanel is collapsible; label provides accessible name.

              CardList (selection list) + CardEditor (per-card form) follow the
              section discipline: sections emit, App.vue dispatches.
            -->
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

            <!--
              Timeline block — shown when content is loaded AND timeline items exist.
            -->
            <PropertyPanel v-if="hasTimeline" title="Timeline">
              <TimelineEditor
                :items="content!.timelineItems"
                :disabled="sectionsDisabled"
                @update:item-heading="handleTimelineItemHeadingUpdate"
                @update:item-paragraph="handleTimelineItemParagraphUpdate"
              />
            </PropertyPanel>

            <!--
              Empty state: content is loaded but slide has no cards AND no timeline.
              TabStrip's hide-empty promotion handles the case where content is
              null entirely (no CardWrap / TimelineWrap) — that state never reaches
              this slot.
            -->
            <div v-if="contentLoadedButEmpty" class="welder-editor__section-empty">
              <StatusMessage message="No cards or timeline items on this slide" variant="status" />
            </div>
          </div>
        </template>

        <!-- ---------------------------------------------------------------- -->
        <!-- Graphs tab — Sprint 4 placeholder                                -->
        <!-- ---------------------------------------------------------------- -->
        <template #graphs>
          <div class="welder-editor__panel-stack welder-editor__panel-stack--placeholder">
            <StatusMessage message="Graphs editing — coming in Sprint 4" variant="status" />
          </div>
        </template>
      </TabStrip>
    </template>
  </div>
</template>

<style scoped>
/*
 * Compact density for the Figma plugin iframe context (240–360 px wide).
 * Colors reference CSS custom properties (design tokens) — no hard-coded hex.
 */

.welder-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-text, #111827);
  background: var(--color-surface, #ffffff);
}

.welder-editor__bus-error {
  padding: 6px 10px;
  border-bottom: 1px solid var(--color-error-border, #fecaca);
  background: var(--color-error-bg, #fef2f2);
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

.welder-editor__panel-stack {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  flex: 1;
}

.welder-editor__panel-stack--placeholder {
  padding: 10px;
}

.welder-editor__section-empty {
  padding: 10px;
}
</style>
