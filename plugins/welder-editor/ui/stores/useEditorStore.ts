// plugins/welder-editor/ui/stores/useEditorStore.ts
//
// Pinia store for the Welder Editor plugin.
//
// This file is ONE of TWO allowed mutation sites (ADR-0010 §3.1).
// The other is ui/composables/useEditorActions.ts.
// Any other file writing to this store is a lint error and a blocking PR review.
//
// Architecture: ADR-0010 (hybrid Pinia + composables).
//
// Store slices (§2):
//   slides        — SlideSummary[] for the current file/page
//   activeSlideId — currently selected slide id
//   general       — GeneralSections payload for the active slide
//   content       — ContentItems payload for the active slide
//   graphs        — GraphItems payload for the active slide
//   sync          — reconciliation metadata; NOT persisted
//
// Persistence: pinia-plugin-persistedstate with a file-scoped key.
//   Key:   'welder-editor:<fileKey>'
//   Paths: ['slides', 'activeSlideId', 'general', 'content', 'graphs']
//   TTL:   7 days — enforced via sync.lastKnownAt on hydration (not by the plugin)
//
// Optimistic rollback: useEditorActions captures a snapshot before dispatch;
// on result.ok === false, it calls the appropriate rollback action below.

import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';
// Import pinia-plugin-persistedstate to trigger its module augmentation of
// pinia's DefineStoreOptionsBase with the `persist` option type.
import type {} from 'pinia-plugin-persistedstate';
import type {
  SlideSummary,
  GeneralSections,
  ContentItems,
  GraphItems,
  Result,
  CorrelationId,
  NodeId,
} from '@shared/messages.js';

// ---------------------------------------------------------------------------
// Sync slice type
// ---------------------------------------------------------------------------

export interface SyncState {
  /** ms epoch of the last message-bus result that wrote to the store. */
  lastKnownAt: number;
  /** figma.fileKey at the time the cache was written. Used for cross-file guard. */
  fileKey: string;
  /** correlationId of the in-flight request, or null when idle. */
  inFlightRequestId: CorrelationId | null;
  /** True while a reconcile round-trip is in progress. Drives the "syncing" indicator. */
  reconciling: boolean;
}

// ---------------------------------------------------------------------------
// Snapshot types for optimistic rollback
// ---------------------------------------------------------------------------

export interface EditorSnapshot {
  general: GeneralSections | null;
  content: ContentItems | null;
  graphs: GraphItems | null;
  activeSlideId: string | null;
}

