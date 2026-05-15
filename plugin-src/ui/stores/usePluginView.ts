// ============================================================
// usePluginView — centrale UI-store voor de drie-tab-editor.
//
// Pinia setup-store. State leeft als één `reactive()`-object onder
// `state`. Derived state (noSlide, currentSummary, isSkipped, hasX,
// allEmpty) wordt geëxposeerd als getters zodat consumers de
// derivatie niet zelf hoeven te schrijven en future panels dezelfde
// boolean-set delen.
//
// State-shape volgt spec §3.2 (PluginView). `general`/`content`/
// `graphs` blijven `null` tot main-thread een `slide-loaded`-bericht
// stuurt; de panels renderen dan hun sectie of een empty-state.
//
// Actions zijn mutaties, niet async — bridge-sends gebeuren in
// App.vue (watchers of expliciete handler-binding). Dat houdt de
// store thread-agnostisch en makkelijk te testen.
// ============================================================

import { reactive, computed } from 'vue';
import { defineStore } from 'pinia';
import type { ContentItems, GeneralSections, GraphItems, SlideSummary, TabId } from '../../types';

/** Shape van de top-level reactive state. Zie spec §3.2. */
export interface PluginViewState {
  slides: SlideSummary[];
  currentSlideId: string | null;
  activeTab: TabId;
  general: GeneralSections | null;
  content: ContentItems | null;
  graphs: GraphItems | null;
}

export const usePluginView = defineStore('pluginView', () => {
  const state = reactive<PluginViewState>({
    slides: [],
    currentSlideId: null,
    activeTab: 'general',
    general: null,
    content: null,
    graphs: null,
  });

  // ── Getters ────────────────────────────────────────────────────────────
  const noSlide = computed<boolean>(() => state.currentSlideId === null);

  const currentSummary = computed<SlideSummary | null>(() => {
    const id = state.currentSlideId;
    if (id === null) return null;
    const match = state.slides.find((s) => s.id === id);
    return match !== undefined ? match : null;
  });

  const isSkipped = computed<boolean>(() => {
    const summary = currentSummary.value;
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
  /** Overschrijf de slidelist (bij `init` én `page-changed`). */
  function setSlides(slides: SlideSummary[]): void {
    state.slides = slides;
  }

  /**
   * Markeer een slide als gekozen. Reset de payloads zodat de UI
   * direct een loading-state kan tonen; de volgende `slide-loaded`
   * van main vult general/content/graphs opnieuw.
   */
  function pickSlide(id: string | null): void {
    state.currentSlideId = id;
    state.general = null;
    state.content = null;
    state.graphs = null;
  }

  /** Wissel actieve tab (general / content / graphs). */
  function setActiveTab(tab: TabId): void {
    state.activeTab = tab;
  }

  /**
   * Vul de drie tab-payloads tegelijk — dit is wat main stuurt na
   * `pick-slide`. Per-section setters worden toegevoegd zodra T8+
   * incremental refreshes nodig heeft.
   */
  function setSlidePayload(
    general: GeneralSections | null,
    content: ContentItems | null,
    graphs: GraphItems | null,
  ): void {
    state.general = general;
    state.content = content;
    state.graphs = graphs;
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
    setSlides,
    pickSlide,
    setActiveTab,
    setSlidePayload,
  };
});
