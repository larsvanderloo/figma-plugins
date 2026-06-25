// ============================================================
// Welder Slide Editor — Plugin Main
//
// Entry-point voor de plugin-thread. Verantwoordelijkheden:
//   1. UI-iframe tonen (figma.showUI).
//   2. Fonts preloaden (FIG-FONT-01) zodat latere debounced text-edits
//      direct kunnen doorzetten zonder per-call loadFontAsync.
//   3. Command-dispatch op `figma.command` (manifest menu "open").
//   4. Bridge-message-loop: vertaalt UI-events naar figma-node-scans
//      en response-messages (FIG-MSG-01).
//   5. Page-change listener: hercomputet de slidelist bij page-nav.
//
// Keep new feature logic in domain modules under editors/** where
// possible; this entry point should only wire Figma lifecycle,
// scanning, message dispatch, and UI responses.
// Message-handlers leven in sandbox/handlers/** (registry in
// sandbox/handlers/index.ts); sessie-state + emit-helpers in
// sandbox/session.ts.
// ============================================================

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

// ============================================================
// Bootstrap
// ============================================================

figma.showUI(uiHtml, { width: 520, height: 760, themeColors: true });

debugLog('sandbox', 'startup', getRuntimeInfo());

// Restore last-saved iframe size (clientStorage, per-user). Async so the
// UI shows immediately at the default; the resize is a no-op flicker if
// the saved values match the defaults.
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

// ============================================================
// Proactive icon backfill — walks every Welder Slide on every page,
// captures each Card's currently-visible icon into plugin data when
// it has no record yet. One-shot per plugin session, fire-and-forget.
//
// Why: the reconcile fix only protects icons that already have plugin
// data. Cards on slides the user hasn't visited via the new plugin yet
// have no record, so a subsequent library update wipes their slot
// child without anything to restore from. Running this on startup
// ensures every card in the file is protected before the user gets a
// chance to accept the next library update.
// ============================================================
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
      // ── Cards ──
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
          // Already persisted — flag stale when slot diverged from the
          // record (library republish wiped the override).
          if (current !== null && current.length > 0 && current !== stored) {
            staleCards.push({
              slideId: slide.id,
              cardNodeId: cardInst.id,
              iconIntended: stored,
            });
          }
          continue;
        }
        // No record yet — backfill from current slot value.
        if (current === null || current.length === 0) continue;
        try {
          cardInst.setSharedPluginData('welder', 'icon', current);
          cardsWritten++;
        } catch (_e) {
          /* silent */
        }
      }
      // ── Badges ──
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
          /* silent */
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
  // Post stale list (always — possibly empty) so the iframe can dismiss
  // its "reconciling" splash phase once it sees this message.
  postToUI({ type: 'stale-icons', cards: staleCards, badges: staleBadges });
}

// Fire-and-forget — happens in the background after the UI is shown.
// Plugin-data writes are cheap and the user is unlikely to accept a
// library update within the first ~second of opening the plugin.
// Dev Mode is read-only for this debug manifest, so skip backfills there.
if (!isDevModeRuntime()) {
  backfillAllIcons().catch(function (e: unknown) {
    console.log('[icon-backfill] failed:', e);
  });
} else {
  debugLog('icon-backfill', 'skipped-dev-mode');
}

/**
 * Parallel preload van alle fonts die we in text-mutaties gebruiken.
 * Faalt hard bij een missing font zodat we niet later stille crashes
 * krijgen. FIG-FONT-01.
 */
async function loadFonts(): Promise<void> {
  await Promise.all(REQUIRED_FONTS.map((font) => figma.loadFontAsync(font)));
}

// ============================================================
// Bridge-message-loop
// ============================================================

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

  // Registry-lookup (sandbox/handlers/index.ts). Een onbekend
  // message-type is een stille no-op — zelfde gedrag als de oude
  // if-chain die er zonder match doorheen viel.
  const handler = messageHandlers[msg.type] as
    | ((m: UIToPluginMessage) => void | Promise<void>)
    | undefined;
  if (handler === undefined) return;
  await handler(msg);
}

// ============================================================
// Main — init-sequence
// ============================================================

async function main(): Promise<void> {
  // Command-dispatch: er is alleen 'open' (manifest menu +
  // relaunch-buttons vuren met diezelfde command). Geen command-match
  // betekent dat de plugin via een ander event is gestart; we tonen
  // dan alsnog de UI (defensief).
  const cmd = figma.command;
  debugLog('sandbox', 'main:start', getRuntimeInfo());
  if (cmd !== '' && cmd !== 'open') {
    // Onbekend command: log maar blijf draaien zodat de UI debugbaar is.
    console.log('[welder-slide-editor] Unknown command:', cmd);
  }

  // Font-preload: klaar vóór live-events. FIG-FONT-01, FIG-ASYNC-01.
  // loadAllPagesAsync is verwijderd — het scande alle pagina's en veroorzaakte
  // 10-30s vertraging bij grote bestanden. primeIconCache bestaat niet meer,
  // dus er is geen volledige paginascan nodig.
  await loadFonts();

  // Pre-warm icon-swap cache. The Welder Card master's INSTANCE_SWAP
  // property carries ~1500 preferredValues (the full Lucide collection),
  // and `buildPrefValueCache` resolves each via importComponentByKeyAsync
  // — many seconds in aggregate. Without pre-warming, a user who picks
  // a badge icon shortly after plugin open lands inside the cache-build
  // wait inside `swapComponentByName` (Badge's icon path), and the swap
  // visibly stalls; the bug surfaces as "works after switching slides
  // back and forth" because by then the build has finished.
  //
  // Kick the build off here, fire-and-forget, so it's already running
  // (or done) by the time the iframe sends ui-ready. The post-slide-
  // loaded primeIconCache call is now a no-op safety net — it
  // short-circuits on the existing prefValueBuildPromise.
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

  // Per-page nodechange subscription instead of figma.on('documentchange').
  // documentchange forces Figma to load every page in the file just to
  // subscribe — Figma's own dynamic-page docs steer us to PageNode.on
  // ('nodechange') for targeted monitoring. We re-attach the listener
  // whenever the current page changes so we always observe the page
  // the user is editing.
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
        /* silent */
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

      // Page changed — the previously-focused slide is on a different page
      // now, so the iframe should re-evaluate based on the new page's
      // current selection.
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

  // Selection-driven slide switching. When the user selects a slide (or
  // anything inside one), the sandbox scans it and posts slide-loaded.
  // When the selection no longer resolves to a slide, posts slide-deselected.
  // Full try/catch — crashing this would re-introduce the earlier "plugin
  // opent niet meer" bug; silent skip is fine.
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
    // Cleanup hook — Figma ruimt listeners automatisch op. FIG-CLOSE-01.
    clearPendingSlideEmitTimers();
  });
}

main().catch((err: unknown) => {
  const text = err instanceof Error ? err.message : String(err);
  debugLog('sandbox', 'startup-error', err);
  figma.notify('Slide editor failed to start: ' + text, { error: true });
  figma.closePlugin();
});
