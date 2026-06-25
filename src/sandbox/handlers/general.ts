// ============================================================
// sandbox/handlers/general.ts
//
// General-tab messages: titel/omschrijving + badge (update-general),
// heading-accent (update-accent), typografie-zichtbaarheid en de
// CopyWrap Size-variant.
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import { debugLog } from '../../shared/debug';
import { markSelfWrite, postToUI } from '../bridge';
import { findSlideById } from '../slides';
import { findCopyWrap } from '../slide-machine';
import { applyTitleDescription } from '../editors/general/title-description';
import { applyBadge } from '../editors/general/badge';
import { applyAccentRanges } from '../editors/_shared/accent-ranges';
import { findVisibleTextNodeByName, resolveTypHeadingSizeHost } from '../scan/readers';
import { refreshTablesOnSlide, refreshChartsOnSlide } from '../scan/graphs';
import type { UIToPluginMessage } from '../../shared/types';

export async function handleUpdateGeneral(
  msg: Extract<UIToPluginMessage, { type: 'update-general' }>,
): Promise<void> {
  const slide = await findSlideById(msg.slideId);
  if (slide === null) {
    postToUI({
      type: 'target-updated',
      ok: false,
      error: 'Slide not found: ' + msg.slideId,
    });
    return;
  }
  if (msg.section === 'titleDescription') {
    const payload = msg.payload;
    figma.commitUndo();
    // Mark BEFORE apply: the apply chain triggers documentchange events
    // that arm postSlideContent's 200ms debounce. If apply takes longer
    // than 200ms (multi-text + auto-layout reflow), the debounce can
    // fire before apply completes. Marking pre-apply opens the window
    // early so the debounced scan still skips. We also mark post-apply
    // to extend the window past completion.
    markSelfWrite();
    await applyTitleDescription(slide, payload);
    await refreshTablesOnSlide(slide); // Re-render tables na CopyWrap-edit
    await refreshChartsOnSlide(slide); // Idem voor charts
    markSelfWrite();
    postToUI({
      type: 'target-updated',
      ok: true,
      targetId: slide.id,
    });
    return;
  }
  if (msg.section === 'badge') {
    const payload = msg.payload;
    // commitUndo before each plugin mutation creates a discrete
    // checkpoint so the iframe's plugin-Undo button reverts EXACTLY
    // this action (and not a coalesced batch with whatever followed).
    figma.commitUndo();
    markSelfWrite();
    await applyBadge(slide, payload);
    markSelfWrite();
    postToUI({
      type: 'target-updated',
      ok: true,
      targetId: slide.id,
    });
    return;
  }
  return;
}

export async function handleUpdateAccent(
  msg: Extract<UIToPluginMessage, { type: 'update-accent' }>,
): Promise<void> {
  // Heading-only. Paragraph-accent permanent out-of-scope.
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
  const copyWrap = findCopyWrap(slide);
  if (copyWrap === null) {
    postToUI({
      type: 'target-updated',
      ok: false,
      requestId: msg.requestId,
      error: 'CopyWrap not found on slide: ' + msg.slideId,
    });
    return;
  }
  const headingNode = findVisibleTextNodeByName(copyWrap, 'Heading', slide);
  if (headingNode === null) {
    postToUI({
      type: 'target-updated',
      ok: false,
      requestId: msg.requestId,
      error: 'Heading node not found',
    });
    return;
  }
  const startedAt = Date.now();
  debugLog('accent', 'sandbox:start', {
    slideId: msg.slideId,
    rangeCount: msg.dimRanges.length,
  });
  figma.commitUndo();
  markSelfWrite();
  const applyStartedAt = Date.now();
  await applyAccentRanges(headingNode, msg.dimRanges);
  const applyMs = Date.now() - applyStartedAt;
  // Fill-only accent writes do not alter CopyWrap geometry; table refresh is
  // reserved for text/size mutations that can actually reflow layout.
  markSelfWrite();
  debugLog('accent', 'sandbox:done', {
    slideId: msg.slideId,
    targetId: headingNode.id,
    rangeCount: msg.dimRanges.length,
    applyMs: applyMs,
    totalMs: Date.now() - startedAt,
  });
  postToUI({ type: 'target-updated', ok: true, requestId: msg.requestId, targetId: headingNode.id });
  return;
}

