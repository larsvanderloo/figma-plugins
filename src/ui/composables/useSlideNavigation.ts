// useSlideNavigation — top-level slide picking + slide-list refresh.

import { reactive } from 'vue';
import { usePluginView } from '../stores/usePluginView';
import { usePluginBridge } from './usePluginBridge';

export function useSlideNavigation() {
  const view = usePluginView();
  const bridge = usePluginBridge();

  /**
   * Picks a slide both in the store (so the UI flips immediately) and
   * tells the sandbox to scan it. Caller is responsible for any
   * loading-state ref it wants to flip (e.g. `loadingSlide.value = true`).
   */
  function pick(slideId: string): void {
    view.pickSlide(slideId);
    bridge.post({ type: 'pick-slide', slideId: slideId });
  }

  /** Ask the sandbox to re-scan and post the current slide list. */
  function refresh(): void {
    bridge.post({ type: 'refresh-slides' });
  }

  /** Tell the sandbox the iframe is ready. Called once on mount. */
  function ready(): void {
    bridge.post({ type: 'ui-ready' });
  }

  return reactive({ pick, refresh, ready });
}