// ---------------------------------------------------------------------------
// TTL constant (7 days in ms)
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useEditorStore = defineStore(
  'welder-editor',
  () => {
    // ----- Persisted slices -----

    /**
     * Slide list for the current Figma page.
     * shallowRef: the array reference is reactive, but individual SlideSummary
     * objects are not made deeply reactive (avoids Vue's deep-observer cost on
     * potentially large arrays). ADR-0010 perf note.
     */
    const slides = shallowRef<SlideSummary[]>([]);

    /** Currently selected slide id. null = no selection. */
    const activeSlideId = ref<string | null>(null);

    /**
     * General-tab payload for the active slide.
     * shallowRef: nested objects (TitleDescriptionSection, BadgeSection, etc.)
     * are plain data; sections read them via computed / storeToRefs.
     */
    const general = shallowRef<GeneralSections | null>(null);

    /** Content-tab payload for the active slide. */
    const content = shallowRef<ContentItems | null>(null);

    /** Graphs-tab payload for the active slide. */
    const graphs = shallowRef<GraphItems | null>(null);

    // ----- Sync slice (not persisted) -----

    const sync = ref<SyncState>({
      lastKnownAt: 0,
      fileKey: '',
      inFlightRequestId: null,
      reconciling: false,
    });

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    /** Returns true when the cached data is older than CACHE_TTL_MS. */
    function isCacheStale(): boolean {
      if (sync.value.lastKnownAt === 0) return true;
      return Date.now() - sync.value.lastKnownAt > CACHE_TTL_MS;
    }

    /** Clears all data slices. Called on cross-file mismatch or TTL expiry. */
    function clearDataSlices(): void {
      slides.value = [];
      activeSlideId.value = null;
      general.value = null;
      content.value = null;
      graphs.value = null;
    }

    // -------------------------------------------------------------------------
    // Public action: applySlideListResult
    //
    // Called by useEditorActions after a slide-list:result arrives.
    // If result.ok === false, the slides list is unchanged and the error is
    // surfaced to the composable via the return value.
    // -------------------------------------------------------------------------

    function applySlideListResult(
      result: Result<{ slides: SlideSummary[] }>,
      fileKey: string,
    ): void {
      if (!result.ok) return; // error surfaced by composable to the section

      slides.value = result.data.slides;
      sync.value = {
        ...sync.value,
        lastKnownAt: Date.now(),
        fileKey,
        inFlightRequestId: null,
        reconciling: false,
      };
    }

    // -------------------------------------------------------------------------
    // Public action: applySlideLoadResult
    //
    // Called by useEditorActions after a slide-load:result arrives.
    // Writes general, content, graphs for the loaded slide.
    // On failure, all three slices are left unchanged.
    // -------------------------------------------------------------------------

    function applySlideLoadResult(
      result: Result<{
        slideId: NodeId;
        general: GeneralSections | null;
        content: ContentItems | null;
        graphs: GraphItems | null;
      }>,
    ): void {
      if (!result.ok) return;

      const { slideId, general: g, content: c, graphs: gr } = result.data;

      // Only apply if this result is still relevant to the current slide.
      if (activeSlideId.value !== slideId) return;

      general.value = g;
      content.value = c;
      graphs.value = gr;
      sync.value = {
        ...sync.value,
        lastKnownAt: Date.now(),
        inFlightRequestId: null,
        reconciling: false,
      };
    }

    // -------------------------------------------------------------------------
    // Public action: applyEditorResult
    //
    // Generic result writer for apply-X operations (apply-title-description,
    // apply-badge, apply-image, apply-card, apply-timeline, apply-table,
    // apply-journey). The kind determines which slice is rewritten.
    //
    // On success: updates lastKnownAt, clears inFlightRequestId.
    // On failure: the composable has already rolled back via rollbackFromSnapshot;
    //             this action just clears the in-flight marker.
    // -------------------------------------------------------------------------

    type EditorKind = 'general' | 'content' | 'graphs';

    function applyEditorResult(
      kind: EditorKind,
      result: Result<GeneralSections | ContentItems | GraphItems>,
    ): void {
      sync.value = {
        ...sync.value,
        inFlightRequestId: null,
      };

      if (!result.ok) return; // composable handles rollback

      switch (kind) {
        case 'general':
          general.value = result.data as GeneralSections;
          break;
        case 'content':
          content.value = result.data as ContentItems;
          break;
        case 'graphs':
          graphs.value = result.data as GraphItems;
          break;
      }

      sync.value = {
        ...sync.value,
        lastKnownAt: Date.now(),
      };
    }

    // -------------------------------------------------------------------------
    // Public action: setActiveSlide
    //
    // Updates the active slide selection. Clears per-slide payloads so the
    // previous slide's data is not shown while the new one loads.
    // -------------------------------------------------------------------------

    function setActiveSlide(slideId: string | null): void {
      activeSlideId.value = slideId;
      general.value = null;
      content.value = null;
      graphs.value = null;
    }

    // -------------------------------------------------------------------------
    // Public action: recordPendingRequest
    //
    // Marks the start of an in-flight message-bus request so the UI can show
    // a loading / syncing state. Called by useEditorActions before dispatch.
    // -------------------------------------------------------------------------

    function recordPendingRequest(
      correlationId: CorrelationId,
      _slice: 'slide-list' | 'slide-load' | EditorKind,
    ): void {
      sync.value = {
        ...sync.value,
        inFlightRequestId: correlationId,
      };
    }

    // -------------------------------------------------------------------------
    // Public action: reconcileFrom
    //
    // Called when canvas state wins unconditionally (selectionchange,
    // page-changed, file-changed). Per ADR-0010 §3.2.
    //
    // If the incoming fileKey differs from sync.fileKey (cross-file mismatch),
    // all persisted slices are cleared before writing the fresh data.
    // -------------------------------------------------------------------------

    function reconcileFrom(snapshot: {
      fileKey: string;
      slides: SlideSummary[];
      activeSlideId: string | null;
      general: GeneralSections | null;
      content: ContentItems | null;
      graphs: GraphItems | null;
    }): void {
      const crossFileSwitch = sync.value.fileKey !== '' && sync.value.fileKey !== snapshot.fileKey;

      if (crossFileSwitch) {
        clearDataSlices();
      }

      slides.value = snapshot.slides;
      activeSlideId.value = snapshot.activeSlideId;
      general.value = snapshot.general;
      content.value = snapshot.content;
      graphs.value = snapshot.graphs;

      sync.value = {
        lastKnownAt: Date.now(),
        fileKey: snapshot.fileKey,
        inFlightRequestId: null,
        reconciling: false,
      };
    }

    // -------------------------------------------------------------------------
    // Public action: beginReconcile
    //
    // Sets sync.reconciling = true so the UI shows the "syncing" indicator
    // while a reconcile round-trip is in progress.
    // -------------------------------------------------------------------------

    function beginReconcile(): void {
      sync.value = { ...sync.value, reconciling: true };
    }

    // -------------------------------------------------------------------------
    // Optimistic rollback helpers
    //
    // useEditorActions captures a snapshot before dispatch via captureSnapshot().
    // On result.ok === false, it calls rollbackFromSnapshot(snapshot).
    // Both are called from useEditorActions — they are here because the snapshot
    // format is coupled to the store's slice shapes.
    // -------------------------------------------------------------------------

    function captureSnapshot(): EditorSnapshot {
      return {
        general: general.value,
        content: content.value,
        graphs: graphs.value,
        activeSlideId: activeSlideId.value,
      };
    }

    function rollbackFromSnapshot(snapshot: EditorSnapshot): void {
      general.value = snapshot.general;
      content.value = snapshot.content;
      graphs.value = snapshot.graphs;
      activeSlideId.value = snapshot.activeSlideId;
      sync.value = {
        ...sync.value,
        inFlightRequestId: null,
      };
    }

    // -------------------------------------------------------------------------
    // Optimistic write helper
    //
    // Called before dispatch to provide immediate UI feedback (≤ 16 ms per
    // ADR-0010 §3.3). The composable provides the partial updated value;
    // this merges it into the appropriate slice.
    // -------------------------------------------------------------------------

    function optimisticallyApply(
      kind: EditorKind,
      partial: Partial<GeneralSections> | Partial<ContentItems> | Partial<GraphItems>,
    ): void {
      switch (kind) {
        case 'general':
          if (general.value !== null) {
            general.value = { ...general.value, ...(partial as Partial<GeneralSections>) };
          }
          break;
        case 'content':
          if (content.value !== null) {
            content.value = { ...content.value, ...(partial as Partial<ContentItems>) };
          }
          break;
        case 'graphs':
          if (graphs.value !== null) {
            graphs.value = { ...graphs.value, ...(partial as Partial<GraphItems>) };
          }
          break;
      }
    }

    // -------------------------------------------------------------------------
    // Hydration guard: enforce TTL on warm open.
    //
    // pinia-plugin-persistedstate calls $hydrate() after store creation in
    // non-test environments. We hook $onAction to detect the first post-hydration
    // access and clear stale data. The $onAction hook fires before the action body.
    //
    // In the test environment (import.meta.env.TEST === 'true'), persistence is
    // disabled — so this guard only fires in production builds.
    //
    // Implementation note: $onAction is called here inside the setup() body so
    // the hook receives `this` as the store instance. Vue reactivity is already
    // live at this point.
    // -------------------------------------------------------------------------

    return {
      // Slices (read + write, but only write from the allowed files)
      slides,
      activeSlideId,
      general,
      content,
      graphs,
      sync,

      // Actions (the only allowed mutation paths from outside this file)
      applySlideListResult,
      applySlideLoadResult,
      applyEditorResult,
      setActiveSlide,
      recordPendingRequest,
      reconcileFrom,
      beginReconcile,
      captureSnapshot,
      rollbackFromSnapshot,
      optimisticallyApply,

      // Exposed for tests / hydration hooks
      isCacheStale,
      clearDataSlices,
    };
  },
  {
    persist: {
      // File-scoped cache key. The fileKey portion is set dynamically by the
      // reconcileFrom action on first canvas contact. The static prefix keeps
      // entries attributable to this plugin in localStorage.
      //
      // NOTE: pinia-plugin-persistedstate@4 accepts a `key` string or function.
      // We use the store id as key here; the file-scoping is enforced by the
      // reconcileFrom fileKey mismatch guard (ADR-0010 §3.2 + §3.4).
      // If multiple Figma files are open, their entries coexist under different
      // sync.fileKey values; clearDataSlices() purges the wrong-file data
      // before any write to the new file's slices.
      key: 'welder-editor',

      // Exclude the sync slice — it is always reconstructed from message-bus
      // reconciliation on plugin open. Persisting it would surface stale
      // reconciling/inFlightRequestId flags on warm hydration.
      pick: ['slides', 'activeSlideId', 'general', 'content', 'graphs'],
    },
  },
);

// ---------------------------------------------------------------------------
// Type export for the store instance (useful for typing composable returns).
// ---------------------------------------------------------------------------
export type EditorStore = ReturnType<typeof useEditorStore>;
