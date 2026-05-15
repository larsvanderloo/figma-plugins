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
import type { ContentItems, GeneralSections, GraphItems, SlideSummary, TabId } from '../../types';

export interface PluginViewState {
  /** Current slide summary; null when no slide is selected on the canvas. */
  currentSummary: SlideSummary | null;
  /** Mirrors currentSummary.id for the editor composables that read it. */
  currentSlideId: string | null;
  activeTab: TabId;
  general: GeneralSections | null;
  content: ContentItems | null;
  graphs: GraphItems | null;
}

export const usePluginView = defineStore('pluginView', () => {
  const state = reactive<PluginViewState>({
    currentSummary: null,
    currentSlideId: null,
    activeTab: 'general',
    general: null,
    content: null,
    graphs: null,
  });

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

  /** Apply a full slide-loaded payload from the sandbox. */
  function setSlideLoaded(
    summary: SlideSummary,
    general: GeneralSections | null,
    content: ContentItems | null,
    graphs: GraphItems | null,
  ): void {
    state.currentSummary = summary;
    state.currentSlideId = summary.id;
    state.general = general;
    state.content = content;
    state.graphs = graphs;
  }

  /** Apply a summary-only update (slide renamed or skip-toggled). */
  function setSummary(summary: SlideSummary): void {
    state.currentSummary = summary;
    state.currentSlideId = summary.id;
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
    setSlideLoaded,
    setSummary,
    clearSlide,
  };
});
