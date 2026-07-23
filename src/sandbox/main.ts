// Entry point: wires Figma lifecycle, scanning, message dispatch, and UI
// responses only — keep feature logic in domain modules under editors/**.

import uiHtml from '../../dist/ui.html';
import { REQUIRED_FONTS } from '../shared/constants';
import { debugLog, debugMessage } from '../shared/debug';
import { getRuntimeInfo, isDevModeRuntime } from './runtime';
import { postToUI } from './bridge';
import {
  findFocusedWelderSlide,
  getSlidesOnCurrentPage,
  invalidateSlidePageCache,
} from './slides';
import {
  clearDisplayedSlide,
  clearPendingSlideEmitTimers,
  emitSlideLoaded,
  lastDisplayedSlideId,
  postSlideContent,
  postSlideSummary,
} from './session';
import { messageHandlers } from './handlers';
import { findSlidesOnPage, isSlide } from './slide-machine';
import { primeIconCache } from './editors/_shared/icon-swap';
import { readBadgeIcon, readCardIcon } from './scan/readers';
import type { UIToPluginMessage } from '../shared/types';

figma.showUI(uiHtml, { width: 520, height: 760, themeColors: true });

debugLog('sandbox', 'startup', getRuntimeInfo());

// Async on purpose: the UI paints immediately at the default size; the
// resize follows once clientStorage answers.
(function restoreUiSize(): void {
  figma.clientStorage
    .getAsync('welder-ui-size')
    .then(function (stored: unknown) {
      if (stored === null || stored === undefined || typeof stored !== 'object') return;
      const s = stored as { width?: unknown; height?: unknown };
      const w = typeof s.width === 'number' ? s.width : null;
      const h = typeof s.height === 'number' ? s.height : null;
      if (w !== null && h !== null && w >= 320 && h >= 400) {
        try {
          figma.ui.resize(w, h);
        } catch (_e) {
          /* silent — resize can reject on detached UI */
        }
      }
    })
    .catch(function () {
      /* silent — clientStorage may be unavailable */
    });
})();

// One-shot per session: record each Card/Badge's visible icon into plugin
// data when none exists yet — without a record, a library update wipes the
// icon slot with nothing to restore from.
async function backfillAllIcons(): Promise<void> {
  try {
    await figma.loadAllPagesAsync();
  } catch (e) {
    console.log('[icon-backfill] loadAllPagesAsync failed: ' + String(e));
    return;
  }
  let cardsVisited = 0;
  let cardsWritten = 0;
  let badgesVisited = 0;
  let badgesWritten = 0;
  const staleCards: Array<{ slideId: string; cardNodeId: string; iconIntended: string }> = [];
  const staleBadges: Array<{ slideId: string; iconIntended: string }> = [];
  const pages = figma.root.children;
  for (let p = 0; p < pages.length; p++) {
    const page = pages[p];
    if (page.type !== 'PAGE') continue;
    let slides: InstanceNode[];
    try {
      slides = findSlidesOnPage(page);
    } catch (_e) {
      continue;
    }
    for (let s = 0; s < slides.length; s++) {
      const slide = slides[s];
      let cards: SceneNode[];
      try {
        cards = slide.findAll(function (n: SceneNode) {
          return n.type === 'INSTANCE' && n.name === 'Card';
        });
      } catch (_e) {
        cards = [];
      }
      for (let c = 0; c < cards.length; c++) {
        const card = cards[c];
        if (card.type !== 'INSTANCE') continue;
        const cardInst = card as InstanceNode;
        cardsVisited++;
        let stored = '';
        try {
          stored = cardInst.getSharedPluginData('welder', 'icon');
        } catch (_e) {
          continue;
        }
        const current = readCardIcon(card, slide);
        if (typeof stored === 'string' && stored.length > 0) {
          // Slot diverged from the stored record — a library republish wiped the override.
          if (current !== null && current.length > 0 && current !== stored) {
            staleCards.push({
              slideId: slide.id,
              cardNodeId: cardInst.id,
              iconIntended: stored,
            });
          }
          continue;
        }
        if (current === null || current.length === 0) continue;
        try {
          cardInst.setSharedPluginData('welder', 'icon', current);
          cardsWritten++;
        } catch (_e) {
        }
      }
      let badges: SceneNode[];
      try {
        badges = slide.findAll(function (n: SceneNode) {
          return n.type === 'INSTANCE' && n.name === 'Badge';
        });
      } catch (_e) {
        badges = [];
      }
      for (let b = 0; b < badges.length; b++) {
        const badge = badges[b];
        if (badge.type !== 'INSTANCE') continue;
        const badgeInst = badge as InstanceNode;
        badgesVisited++;
        let stored = '';
        try {
          stored = badgeInst.getSharedPluginData('welder', 'icon');
        } catch (_e) {
          continue;
        }
        const current = readBadgeIcon(badgeInst);
        if (typeof stored === 'string' && stored.length > 0) {
          if (current.length > 0 && current !== stored) {
            staleBadges.push({ slideId: slide.id, iconIntended: stored });
          }
          continue;
        }
        if (current.length === 0) continue;
        try {
          badgeInst.setSharedPluginData('welder', 'icon', current);
          badgesWritten++;
        } catch (_e) {
        }
      }
    }
  }
  debugLog(
    'icon-backfill',
    'cards: visited ' + cardsVisited + ', wrote ' + cardsWritten +
      ', stale ' + staleCards.length +
      ' · badges: visited ' + badgesVisited + ', wrote ' + badgesWritten +
      ', stale ' + staleBadges.length,
  );
  // Posted even when empty: the iframe dismisses its reconciling splash on it.
  postToUI({ type: 'stale-icons', cards: staleCards, badges: staleBadges });
}