export async function handleSetTypographyVisibility(
  msg: Extract<UIToPluginMessage, { type: 'set-typography-visibility' }>,
): Promise<void> {
  const visSlide = await findSlideById(msg.slideId);
  if (visSlide === null) {
    postToUI({
      type: 'target-updated',
      ok: false,
      error: 'Slide not found: ' + msg.slideId,
    });
    return;
  }
  figma.commitUndo();
  markSelfWrite();
  try {
    if (msg.field === 'badge') {
      // Badge visibility binds to the `Badge_wrap` FRAME inside
      // CopyWrap — toggling that wrapper collapses the badge out of
      // CopyWrap's auto-layout cleanly. Legacy fallback: setProperties
      // on the `showBadge` BOOLEAN for older masters without the wrap.
      const cw = findCopyWrap(visSlide);
      if (cw !== null) {
        const badgeWrap = cw.findOne(function (n: SceneNode) {
          return (n.type === 'FRAME' || n.type === 'INSTANCE') && n.name === 'Badge_wrap';
        });
        if (badgeWrap !== null && 'visible' in badgeWrap) {
          (badgeWrap as SceneNode).visible = msg.visible;
        } else {
          const props = cw.componentProperties;
          let showKey: string | null = null;
          if (props !== null && props !== undefined) {
            const keys = Object.keys(props);
            for (let i = 0; i < keys.length; i++) {
              const bare = keys[i].split('#')[0].toLowerCase();
              if (bare === 'showbadge' && props[keys[i]].type === 'BOOLEAN') {
                showKey = keys[i];
                break;
              }
            }
          }
          if (showKey !== null) {
            const overrides: { [k: string]: boolean } = {};
            overrides[showKey] = msg.visible;
            cw.setProperties(overrides);
          }
        }
      }
    } else {
      await applyTitleDescription(visSlide, {
        headingVisible: msg.field === 'heading' ? msg.visible : undefined,
        paragraphVisible: msg.field === 'paragraph' ? msg.visible : undefined,
      });
    }
    if (msg.field === 'heading' || msg.field === 'paragraph') {
      await refreshTablesOnSlide(visSlide);
      await refreshChartsOnSlide(visSlide);
    }
  } catch (e) {
    console.log('[set-typography-visibility] failed: ' + String(e));
    postToUI({
      type: 'target-updated',
      ok: false,
      error: 'apply failed: ' + String(e),
    });
    return;
  }
  markSelfWrite();
  postToUI({ type: 'target-updated', ok: true, targetId: visSlide.id });
  return;
}

export async function handleSetCopywrapSize(
  msg: Extract<UIToPluginMessage, { type: 'set-copywrap-size' }>,
): Promise<void> {
  const sizeSlide = await findSlideById(msg.slideId);
  if (sizeSlide === null) {
    postToUI({
      type: 'target-updated',
      ok: false,
      error: 'Slide not found: ' + msg.slideId,
    });
    return;
  }
  const copyWrapForSize = findCopyWrap(sizeSlide);
  if (copyWrapForSize === null) {
    postToUI({
      type: 'target-updated',
      ok: false,
      error: 'CopyWrap not found on slide',
    });
    return;
  }
  // Same resolver as the read-side: the actual VARIANT host is the
  // nested TypHeading instance (legacy fallback to CopyWrap-level).
  const sizeHostInfo = await resolveTypHeadingSizeHost(copyWrapForSize);
  if (sizeHostInfo === null) {
    postToUI({
      type: 'target-updated',
      ok: false,
      error: 'TypHeading + size variant property not found',
    });
    return;
  }
  figma.commitUndo();
  markSelfWrite();
  try {
    const overrides: { [k: string]: string } = {};
    overrides[sizeHostInfo.key] = msg.size;
    sizeHostInfo.host.setProperties(overrides);
    await refreshTablesOnSlide(sizeSlide);
    await refreshChartsOnSlide(sizeSlide);
  } catch (e) {
    console.log('[set-copywrap-size] setProperties failed: ' + String(e));
    postToUI({
      type: 'target-updated',
      ok: false,
      error: 'setProperties failed: ' + String(e),
    });
    return;
  }
  markSelfWrite();
  postToUI({ type: 'target-updated', ok: true, targetId: sizeHostInfo.host.id });
  return;
}
