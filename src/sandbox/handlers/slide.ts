// ============================================================
// sandbox/handlers/slide.ts
//
// Slide-level messages: theme-mode pinnen (set-slide-theme), skip-
// toggle (set-slide-skipped) en plugin-driven undo (trigger-undo).
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import { markSelfWrite, postToUI } from '../bridge';
import { refreshChartsOnSlide } from '../scan/graphs';
import { findSlideById, summaryForSlide } from '../slides';
import { setLastSentSummarySignature } from '../session';
import { findThemeCollectionsForSlide } from '../scan/theme';
import { scanSlide } from '../scan/slide-scan';
import type { UIToPluginMessage } from '../../shared/types';

export async function handleSetSlideTheme(
  msg: Extract<UIToPluginMessage, { type: 'set-slide-theme' }>,
): Promise<void> {
  const themeSlide = await findSlideById(msg.slideId);
  if (themeSlide === null) {
    postToUI({
      type: 'target-updated',
      ok: false,
      error: 'Slide not found: ' + msg.slideId,
    });
    return;
  }
  const collections = await findThemeCollectionsForSlide(themeSlide);
  if (collections.length === 0) {
    postToUI({
      type: 'target-updated',
      ok: false,
      error: 'Theme variable collection not found on this slide',
    });
    return;
  }
  // Resolve the chosen mode to its NAME on the source (first) collection,
  // then apply the equivalent mode (matched by name) on every other
  // Theme collection in scope. Welder Templates carries a local Theme
  // mirror of the library Theme; both must move together so the body
  // theme AND the accent text colour follow the picker.
  const foundMode =
    msg.modeId === null
      ? undefined
      : collections[0].modes.find((m) => m.modeId === msg.modeId);
  const sourceMode = foundMode === undefined ? null : foundMode;
  const targetName = sourceMode === null ? null : sourceMode.name;

  figma.commitUndo();
  // Suppress the documentchange-driven full re-scan window. Without
  // this, every theme tap would trigger `postSlideContent` →
  // `scanSlide` → `slide-loaded` round-trip after the apply, which
  // perceptibly lagged the picker swatch.
  markSelfWrite();
  try {
    for (let i = 0; i < collections.length; i++) {
      const c = collections[i];
      if (msg.modeId === null) {
        // Clear: slide inherits the page-level mode for this collection.
        themeSlide.clearExplicitVariableModeForCollection(c);
        continue;
      }
      const matching = c.modes.find((m) => m.name === targetName);
      if (matching === undefined) {
        console.log(
          '[welder-slide-editor] no Theme mode named "' +
            String(targetName) +
            '" in collection ' +
            c.name +
            ' (id ' +
            c.id +
            ') — skipping',
        );
        continue;
      }
      themeSlide.setExplicitVariableModeForCollection(c, matching.modeId);
    }
  } catch (err: unknown) {
    const text = err instanceof Error ? err.message : String(err);
    postToUI({
      type: 'target-updated',
      ok: false,
      error: 'setExplicitVariableModeForCollection failed: ' + text,
    });
    return;
  }
  // T47.2: gebonden paints volgen de nieuwe mode vanzelf, maar de chart-
  // ramp (segment/lijn-tinten) is rendertime-resolved RGB — re-render de
  // ChartWrap zodat de tinten de nieuwe theme-mode pakken.
  await refreshChartsOnSlide(themeSlide);
  markSelfWrite();
  // No slide re-scan: a theme change doesn't affect any other content
  // (text, icons, structure all stay the same). The iframe applies the
  // new mode optimistically before posting; this confirmation just
  // closes the round-trip. Saves a 100-500ms scanSlide + slide-loaded
  // round-trip on every theme click.
  postToUI({
    type: 'target-updated',
    ok: true,
    targetId: themeSlide.id,
  });
  return;
}

export async function handleSetSlideSkipped(
  msg: Extract<UIToPluginMessage, { type: 'set-slide-skipped' }>,
): Promise<void> {
  var skipSlide = await findSlideById(msg.slideId);
  if (skipSlide === null) {
    postToUI({
      type: 'target-updated',
      ok: false,
      requestId: msg.requestId,
      error: 'Slide not found: ' + msg.slideId,
    });
    return;
  }
  var skipParent: BaseNode | null = skipSlide.parent;
  if (skipParent === null || skipParent.type !== 'SLIDE') {
    postToUI({
      type: 'target-updated',
      ok: false,
      requestId: msg.requestId,
      error: 'Slide has no SlideNode parent (requires Figma Slides editor)',
    });
    return;
  }
  figma.commitUndo();
  markSelfWrite();
  (skipParent as SlideNode).isSkippedSlide = msg.skipped;
  const skipSummary = summaryForSlide(skipSlide);
  setLastSentSummarySignature(
    skipSummary.id + '|' + skipSummary.name + '|' + String(skipSummary.isSkipped),
  );
  // No slide-summary re-emit: the iframe flips its visibility pill
  // optimistically before posting, so a sandbox echo just forces a
  // wasted round-trip and can clobber a rapid second click. Same
  // pattern as set-slide-theme.
  //
  // `markSelfWrite()` above suppresses the documentchange-driven
  // re-scan window — without it, every toggle would trigger a full
  // `postSlideContent` → `scanSlide` round-trip, making the toggle
  // perceptibly lag.
  postToUI({
    type: 'target-updated',
    ok: true,
    requestId: msg.requestId,
    targetId: skipSlide.id,
  });
  return;
}

export async function handleTriggerUndo(
  msg: Extract<UIToPluginMessage, { type: 'trigger-undo' }>,
): Promise<void> {
  // Figma's plugin API exposes triggerUndo but no triggerRedo, so
  // the iframe's redo button is disabled with a tooltip pointing
  // at the native shortcut. Undo here reverts to the last
  // commitUndo() checkpoint.
  figma.triggerUndo();
  // Re-sync the iframe's view of the currently-displayed slide.
  // Without this, optimistic store updates (e.g. picker's
  // view.state.general.badge.icon = newIcon written before the
  // bridge.post) survive the undo and the picker keeps showing
  // the pre-undo value while the canvas correctly reverts.
  if (typeof msg.slideId === 'string' && msg.slideId.length > 0) {
    const undoSlide = await findSlideById(msg.slideId);
    if (undoSlide !== null) {
      try {
        const scan = await scanSlide(undoSlide);
        postToUI({
          type: 'slide-loaded',
          summary: summaryForSlide(undoSlide),
          general: scan.general,
          content: scan.content,
          graphs: scan.graphs,
        });
      } catch (err: unknown) {
        console.log('[welder-slide-editor] post-undo scanSlide failed:', err);
      }
    }
  }
  return;
}
