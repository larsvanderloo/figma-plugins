// ============================================================
// usePluginView — centrale UI-store voor de drie-tab-editor.
//
// Eén module-scoped `reactive()`-singleton (zelfde patroon als
// chart-builder's useChartDataStore) — Pinia is overkill voor één
// plugin-iframe. Elke component die deze composable aanroept krijgt
// dezelfde state-referentie terug.
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

/**
 * Module-scoped singleton. Initiale waarde: lege slidelist, geen slide
 * actief, default-tab 'general'. Payloads zijn null tot `slide-loaded`
 * binnenkomt.
 */
const state = reactive<PluginViewState>({
  slides: [],
  currentSlideId: null,
  activeTab: 'general',
  general: null,
  content: null,
  graphs: null,
});

export function usePluginView() {
  return {
    /** Reactieve state — direct binden via v-model of template-refs. */
    state,

    /** Overschrijf de slidelist (bij `init` én `page-changed`). */
    setSlides(slides: SlideSummary[]): void {
      state.slides = slides;
    },

    /**
     * Markeer een slide als gekozen. Reset de payloads zodat de UI
     * direct een loading-state kan tonen; de volgende `slide-loaded`
     * van main vult general/content/graphs opnieuw.
     */
    pickSlide(id: string | null): void {
      state.currentSlideId = id;
      state.general = null;
      state.content = null;
      state.graphs = null;
    },

    /** Wissel actieve tab (general / content / graphs). */
    setActiveTab(tab: TabId): void {
      state.activeTab = tab;
    },

    /**
     * Vul de drie tab-payloads tegelijk — dit is wat main stuurt na
     * `pick-slide`. Losse setters hieronder bestaan voor toekomstige
     * per-section-refreshes (T8+).
     */
    setSlidePayload(
      general: GeneralSections | null,
      content: ContentItems | null,
      graphs: GraphItems | null,
    ): void {
      state.general = general;
      state.content = content;
      state.graphs = graphs;
    },

    setGeneral(section: GeneralSections | null): void {
      state.general = section;
    },

    setContent(items: ContentItems | null): void {
      state.content = items;
    },

    setGraphs(items: GraphItems | null): void {
      state.graphs = items;
    },
  };
}