// Fire-and-forget: a library update accepted within the first ~second could
// still race the backfill — accepted risk. Dev Mode is read-only, so skip.
if (!isDevModeRuntime()) {
  backfillAllIcons().catch(function (e: unknown) {
    console.log('[icon-backfill] failed:', e);
  });
} else {
  debugLog('icon-backfill', 'skipped-dev-mode');
}

// Fonts must be loaded before any .characters write; fail hard on a missing
// font now rather than crash silently during a later text edit.
async function loadFonts(): Promise<void> {
  await Promise.all(REQUIRED_FONTS.map((font) => figma.loadFontAsync(font)));
}

function isMutatingMessage(msg: UIToPluginMessage): boolean {
  if (msg.type === 'ui-ready') return false;
  if (msg.type === 'set-icon-recents') return false;
  if (msg.type === 'set-onboarding-seen') return false;
  if (msg.type === 'resize-ui') return false;
  if (msg.type === 'export-document') return false;
  if (msg.type === 'close') return false;
  return true;
}

function readMessageRequestId(msg: UIToPluginMessage): string | null {
  const raw = (msg as { requestId?: unknown }).requestId;
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

async function handleMessage(msg: UIToPluginMessage): Promise<void> {
  if (isDevModeRuntime() && isMutatingMessage(msg)) {
    const text =
      'Read-only Dev Mode diagnostics: "' +
      msg.type +
      '" is disabled. Use manifest.json in Figma Desktop for document edits.';
    debugLog('sandbox', 'dev-mode-command-blocked', { type: msg.type });
    postToUI({ type: 'target-updated', ok: false, error: text });
    return;
  }

  // An unknown message type is deliberately a silent no-op.
  const handler = messageHandlers[msg.type] as
    | ((m: UIToPluginMessage) => void | Promise<void>)
    | undefined;
  if (handler === undefined) return;
  await handler(msg);
}

async function main(): Promise<void> {
  // Only 'open' exists (menu and relaunch buttons share it); an unknown
  // command still gets the UI so the plugin stays debuggable.
  const cmd = figma.command;
  debugLog('sandbox', 'main:start', getRuntimeInfo());
  if (cmd !== '' && cmd !== 'open') {
    console.log('[welder-slide-editor] Unknown command:', cmd);
  }

  // Deliberately no awaited loadAllPagesAsync in this init path — it stalled
  // startup by 10-30s on large files.
  await loadFonts();

  // Pre-warm the icon-swap cache: resolving the Card master's ~1500 Lucide
  // preferredValues takes seconds, and an early icon pick would stall inside
  // that build. Later primeIconCache calls short-circuit on the shared promise.
  if (!isDevModeRuntime()) {
    (async function () {
      try {
        const slides = getSlidesOnCurrentPage();
        for (let i = 0; i < slides.length; i++) {
          const card = slides[i].findOne((n: SceneNode) => n.type === 'INSTANCE' && n.name === 'Card');
          if (card !== null && card.type === 'INSTANCE') {
            primeIconCache(card as InstanceNode).catch(() => {});
            return;
          }
        }
      } catch (_e) {
        // Fall back to the post-slide-loaded prime path; nothing to do here.
      }
    })();
  } else {
    debugLog('sandbox', 'prime-icon-cache-skipped-dev-mode');
  }

  figma.ui.onmessage = (raw: unknown) => {
    const msg = raw as UIToPluginMessage;
    const startedAt = Date.now();
    debugMessage('ui->plugin', msg);
    handleMessage(msg).then(() => {
      debugLog('perf', 'sandbox-handler', {
        type: msg.type,
        requestId: readMessageRequestId(msg),
        ok: true,
        totalMs: Date.now() - startedAt,
      });
    }).catch((err: unknown) => {
      const text = err instanceof Error ? err.message : String(err);
      debugLog('perf', 'sandbox-handler', {
        type: msg.type,
        requestId: readMessageRequestId(msg),
        ok: false,
        totalMs: Date.now() - startedAt,
        error: text,
      });
      debugLog('sandbox', 'handler-error', { type: msg.type, error: text });
      figma.notify('Slide editor error: ' + text, { error: true });
      postToUI({ type: 'target-updated', ok: false, error: text });
    });
  };

  // Per-page nodechange instead of documentchange: subscribing to
  // documentchange forces Figma to load every page. Re-attached on page
  // change so we always observe the page being edited.
  type NodeChangeEvent = {
    nodeChanges: ReadonlyArray<{ type: string; node: SceneNode }>;
  };
  type PageWithNodeChange = PageNode & {
    on: (type: 'nodechange', cb: (e: NodeChangeEvent) => void) => void;
    off: (type: 'nodechange', cb: (e: NodeChangeEvent) => void) => void;
  };
  function onPageNodeChange(event: NodeChangeEvent): void {
    try {
      let summaryDirty = false;
      let contentDirty = false;
      const changes = event.nodeChanges;
      for (let i = 0; i < changes.length; i++) {
        const change = changes[i];
        if (
          (change.node.type === 'INSTANCE' && isSlide(change.node)) ||
          (change.node.type === 'SLIDE' && change.type !== 'PROPERTY_CHANGE')
        ) {
          invalidateSlidePageCache('slide-structure-change');
        }
        if (change.type === 'PROPERTY_CHANGE' && change.node.type === 'SLIDE') {
          summaryDirty = true;
          continue;
        }
        if (
          change.type === 'PROPERTY_CHANGE' &&
          change.node.type === 'TEXT' &&
          change.node.name === 'Heading'
        ) {
          summaryDirty = true;
          contentDirty = true;
          continue;
        }
        contentDirty = true;
      }
      debugLog('figma-event', 'nodechange', {
        pageId: figma.currentPage.id,
        changeCount: changes.length,
        summaryDirty: summaryDirty,
        contentDirty: contentDirty,
      });
      if (summaryDirty) postSlideSummary();
      if (contentDirty) postSlideContent();
    } catch (err: unknown) {
      debugLog('figma-event', 'nodechange:error', err);
      console.log('[welder-slide-editor] nodechange handler failed:', err);
    }
  }

  let subscribedPage: PageWithNodeChange | null = null;
  function attachNodeChangeListener(): void {
    const newPage = figma.currentPage as PageWithNodeChange;
    if (subscribedPage === newPage) return;
    if (subscribedPage !== null) {
      try {
        subscribedPage.off('nodechange', onPageNodeChange);
      } catch (_e) {
      }
    }
    try {
      newPage.on('nodechange', onPageNodeChange);
      subscribedPage = newPage;
      debugLog('figma-event', 'nodechange:attached', {
        pageId: newPage.id,
        pageName: newPage.name,
      });
    } catch (err: unknown) {
      debugLog('figma-event', 'nodechange:attach-error', err);
      console.log('[welder-slide-editor] page.on(nodechange) failed:', err);
    }
  }
  attachNodeChangeListener();

  figma.on('currentpagechange', () => {
    try {
      debugLog('figma-event', 'currentpagechange', {
        pageId: figma.currentPage.id,
        pageName: figma.currentPage.name,
      });
      invalidateSlidePageCache('currentpagechange');
      // Swap the nodechange subscription to the new current page first
      // so any edits there reach the iframe.
      attachNodeChangeListener();

      const focused = findFocusedWelderSlide();
      if (focused === null) {
        clearDisplayedSlide();
        return;
      }
      debugLog('figma-event', 'currentpagechange:focused-slide', {
        slideId: focused.id,
        slideName: focused.name,
      });
      if (focused.id === lastDisplayedSlideId) return;
      void emitSlideLoaded(focused);
    } catch (err: unknown) {
      debugLog('figma-event', 'currentpagechange:error', err);
      console.log('[welder-slide-editor] currentpagechange handler failed:', err);
    }
  });

  // Both registration and handler are wrapped: a throw here once made the
  // plugin fail to open at all, and selectionchange can be unavailable.
  try {
    figma.on('selectionchange', () => {
      try {
        const focused = findFocusedWelderSlide();
        debugLog('figma-event', 'selectionchange', {
          selectionCount: figma.currentPage.selection.length,
          focusedSlideId: focused !== null ? focused.id : null,
          focusedSlideName: focused !== null ? focused.name : null,
        });
        if (focused === null) {
          if (lastDisplayedSlideId !== null) clearDisplayedSlide();
          return;
        }
        if (focused.id === lastDisplayedSlideId) return;
        void emitSlideLoaded(focused);
      } catch (err: unknown) {
        debugLog('figma-event', 'selectionchange:error', err);
        console.log('[welder-slide-editor] selectionchange handler failed:', err);
      }
    });
  } catch (err: unknown) {
    debugLog('figma-event', 'selectionchange:registration-error', err);
    console.log('[welder-slide-editor] selectionchange not available:', err);
  }

  figma.on('close', () => {
    debugLog('figma-event', 'close');
    // Figma detaches event listeners itself; only pending timers need clearing.
    clearPendingSlideEmitTimers();
  });
}

main().catch((err: unknown) => {
  const text = err instanceof Error ? err.message : String(err);
  debugLog('sandbox', 'startup-error', err);
  figma.notify('Slide editor failed to start: ' + text, { error: true });
  figma.closePlugin();
});
