// ============================================================
// usePluginView — centrale UI-store voor de drie-tab-editor.
//
// Pinia setup-store. State leeft als één `reactive()`-object onder
// `state` zodat de bestaande consumer-API (`view.state.slides` etc.)
// onaangetast blijft. Devtools tonen het state-object inline.
//
// State-shape volgt spec §3.2 (PluginView). `general`/`content`/
// `graphs` blijven `null` tot main-thread een `slide-loaded`-bericht
// stuurt; de panels renderen dan hun sectie of een empty-state.
//
// Actions zijn mutaties, niet async — bridge-sends gebeuren in
// App.vue (watchers of expliciete handler-binding). Dat houdt de
// store thread-agnostisch en makkelijk te testen.
// ============================================================

import { reactive } from 'vue';
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
   * `pick-slide`. Losse setters hieronder bestaan voor toekomstige
   * per-section-refreshes (T8+).
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

  function setGeneral(section: GeneralSections | null): void {
    state.general = section;
  }

  function setContent(items: ContentItems | null): void {
    state.content = items;
  }

  function setGraphs(items: GraphItems | null): void {
    state.graphs = items;
  }

  return {
    state,
    setSlides,
    pickSlide,
    setActiveTab,
    setSlidePayload,
    setGeneral,
    setContent,
    setGraphs,
  };
});
