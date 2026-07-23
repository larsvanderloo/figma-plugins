// The sandbox owns slide selection: it watches `selectionchange` and pushes
// `slide-loaded` / `slide-summary` / `slide-deselected`. The iframe never asks
// to switch slides — the user picks them on the Figma canvas.

import { reactive, computed } from 'vue';
import { defineStore } from 'pinia';
import type {
  ContentItems,
  GeneralSections,
  GraphItems,
  PluginRuntimeInfo,
  SlideSummary,
} from '../../shared/types';

export interface PluginViewState {
  runtime: PluginRuntimeInfo | null;
  currentSummary: SlideSummary | null;
  /** Mirrors currentSummary.id for the editor composables that read it. */
  currentSlideId: string | null;
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
    general: null,
    content: null,
    graphs: null,
  });
  const skipOverrides = new Map<string, SkipOverride>();

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

  function setSummary(summary: SlideSummary): void {
    const nextSummary = applySkipOverride(summary);
    state.currentSummary = nextSummary;
    state.currentSlideId = nextSummary.id;
  }

  function clearSlide(): void {
    state.currentSummary = null;
    state.currentSlideId = null;
    state.general = null;
    state.content = null;
    state.graphs = null;
  }

  return {
    state,
    noSlide,
    currentSummary,
    isSkipped,
    hasGeneral,
    hasContent,
    hasGraphs,
    allEmpty,
    setRuntime,
    setSkipOverride,
    settleSkipOverride,
    setSlideLoaded,
    setSummary,
    clearSlide,
  };
});
