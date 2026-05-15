// useSlideSettings — slide-level toggles (skip-mode, Theme-collection mode).

import { reactive } from 'vue';
import { usePluginView } from '../stores/usePluginView';
import { usePluginBridge } from './usePluginBridge';

export function useSlideSettings() {
  const view = usePluginView();
  const bridge = usePluginBridge();

  /** Toggle whether the slide is skipped during present mode. */
  function setSkipped(slideId: string, skipped: boolean): void {
    bridge.post({
      type: 'set-slide-skipped',
      slideId: slideId,
      skipped: skipped,
    });
  }

  /**
   * Pin (or clear, with `modeId = null`) the slide's Theme-collection mode.
   * Optimistically flips the picker swatch locally; sandbox confirms via
   * `target-updated` and does not re-emit the slide payload.
   */
  function setTheme(slideId: string, modeId: string | null): void {
    const theme = view.state.general?.theme;
    if (theme) {
      theme.explicitModeId = modeId;
      if (modeId !== null) theme.resolvedModeId = modeId;
    }
    bridge.post({ type: 'set-slide-theme', slideId: slideId, modeId: modeId });
  }

  return reactive({ setSkipped, setTheme });
}
