import { getRuntimeInfo } from '../runtime';
import { postToUI } from '../bridge';
import { findFocusedWelderSlide } from '../slides';
import { emitSlideLoaded } from '../session';
import type { UIToPluginMessage } from '../../shared/types';

const ICON_RECENTS_KEY = 'icon-recents';

// Versioned suffix: bump -v1 to -v2 to re-trigger onboarding for every user;
// orphaned old keys are fine (one boolean per user, no quota concern).
const ONBOARDING_SEEN_KEY = 'welder-onboarding-seen-v1';

export async function handleUiReady(
  _msg: Extract<UIToPluginMessage, { type: 'ui-ready' }>,
): Promise<void> {
  postToUI({ type: 'init', runtime: getRuntimeInfo() });

  // No focused slide: the iframe deliberately stays empty until the user selects one.
  const focused = findFocusedWelderSlide();
  if (focused !== null) {
    await emitSlideLoaded(focused);
  }

  // Deliberately not awaited so init never blocks on clientStorage.
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
  // The iframe (`useIconRecents`) is the source of truth; clientStorage is only
  // a persistence sink, so a failed write merely affects the next plugin open.
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
  // Resize synchronously so the iframe tracks the drag 1:1; persist async so the
  // write storm during a drag never blocks it — only the last size matters for restore.
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
