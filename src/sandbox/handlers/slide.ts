import { markSelfWrite, postToUI } from '../bridge';
import { refreshChartsOnSlide } from '../scan/graphs';
import { findSlideById, summaryForSlide } from '../slides';
import { setLastSentSummarySignature } from '../session';
import { findThemeCollectionsForSlide } from '../scan/theme';
import { setInstanceProperty, findConfidentalBadge } from '../slide-machine';
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
  // Match modes by NAME across collections: Welder Templates keeps a local
  // mirror of the library Theme, and both must move together with the picker.
  const foundMode =
    msg.modeId === null
      ? undefined
      : collections[0].modes.find((m) => m.modeId === msg.modeId);
  const sourceMode = foundMode === undefined ? null : foundMode;
  const targetName = sourceMode === null ? null : sourceMode.name;

  figma.commitUndo();
  // Suppress the documentchange-driven re-scan window; without it every theme
  // tap triggers a full scanSlide round-trip that lags the picker swatch.
  markSelfWrite();
  try {
    for (let i = 0; i < collections.length; i++) {
      const c = collections[i];
      if (msg.modeId === null) {
        // null modeId = clear: the slide inherits the page-level mode.
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
  // Bound paints follow the new mode by themselves, but the chart ramp is
  // render-time-resolved RGB — re-render ChartWrap so tints pick up the mode.
  await refreshChartsOnSlide(themeSlide, true);
  markSelfWrite();
  // No re-scan: the iframe applies the mode optimistically; skipping
  // scanSlide saves a 100-500ms round-trip on every theme click.
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
  // No summary re-emit: the iframe flips its pill optimistically; a sandbox
  // echo would waste a round-trip and can clobber a rapid second click.
  postToUI({
    type: 'target-updated',
    ok: true,
    requestId: msg.requestId,
    targetId: skipSlide.id,
  });
  return;
}

export async function handleSetSlideConfidential(
  msg: Extract<UIToPluginMessage, { type: 'set-slide-confidential' }>,
): Promise<void> {
  const slide = await findSlideById(msg.slideId);
  if (slide === null) {
    postToUI({
      type: 'target-updated',
      ok: false,
      requestId: msg.requestId,
      error: 'Slide not found: ' + msg.slideId,
    });
    return;
  }
  figma.commitUndo();
  markSelfWrite();
  // "Confidental" is the library's own misspelling — try it first, then the
  // corrected spelling. setInstanceProperty returns false when absent.
  let applied = setInstanceProperty(slide, 'Show Confidental', msg.show);
  if (!applied) {
    applied = setInstanceProperty(slide, 'Show Confidential', msg.show);
  }
  if (!applied) {
    postToUI({
      type: 'target-updated',
      ok: false,
      requestId: msg.requestId,
      error: 'Slide has no "Show Confidental" property',
    });
    return;
  }
  // Variant lives on the nested badge, not the Slide. setProperties throws on
  // an unknown variant value — a stale UI option must not break the toggle.
  if (typeof msg.variant === 'string' && msg.variant !== '') {
    const badge = findConfidentalBadge(slide);
    if (badge !== null) {
      try {
        setInstanceProperty(badge, 'Variant', msg.variant);
      } catch (eVariant) {
        console.log('[welder-slide-editor] set confidential variant failed:', eVariant);
      }
    }
  }
  // No re-scan: iframe updates optimistically, same as the other slide toggles.
  postToUI({
    type: 'target-updated',
    ok: true,
    requestId: msg.requestId,
    targetId: slide.id,
  });
  return;
}

export async function handleTriggerUndo(
  msg: Extract<UIToPluginMessage, { type: 'trigger-undo' }>,
): Promise<void> {
  // Figma exposes triggerUndo but no triggerRedo, so the iframe's redo button
  // is disabled; undo reverts to the last commitUndo() checkpoint.
  figma.triggerUndo();
  // Re-scan so optimistic iframe store updates don't survive the undo —
  // otherwise pickers keep showing pre-undo values while the canvas reverts.
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
