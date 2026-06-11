// ============================================================
// sandbox/handlers/lifecycle.ts
//
// Plugin-lifecycle messages: ui-ready (init + eerste slide-load +
// clientStorage-hydrates), resize-ui, de clientStorage-persists
// (icon-recents, onboarding-seen) en close.
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import { getRuntimeInfo } from '../runtime';
import { postToUI } from '../bridge';
import { findFocusedWelderSlide } from '../slides';
import { emitSlideLoaded } from '../session';
import type { UIToPluginMessage } from '../../shared/types';

/** clientStorage key for the user's recently-picked icon names (max 8). */
const ICON_RECENTS_KEY = 'icon-recents';

/**
 * clientStorage key for the first-run onboarding flag. Versioned suffix:
 * bumping `-v1` → `-v2` re-triggers the walkthrough for every user when
 * a refreshed onboarding ships. Old keys can be left orphaned (single
 * boolean per user — no quota concern).
 */
const ONBOARDING_SEEN_KEY = 'welder-onboarding-seen-v1';

export async function handleUiReady(
  _msg: Extract<UIToPluginMessage, { type: 'ui-ready' }>,
): Promise<void> {
  // Selection-driven: post init, then if there's a currently-focused
  // slide on the active page, scan + emit slide-loaded. Otherwise the
  // iframe stays in its empty state until the user clicks a slide.
  postToUI({ type: 'init', runtime: getRuntimeInfo() });

  const focused = findFocusedWelderSlide();
  if (focused !== null) {
    await emitSlideLoaded(focused);
  }

  // Hydrate icon-recents from clientStorage. Fire-and-forget; init
  // doesn't block on it. UI shows an empty Recents row until this
  // resolves (typically <50ms).
  figma.clientStorage
    .getAsync(ICON_RECENTS_KEY)
    .then((value: unknown) => {
      const items = Array.isArray(value) ? (value as string[]) : [];
      postToUI({ type: 'icon-recents', items: items });
    })
    .catch((err: unknown) => {
      console.log('[welder-slide-editor] icon-recents load failed:', err);
      postToUI({ type: 'icon-recents', items: [] });
    });

  // Hydrate the first-run onboarding flag. Missing/unreadable storage
  // is treated as `seen: false` so the UI shows the walkthrough.
  figma.clientStorage
    .getAsync(ONBOARDING_SEEN_KEY)
    .then((value: unknown) => {
      postToUI({ type: 'onboarding-seen', seen: value === true });
    })
    .catch((err: unknown) => {
      console.log('[welder-slide-editor] onboarding-seen load failed:', err);
      postToUI({ type: 'onboarding-seen', seen: false });
    });
  return;
}

export function handleSetIconRecents(
  msg: Extract<UIToPluginMessage, { type: 'set-icon-recents' }>,
): void {
  // Fire-and-forget. `useIconRecents` is the source of truth in the
  // iframe; clientStorage is a persistence sink. A failed write only
  // affects the next plugin open.
  figma.clientStorage.setAsync(ICON_RECENTS_KEY, msg.items).catch((err: unknown) => {
    console.log('[welder-slide-editor] icon-recents save failed:', err);
  });
  return;
}

export function handleSetOnboardingSeen(
  _msg: Extract<UIToPluginMessage, { type: 'set-onboarding-seen' }>,
): void {
  figma.clientStorage.setAsync(ONBOARDING_SEEN_KEY, true).catch((err: unknown) => {
    console.log('[welder-slide-editor] onboarding-seen save failed:', err);
  });
  return;
}

export function handleResizeUi(
  msg: Extract<UIToPluginMessage, { type: 'resize-ui' }>,
): void {
  // Apply the new size on every drag event so the iframe tracks the
  // user's pointer 1:1; persist asynchronously so a write storm
  // during drag doesn't block UI updates. clientStorage drops
  // intermediate writes naturally — only the latest in-flight value
  // matters for restore.
  const w = Math.max(320, Math.min(2000, Math.round(msg.width)));
  const h = Math.max(400, Math.min(2000, Math.round(msg.height)));
  try {
    figma.ui.resize(w, h);
  } catch (e) {
    console.log('[welder-slide-editor] resize failed:', e);
    return;
  }
  figma.clientStorage
    .setAsync('welder-ui-size', { width: w, height: h })
    .catch(function () {
      /* silent */
    });
  return;
}

export function handleClose(_msg: Extract<UIToPluginMessage, { type: 'close' }>): void {
  figma.closePlugin();
  return;
}
