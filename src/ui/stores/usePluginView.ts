// ============================================================
// usePluginView — central UI store for the iframe.
//
// Pinia setup-store. State lives in one `reactive()` under `state`.
// Derived state (noSlide, isSkipped, hasX, allEmpty) is exposed as
// getters so consumers don't repeat the same booleans.
//
// The sandbox owns slide selection: it watches `selectionchange` and
// drives `currentSummary` + payload via `slide-loaded` / `slide-summary`
// / `slide-deselected`. The iframe never asks "switch to slide X" — the
// user picks slides by clicking them on the Figma canvas.
// ============================================================

import { reactive, computed } from 'vue';
import { defineStore } from 'pinia';
import type {
  ContentItems,
  GeneralSections,
  GraphItems,
  PluginRuntimeInfo,
  SlideSummary,
  TabId,
} from '../../types';

export interface PluginViewState {
  /** Runtime metadata posted by the sandbox during init. */
  runtime: PluginRuntimeInfo | null;
  /** Current slide summary; null when no slide is selected on the canvas. */
  currentSummary: SlideSummary | null;
  /** Mirrors currentSummary.id for the editor composables that read it. */
  currentSlideId: string | null;
  activeTab: TabId;
  general: GeneralSections | null;
  content: ContentItems | null;
  graphs: GraphItems | null;
}

interface SkipOverride {
  skipped: boolean;
  requestId: string;
  expiresAt: number;
  clearTimer: ReturnType<typeof setTimeout> | null;
}

const SKIP_OVERRIDE_HOLD_MS = 1200;
const SKIP_OVERRIDE_MAX_MS = 6000;

export const usePluginView = defineStore('pluginView', () => {
  const state = reactive<PluginViewState>({
    runtime: null,
    currentSummary: null,
    currentSlideId: null,
    activeTab: 'general',
    general: null,
    content: null,
    graphs: null,
  });
  const skipOverrides = new Map<string, SkipOverride>();

  // ── Getters ────────────────────────────────────────────────────────────
  const noSlide = computed<boolean>(() => state.currentSlideId === null);

  const currentSummary = computed<SlideSummary | null>(() => state.currentSummary);

  const isSkipped = computed<boolean>(() => {
    const summary = state.currentSummary;
    return summary !== null && summary.isSkipped === true;
  });

  const hasGeneral = computed<boolean>(() => !noSlide.value && state.general !== null);
  const hasContent = computed<boolean>(() => !noSlide.value && state.content !== null);
  const hasGraphs = computed<boolean>(() => !noSlide.value && state.graphs !== null);
  const allEmpty = computed<boolean>(
    () =>
      !noSlide.value &&
      state.general === null &&
      state.content === null &&
      state.graphs === null,
  );

  // ── Actions ────────────────────────────────────────────────────────────
  function setActiveTab(tab: TabId): void {
    state.activeTab = tab;
  }

  function setRuntime(runtime: PluginRuntimeInfo): void {
    state.runtime = runtime;
  }

  function applySkipOverride(summary: SlideSummary): SlideSummary {
    if (summary.isSkipped === null) return summary;
    const override = skipOverrides.get(summary.id);
    if (override === undefined) return summary;
    if (override.expiresAt < Date.now()) {
      if (override.clearTimer !== null) clearTimeout(override.clearTimer);
      skipOverrides.delete(summary.id);
      return summary;
    }
    if (summary.isSkipped === override.skipped) return summary;
    return {
      id: summary.id,
      number: summary.number,
      name: summary.name,
      isSkipped: override.skipped,
    };
  }

  function setSkipOverride(slideId: string, skipped: boolean, requestId: string): void {
    const prev = skipOverrides.get(slideId);
    if (prev !== undefined && prev.clearTimer !== null) {
      clearTimeout(prev.clearTimer);
    }
    skipOverrides.set(slideId, {
      skipped: skipped,
      requestId: requestId,
      expiresAt: Date.now() + SKIP_OVERRIDE_MAX_MS,
      clearTimer: null,
    });
    if (
      state.currentSummary !== null &&
      state.currentSummary.id === slideId &&
      state.currentSummary.isSkipped !== null
    ) {
      state.currentSummary.isSkipped = skipped;
    }
  }

  function settleSkipOverride(slideId: string, requestId: string): void {
    const override = skipOverrides.get(slideId);
    if (override === undefined || override.requestId !== requestId) return;
    override.expiresAt = Date.now() + SKIP_OVERRIDE_HOLD_MS;
    if (override.clearTimer !== null) clearTimeout(override.clearTimer);
    override.clearTimer = setTimeout(() => {
      const current = skipOverrides.get(slideId);
      if (current !== undefined && current.requestId === requestId) {
        skipOverrides.delete(slideId);
      }
    }, SKIP_OVERRIDE_HOLD_MS);
  }

  /** Apply a full slide-loaded payload from the sandbox. */
  function setSlideLoaded(
    summary: SlideSummary,
    general: GeneralSections | null,
    content: ContentItems | null,
    graphs: GraphItems | null,
  ): void {
    const nextSummary = applySkipOverride(summary);
    state.currentSummary = nextSummary;
    state.currentSlideId = nextSummary.id;
    state.general = general;
    state.content = content;
    state.graphs = graphs;
  }

  /** Apply a summary-only update (slide renamed or skip-toggled). */
  function setSummary(summary: SlideSummary): void {
    const nextSummary = applySkipOverride(summary);
    state.currentSummary = nextSummary;
    state.currentSlideId = nextSummary.id;
  }

  /** Selection cleared on the canvas — drop slide state entirely. */
  function clearSlide(): void {
    state.currentSummary = null;
    state.currentSlideId = null;
    state.general = null;
    state.content = null;
    state.graphs = null;
  }

  return {
    state,
    // getters
    noSlide,
    currentSummary,
    isSkipped,
    hasGeneral,
    hasContent,
    hasGraphs,
    allEmpty,
    // actions
    setActiveTab,
    setRuntime,
    setSkipOverride,
    settleSkipOverride,
    setSlideLoaded,
    setSummary,
    clearSlide,
  };
});
