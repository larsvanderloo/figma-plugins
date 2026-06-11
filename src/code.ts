// ============================================================
// Welder Slide Editor — Plugin Main
//
// Entry-point voor de plugin-thread. Verantwoordelijkheden:
//   1. UI-iframe tonen (figma.showUI).
//   2. Fonts preloaden (FIG-FONT-01) zodat latere debounced text-edits
//      direct kunnen doorzetten zonder per-call loadFontAsync.
//   3. Command-dispatch op `figma.command` (manifest menu "open").
//   4. Bridge-message-loop: vertaalt UI-events naar figma-node-scans
//      en response-messages (spec §5, FIG-MSG-01).
//   5. Page-change listener: hercomputet de slidelist bij page-nav.
//
// This file is still the sandbox entry point. Keep new feature logic in
// domain modules under editors/** where possible; code.ts should only wire
// Figma lifecycle, scanning, message dispatch, and UI responses.
// ============================================================

import uiHtml from '../dist/ui.html';
import { REQUIRED_FONTS } from './constants';
import { debugLog, debugMessage } from './debug';
import { getRuntimeInfo, isDevModeRuntime } from './sandbox/runtime';
import { isWithinSelfWriteWindow, markSelfWrite, postToUI } from './sandbox/bridge';
import {
  findFocusedWelderSlide,
  findSlideAncestor,
  findSlideById,
  getSlidesOnCurrentPage,
  invalidateSlidePageCache,
  summaryForSlide,
} from './sandbox/slides';
import { findSlidesOnPage, findCopyWrap, findCardWrap, isSlide } from './slide-machine';
import { applyTitleDescription } from './editors/general/title-description';
import { applyBadge } from './editors/general/badge';
import { applyImage } from './editors/general/image';
import { findImageSlot } from './editors/_shared/node-finders';
import { applyCard, applyCardVisual } from './editors/content/card';
import { applyCardSize } from './editors/content/card-size';
import { applyInstructorCard } from './editors/content/instructor';
import { primeIconCache } from './editors/_shared/icon-swap';
import { applyTable } from './editors/table/renderer';
import { importCSV } from './editors/table/csv';
import { setTextCharactersSafe } from './editors/_shared/fonts';
import { resolveTextStyleByName } from './editors/_shared/text-styles';
import {
  readBadgeIcon,
  readCardIcon,
  findVisibleTextNodeByName,
  resolveTypHeadingSizeHost,
  findThemeCollectionsForSlide,
  readCardTypeVariant,
  postInitialSlidePreviews,
  scanSlide,
  refreshTablesOnSlide,
  lastSentPreviewHash,
  SlideScan,
} from './scan/slide-scan';
import { loadAccentVars } from './editors/_shared/accent-vars';
import { applyAccentRanges } from './editors/_shared/accent-ranges';
import type {
  SlideSummary,
  UIToPluginMessage,
  PluginToUIMessage,
} from './types';

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
 * Faalt hard bij een missing font zodat we niet later in T8/T9/T11
 * stille crashes krijgen. FIG-FONT-01.
 */
async function loadFonts(): Promise<void> {
  await Promise.all(REQUIRED_FONTS.map((font) => figma.loadFontAsync(font)));
}

// ============================================================
// Slide-scan — bouwt de drie tab-payloads voor één slide
// ============================================================
// Live current-slide refresh — debounced content + summary posts
// ============================================================

/** clientStorage key for the user's recently-picked icon names (max 8). */
const ICON_RECENTS_KEY = 'icon-recents';

/**
 * clientStorage key for the first-run onboarding flag. Versioned suffix:
 * bumping `-v1` → `-v2` re-triggers the walkthrough for every user when
 * a refreshed onboarding ships. Old keys can be left orphaned (single
 * boolean per user — no quota concern).
 */
const ONBOARDING_SEEN_KEY = 'welder-onboarding-seen-v1';

/**
 * Iframe's currently-displayed slide id. Set on every `pick-slide`
 * message; consumed by `postSlideContent()` so the sandbox can re-emit
 * `slide-loaded` when the canvas mutates externally (native Cmd+Z,
 * documentchange, etc.). Without this the iframe's optimistic store
 * state survives undo and the pickers desync from the canvas.
 */
let lastDisplayedSlideId: string | null = null;

/**
 * Debounced re-scan + slide-loaded re-emit for whatever slide the
 * iframe is currently showing. Mirrors the postSlideList shape — same
 * 200ms coalesce, same dedup-by-signature so a no-op documentchange
 * doesn't spam the bridge.
 */
let pendingSlideContentUpdate: number | null = null;
let lastSentSlideContentSignature: string = '';

/**
 * Self-write echo suppression — timestamp window.
 *
 * Each iframe-driven `applyXxx` calls `markSelfWrite()` after the
 * mutation completes. `postSlideContent`'s debounced scan checks
 * whether we're still within `SELF_WRITE_WINDOW_MS` of the last
 * self-write; if so, skips the slide-loaded post.
 *
 * Why timestamps over the previous sig-pre-seed approach: pre-seed
 * required an async `scanSlide` per apply, and rapid emits could
 * complete out of order, leaving the seeded sig stale. The
 * timestamp comparison is atomic and order-independent — it
 * doesn't matter how many emits stack up; as long as the last one
 * was recent, the documentchange-driven scan stays suppressed.
 *
 * Tradeoff: native Cmd+Z within ~250ms of a plugin write also gets
 * suppressed (the iframe pickers won't update for that one undo).
 * The window is short enough that this is rare and self-correcting
 * — any subsequent documentchange (or pause + slide-pick) re-syncs.
 * Plugin-driven undo (`trigger-undo` handler) bypasses
 * `postSlideContent` entirely with its own explicit `slide-loaded`
 * post, so iframe-button-driven undo always works.
 */
// Self-write window state + rationale: zie sandbox/bridge.ts.

function postSlideContent(): void {
  if (lastDisplayedSlideId === null) return;
  if (pendingSlideContentUpdate !== null) {
    clearTimeout(pendingSlideContentUpdate);
  }
  pendingSlideContentUpdate = setTimeout(() => {
    pendingSlideContentUpdate = null;
    if (lastDisplayedSlideId === null) return;
    if (isWithinSelfWriteWindow()) {
      // Inside the self-write window: this documentchange almost
      // certainly came from our own apply path. Skip — the iframe
      // already has the value it just emitted in its local refs.
      return;
    }
    void (async function () {
      const startedAt = Date.now();
      try {
        const slide = findSlideById(lastDisplayedSlideId!);
        if (slide === null) return;
        const scanStartedAt = Date.now();
        const scan = await scanSlide(slide);
        const scanMs = Date.now() - scanStartedAt;
        // Cheap signature: stringify the general/content/graphs payload.
        // If it matches the last sent, skip the post (avoids spamming
        // the bridge on documentchanges that didn't actually change
        // editable state — e.g. selection-only events).
        const signatureStartedAt = Date.now();
        const sig = JSON.stringify({
          g: scan.general,
          c: scan.content,
          h: scan.graphs,
        });
        const signatureMs = Date.now() - signatureStartedAt;
        if (sig === lastSentSlideContentSignature) {
          debugLog('perf', 'post-slide-content-skip', {
            slideId: slide.id,
            reason: 'signature',
            scanMs: scanMs,
            signatureMs: signatureMs,
            totalMs: Date.now() - startedAt,
          });
          return;
        }
        lastSentSlideContentSignature = sig;
        debugLog('sandbox', 'post-slide-content', {
          slideId: slide.id,
          hasGeneral: scan.general !== null,
          cardCount: scan.content !== null ? scan.content.cards.length : 0,
          graphCount: scan.graphs !== null ? scan.graphs.instances.length : 0,
        });
        const postStartedAt = Date.now();
        postToUI({
          type: 'slide-loaded',
          summary: summaryForSlide(slide),
          general: scan.general,
          content: scan.content,
          graphs: scan.graphs,
        });
        debugLog('perf', 'post-slide-content', {
          slideId: slide.id,
          scanMs: scanMs,
          signatureMs: signatureMs,
          postMs: Date.now() - postStartedAt,
          totalMs: Date.now() - startedAt,
          hasGeneral: scan.general !== null,
          cardCount: scan.content !== null ? scan.content.cards.length : 0,
          graphCount: scan.graphs !== null ? scan.graphs.instances.length : 0,
        });
      } catch (err: unknown) {
        debugLog('sandbox', 'post-slide-content:error', err);
        console.log('[welder-slide-editor] postSlideContent failed:', err);
      }
    })();
  }, 200) as unknown as number;
}

/**
 * Lightweight summary-only post for the currently-displayed slide.
 * Used by the documentchange handler when the slide's name (heading
 * text) or isSkipped flag changes — no need to rescan content.
 *
 * Debounced 200ms and signature-deduped against the last emit so a
 * burst of name-keystrokes doesn't spam the bridge.
 */
let pendingSlideSummaryUpdate: number | null = null;
let lastSentSummarySignature: string = '';

function postSlideSummary(): void {
  if (lastDisplayedSlideId === null) return;
  if (pendingSlideSummaryUpdate !== null) {
    clearTimeout(pendingSlideSummaryUpdate);
  }
  pendingSlideSummaryUpdate = setTimeout(() => {
    pendingSlideSummaryUpdate = null;
    if (lastDisplayedSlideId === null) return;
    const startedAt = Date.now();
    try {
      const slide = findSlideById(lastDisplayedSlideId);
      if (slide === null) return;
      const summaryStartedAt = Date.now();
      const summary = summaryForSlide(slide);
      const summaryMs = Date.now() - summaryStartedAt;
      const sig = summary.id + '|' + summary.name + '|' + String(summary.isSkipped);
      if (sig === lastSentSummarySignature) {
        debugLog('perf', 'post-slide-summary-skip', {
          slideId: slide.id,
          reason: 'signature',
          summaryMs: summaryMs,
          totalMs: Date.now() - startedAt,
        });
        return;
      }
      lastSentSummarySignature = sig;
      debugLog('sandbox', 'post-slide-summary', summary);
      const postStartedAt = Date.now();
      postToUI({ type: 'slide-summary', summary: summary });
      debugLog('perf', 'post-slide-summary', {
        slideId: slide.id,
        summaryMs: summaryMs,
        postMs: Date.now() - postStartedAt,
        totalMs: Date.now() - startedAt,
        isSkipped: summary.isSkipped,
      });
    } catch (err: unknown) {
      debugLog('sandbox', 'post-slide-summary:error', err);
      console.log('[welder-slide-editor] postSlideSummary failed:', err);
    }
  }, 200) as unknown as number;
}

/**
 * Scan + post slide-loaded for the given slide. Wraps the scan, the
 * signature-cache update, the slide-loaded post, and the fire-and-forget
 * preview emissions. Called by ui-ready, selectionchange, and
 * currentpagechange.
 */
async function emitSlideLoaded(slide: InstanceNode): Promise<void> {
  const startedAt = Date.now();
  try {
    debugLog('sandbox', 'emit-slide-loaded:start', {
      slideId: slide.id,
      slideName: slide.name,
    });
    const scanStartedAt = Date.now();
    const scan = await scanSlide(slide);
    const scanMs = Date.now() - scanStartedAt;
    lastDisplayedSlideId = slide.id;
    const signatureStartedAt = Date.now();
    lastSentSlideContentSignature = JSON.stringify({
      g: scan.general,
      c: scan.content,
      h: scan.graphs,
    });
    const summary = summaryForSlide(slide);
    lastSentSummarySignature = summary.id + '|' + summary.name + '|' + String(summary.isSkipped);
    const signatureMs = Date.now() - signatureStartedAt;
    const postStartedAt = Date.now();
    postToUI({
      type: 'slide-loaded',
      summary: summary,
      general: scan.general,
      content: scan.content,
      graphs: scan.graphs,
    });
    const postMs = Date.now() - postStartedAt;
    debugLog('sandbox', 'emit-slide-loaded:posted', {
      slideId: slide.id,
      hasGeneral: scan.general !== null,
      cardCount: scan.content !== null ? scan.content.cards.length : 0,
      graphCount: scan.graphs !== null ? scan.graphs.instances.length : 0,
    });
    debugLog('perf', 'emit-slide-loaded', {
      slideId: slide.id,
      scanMs: scanMs,
      signatureMs: signatureMs,
      postMs: postMs,
      totalMs: Date.now() - startedAt,
      hasGeneral: scan.general !== null,
      cardCount: scan.content !== null ? scan.content.cards.length : 0,
      graphCount: scan.graphs !== null ? scan.graphs.instances.length : 0,
    });
    void postInitialSlidePreviews(slide, scan);
    if (!isDevModeRuntime()) {
      void primeIconCacheForSlide(scan);
    }
    void preloadSlideFonts(slide);
    // Pre-warm the Text/Text Dimmer variable imports so the first
    // heading-accent edit doesn't pay the importVariableByKeyAsync cost.
    // loadAccentVars is Promise-cached, so subsequent edits are free.
    if (!isDevModeRuntime()) {
      void loadAccentVars();
    }
  } catch (err: unknown) {
    debugLog('sandbox', 'emit-slide-loaded:error', err);
    console.log('[welder-slide-editor] emitSlideLoaded failed:', err);
  }
}

/**
 * Pre-load every unique font used by editable TEXT descendants of the
 * slide. Lets the per-keystroke setTextCharactersSafe call hit Figma's
 * font cache instead of paying loadFontAsync on the first edit. Run
 * fire-and-forget after slide-loaded; even on slow accounts it finishes
 * before the user finishes reading the slide.
 */
async function preloadSlideFonts(slide: InstanceNode): Promise<void> {
  try {
    const textNodes = slide.findAll((n: SceneNode) => n.type === 'TEXT') as TextNode[];
    const seen: { [k: string]: boolean } = {};
    const loads: Array<Promise<void>> = [];
    for (let i = 0; i < textNodes.length; i++) {
      const node = textNodes[i];
      const fontName = node.fontName;
      if (fontName === figma.mixed) {
        const segments = node.getStyledTextSegments(['fontName']);
        for (let s = 0; s < segments.length; s++) {
          const fn = segments[s].fontName;
          const key = fn.family + '::' + fn.style;
          if (seen[key] === true) continue;
          seen[key] = true;
          loads.push(figma.loadFontAsync(fn));
        }
      } else {
        const fn = fontName as FontName;
        const key = fn.family + '::' + fn.style;
        if (seen[key] === true) continue;
        seen[key] = true;
        loads.push(figma.loadFontAsync(fn));
      }
    }
    await Promise.all(loads);
  } catch (err: unknown) {
    console.log('[welder-slide-editor] preloadSlideFonts failed:', err);
  }
}

/**
 * Prime the icon-swap cache using the first card or badge on the slide
 * so the IconPicker doesn't pay the import cost on first open. Posts
 * `icons-ready` when done (or immediately if no suitable node found) so
 * the picker UI can unlock.
 */
async function primeIconCacheForSlide(scan: SlideScan): Promise<void> {
  const startedAt = Date.now();
  let cardNodeId: string | null = null;
  if (scan.content !== null && scan.content.cards.length > 0) {
    cardNodeId = scan.content.cards[0].cardNodeId;
  }
  let targetNode: InstanceNode | null = null;
  if (cardNodeId !== null) {
    try {
      const n = await figma.getNodeByIdAsync(cardNodeId);
      if (n !== null && n.type === 'INSTANCE') {
        targetNode = n as InstanceNode;
      }
    } catch (_e) {
      /* node not found — skip */
    }
  }
  if (targetNode === null) {
    debugLog('perf', 'prime-icon-cache-slide', {
      targetFound: false,
      totalMs: Date.now() - startedAt,
    });
    postToUI({ type: 'icons-ready' });
    return;
  }
  let ok = true;
  try {
    await primeIconCache(targetNode);
  } catch (e) {
    ok = false;
    debugLog('sandbox', 'prime-icon-cache:error', e);
    // fall through to icons-ready so the picker can open even if priming fails
  }
  debugLog('perf', 'prime-icon-cache-slide', {
    targetFound: true,
    ok: ok,
    targetId: targetNode.id,
    targetName: targetNode.name,
    totalMs: Date.now() - startedAt,
  });
  postToUI({ type: 'icons-ready' });
}

function clearDisplayedSlide(): void {
  debugLog('sandbox', 'slide-deselected');
  lastDisplayedSlideId = null;
  lastSentSlideContentSignature = '';
  lastSentSummarySignature = '';
  postToUI({ type: 'slide-deselected' });
}

// ============================================================
// Bridge-message-loop (spec §5)
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

  if (msg.type === 'ui-ready') {
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

  if (msg.type === 'set-icon-recents') {
    // Fire-and-forget. `useIconRecents` is the source of truth in the
    // iframe; clientStorage is a persistence sink. A failed write only
    // affects the next plugin open.
    figma.clientStorage.setAsync(ICON_RECENTS_KEY, msg.items).catch((err: unknown) => {
      console.log('[welder-slide-editor] icon-recents save failed:', err);
    });
    return;
  }

  if (msg.type === 'set-onboarding-seen') {
    figma.clientStorage.setAsync(ONBOARDING_SEEN_KEY, true).catch((err: unknown) => {
      console.log('[welder-slide-editor] onboarding-seen save failed:', err);
    });
    return;
  }

  if (msg.type === 'resize-ui') {
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

  if (msg.type === 'update-general') {
    const slide = findSlideById(msg.slideId);
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
      await refreshTablesOnSlide(slide); // T39.3: re-render tables na CopyWrap-edit
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

  if (msg.type === 'update-accent') {
    // Spec §13 T30 — heading-only. Paragraph-accent permanent out-of-scope.
    const slide = findSlideById(msg.slideId);
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

  if (msg.type === 'update-card') {
    const slide = findSlideById(msg.slideId);
    if (slide === null) {
      postToUI({
        type: 'target-updated',
        ok: false,
        error: 'Slide not found: ' + msg.slideId,
      });
      return;
    }
    figma.commitUndo();
    markSelfWrite();
    await applyCard(slide, {
      cardNodeId: msg.cardNodeId,
      heading: msg.payload.heading,
      paragraph: msg.payload.paragraph,
      icon: msg.payload.icon,
      iconSvg: msg.payload.iconSvg,
      style: msg.payload.style,
    });
    markSelfWrite();
    postToUI({
      type: 'target-updated',
      ok: true,
      targetId: msg.cardNodeId,
    });
    return;
  }

  if (msg.type === 'update-instructor-card') {
    const slide = findSlideById(msg.slideId);
    if (slide === null) {
      postToUI({
        type: 'target-updated',
        ok: false,
        error: 'Slide not found: ' + msg.slideId,
      });
      return;
    }
    figma.commitUndo();
    markSelfWrite();
    const resetItems = await applyInstructorCard(slide, {
      cardNodeId: msg.cardNodeId,
      instructor: msg.payload.instructor,
      items: msg.payload.items,
      visible: msg.payload.visible,
    });
    markSelfWrite();
    postToUI({
      type: 'target-updated',
      ok: true,
      targetId: msg.cardNodeId,
    });
    if (resetItems !== null && typeof msg.payload.instructor === 'string') {
      // Instructor-switch reset de list-teksten naar de defaults van de
      // nieuwe variant — de sandbox is hier de bron, niet de iframe.
      // Gericht patch-bericht: een volledige emitSlideLoaded (incl.
      // preview-exports + icon-prime) maakte de switch merkbaar traag.
      postToUI({
        type: 'instructor-card-updated',
        cardNodeId: msg.cardNodeId,
        instructor: msg.payload.instructor,
        items: resetItems,
      });
    }
    return;
  }

  if (msg.type === 'set-card-size') {
    const slide = findSlideById(msg.slideId);
    if (slide === null) {
      postToUI({
        type: 'target-updated',
        ok: false,
        error: 'Slide not found: ' + msg.slideId,
      });
      return;
    }
    // Resolve the heading text-style id once, up front. Library-subscribed
    // styles aren't enumerable by name — sandbox walks all TEXT nodes on
    // first use to build a styleName → styleId map (cached for the session).
    const styleId = await resolveTextStyleByName(msg.headingStyleName);
    if (styleId === null) {
      postToUI({
        type: 'target-updated',
        ok: false,
        error:
          'Text style "' + msg.headingStyleName +
          '" not found in this file. Apply it once to any text node so the plugin can register it.',
      });
      return;
    }
    figma.commitUndo();
    markSelfWrite();
    await applyCardSize(slide, {
      styleId: styleId,
      iconSize: msg.iconSize,
      gapModeName: msg.gapModeName,
      iconVisible: msg.iconVisible,
    });

    postToUI({ type: 'target-updated', ok: true });
    return;
  }

  if (msg.type === 'update-timeline-item') {
    // T31.2 — muteert heading/paragraph van één CopyWrap-item.
    // Zoek CopyWrap via slide.findOne(id) zodat ook genestede CopyWraps
    // (binnen tussenliggende Frames) gevonden worden — wrapper-agnostisch.
    const slide = findSlideById(msg.slideId);
    if (slide === null) {
      postToUI({
        type: 'target-updated',
        ok: false,
        error: 'Slide not found: ' + msg.slideId,
      });
      return;
    }
    // T31.2: slide-scoped findOne op node-id — vindt ook genestede CopyWraps.
    const copyWrapNode = slide.findOne(function (n: SceneNode) {
      return n.type === 'INSTANCE' && n.name === 'CopyWrap' && n.id === msg.copyWrapNodeId;
    });
    const copyWrap: InstanceNode | null =
      copyWrapNode !== null && copyWrapNode.type === 'INSTANCE'
        ? (copyWrapNode as InstanceNode)
        : null;
    if (copyWrap === null) {
      postToUI({
        type: 'target-updated',
        ok: false,
        error: 'Timeline CopyWrap not found: ' + msg.copyWrapNodeId,
      });
      return;
    }
    figma.commitUndo();
    if (typeof msg.payload.heading === 'string') {
      const headingNode = copyWrap.findOne((n: SceneNode) => {
        return n.type === 'TEXT' && n.name === 'Heading';
      });
      if (headingNode !== null && headingNode.type === 'TEXT') {
        await setTextCharactersSafe(headingNode as TextNode, msg.payload.heading);
      }
    }
    if (typeof msg.payload.paragraph === 'string') {
      const paragraphNode = copyWrap.findOne((n: SceneNode) => {
        return n.type === 'TEXT' && n.name === 'Paragraph';
      });
      if (paragraphNode !== null && paragraphNode.type === 'TEXT') {
        await setTextCharactersSafe(paragraphNode as TextNode, msg.payload.paragraph);
      }
    }
    postToUI({
      type: 'target-updated',
      ok: true,
      targetId: msg.copyWrapNodeId,
    });
    return;
  }

  if (msg.type === 'update-table') {
    // T34.2: Slot-based full-state PUT. msg.slotId adresseert de SlotNode
    // rechtstreeks (de UI ontving 'm via `GraphInstance.nodeId`).
    const slide = findSlideById(msg.slideId);
    if (slide === null) {
      postToUI({
        type: 'target-updated',
        ok: false,
        error: 'Slide not found: ' + msg.slideId,
      });
      return;
    }
    const slotNode = await figma.getNodeByIdAsync(msg.slotId);
    if (slotNode === null || slotNode.type !== 'SLOT') {
      postToUI({
        type: 'target-updated',
        ok: false,
        error: 'Table slot not found: ' + msg.slotId,
      });
      return;
    }
    figma.commitUndo();
    await applyTable(slotNode as SlotNode, msg.desired);
    postToUI({
      type: 'target-updated',
      ok: true,
      targetId: msg.slotId,
    });
    return;
  }

  if (msg.type === 'import-csv') {
    // T34.2 / T39.2: parse + truncate + applyTable. Width blijft behouden
    // (gelezen uit pluginData) — import verandert alleen row/cel-inhoud.
    const slide = findSlideById(msg.slideId);
    if (slide === null) {
      postToUI({
        type: 'target-updated',
        ok: false,
        error: 'Slide not found: ' + msg.slideId,
      });
      return;
    }
    const slotNode = await figma.getNodeByIdAsync(msg.slotId);
    if (slotNode === null || slotNode.type !== 'SLOT') {
      postToUI({
        type: 'target-updated',
        ok: false,
        error: 'Table slot not found: ' + msg.slotId,
      });
      return;
    }
    figma.commitUndo();
    await importCSV(slotNode as SlotNode, msg.csv);
    postToUI({
      type: 'target-updated',
      ok: true,
      targetId: msg.slotId,
    });
    return;
  }

  if (msg.type === 'upload-image') {
    // Target-node lookup — `documentAccess: "dynamic-page"` vereist de
    // async-variant. Bytes komen als Uint8Array via structured-cloning
    // binnen en hoeven niet geconverteerd te worden.
    const target = await figma.getNodeByIdAsync(msg.targetNodeId);
    if (target === null) {
      postToUI({
        type: 'target-updated',
        ok: false,
        error: 'Target node not found: ' + msg.targetNodeId,
      });
      return;
    }
    const slide = findSlideAncestor(target);
    if (slide === null) {
      postToUI({
        type: 'target-updated',
        ok: false,
        error: 'No enclosing slide for target: ' + msg.targetNodeId,
      });
      return;
    }

    // Routing: wanneer de target een directe child is van CardWrap gaan
    // de bytes naar de card-slot; anders naar de slide-level ImageWrap.
    const cardWrap = findCardWrap(slide);
    const targetParent = 'parent' in target ? (target as SceneNode).parent : null;
    const isCardChild =
      cardWrap !== null && targetParent !== null && targetParent.id === cardWrap.id;

    figma.commitUndo();

    if (isCardChild) {
      const newHash = await applyCardVisual(slide, msg.targetNodeId, msg.bytes);
      if (newHash === null) {
        postToUI({
          type: 'target-updated',
          ok: false,
          error: 'Card visual slot not found: ' + msg.targetNodeId,
        });
        return;
      }
      // Refresh thumbnail in iframe immediately — bytes are already in
      // scope (the user just uploaded them), so no getBytesAsync round-
      // trip. fillW/fillH come from the card's visual slot for aspect-
      // ratio matching in the thumbnail box.
      let cardFillW = 0;
      let cardFillH = 0;
      if (target.type === 'INSTANCE') {
        const cardSlot = findImageSlot(target as InstanceNode, false);
        if (cardSlot !== null && 'width' in cardSlot && 'height' in cardSlot) {
          const w = (cardSlot as LayoutMixin).width;
          const h = (cardSlot as LayoutMixin).height;
          if (w > 0 && h > 0) {
            cardFillW = w;
            cardFillH = h;
          }
        }
      }
      postToUI({
        type: 'card-visual-preview',
        cardNodeId: msg.targetNodeId,
        bytes: msg.bytes,
        fillW: cardFillW,
        fillH: cardFillH,
      });
      postToUI({
        type: 'target-updated',
        ok: true,
        targetId: msg.targetNodeId,
      });
      return;
    }

    const newHash = await applyImage(slide, { bytes: msg.bytes });
    if (newHash === null) {
      postToUI({
        type: 'target-updated',
        ok: false,
        error: 'ImageWrap not found on slide: ' + slide.id,
      });
      return;
    }

    // Refresh thumbnail in UI immediately — no need for getBytesAsync, we
    // already have the bytes that were just uploaded (FIG-ASYNC-01 compliant:
    // no fire-and-forget; this is synchronous within the async handler).
    var previewFillW = 0;
    var previewFillH = 0;
    try {
      if (target.type === 'INSTANCE') {
        var previewSlot = findImageSlot(target as InstanceNode, true);
        if (previewSlot !== null && 'width' in previewSlot && 'height' in previewSlot) {
          var previewSlotW = (previewSlot as LayoutMixin).width;
          var previewSlotH = (previewSlot as LayoutMixin).height;
          if (previewSlotW > 0 && previewSlotH > 0) {
            previewFillW = previewSlotW;
            previewFillH = previewSlotH;
          }
        }
      }
    } catch (_e) {
      // Fallback: laat dims op 0 staan; UI toont h-36 fallback.
    }
    postToUI({
      type: 'image-preview',
      imageWrapId: msg.targetNodeId,
      bytes: msg.bytes,
      fillW: previewFillW,
      fillH: previewFillH,
    });
    // Update dedup-cache so that een documentchange-triggered pick-slide
    // de preview niet opnieuw verstuurt met de verouderde hash.
    lastSentPreviewHash.set(msg.targetNodeId, newHash);

    postToUI({
      type: 'target-updated',
      ok: true,
      targetId: msg.targetNodeId,
    });
    return;
  }

  if (msg.type === 'set-slide-theme') {
    const themeSlide = findSlideById(msg.slideId);
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
    const sourceMode =
      msg.modeId === null
        ? null
        : collections[0].modes.find((m) => m.modeId === msg.modeId) ?? null;
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

  if (msg.type === 'set-slide-skipped') {
    var skipSlide = findSlideById(msg.slideId);
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
    lastSentSummarySignature =
      skipSummary.id + '|' + skipSummary.name + '|' + String(skipSummary.isSkipped);
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

  if (msg.type === 'set-typography-visibility') {
    const visSlide = findSlideById(msg.slideId);
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
    } catch (e) {
      console.log('[set-typography-visibility] failed: ' + String(e));
      postToUI({
        type: 'target-updated',
        ok: false,
        error: 'apply failed: ' + String(e),
      });
      return;
    }
    postToUI({ type: 'target-updated', ok: true, targetId: visSlide.id });
    return;
  }

  if (msg.type === 'set-copywrap-size') {
    const sizeSlide = findSlideById(msg.slideId);
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
    } catch (e) {
      console.log('[set-copywrap-size] setProperties failed: ' + String(e));
      postToUI({
        type: 'target-updated',
        ok: false,
        error: 'setProperties failed: ' + String(e),
      });
      return;
    }
    postToUI({ type: 'target-updated', ok: true, targetId: sizeHostInfo.host.id });
    return;
  }

  if (msg.type === 'trigger-undo') {
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
      const undoSlide = findSlideById(msg.slideId);
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

  if (msg.type === 'export-document') {
    // Single slide → walk up to the SLIDE parent (1920×1080) when one
    // exists; that's what Figma's native present/export targets, not
    // the Welder INSTANCE inside it. In Figma Design (no SLIDE parent)
    // we fall back to the INSTANCE itself.
    if (msg.target === 'slide') {
      if (typeof msg.slideId !== 'string' || msg.slideId.length === 0) {
        postToUI({
          type: 'target-updated',
          ok: false,
          error: 'No slide selected to export.',
        });
        return;
      }
      const welderSlide = findSlideById(msg.slideId);
      if (welderSlide === null) {
        postToUI({
          type: 'target-updated',
          ok: false,
          error: 'Slide not found: ' + msg.slideId,
        });
        return;
      }
      const target: SceneNode =
        welderSlide.parent !== null && welderSlide.parent.type === 'SLIDE'
          ? (welderSlide.parent as SlideNode)
          : welderSlide;

      // Match the picker name exactly: heading text within CopyWrap,
      // fallback to "Slide N" where N is the slide's 1-based index on
      // the current page. Same logic as `slideSummary` (used by the
      // SlideSelector dropdown), so the file the user downloads is
      // labelled with the same name they see in the picker.
      const summary = summaryForSlide(welderSlide);
      const baseName = summary.name;

      const ext = msg.format === 'PNG' ? '.png' : '.pdf';
      const filename = sanitizeBaseFilename(baseName) + ext;
      let bytes: Uint8Array;
      try {
        bytes = await (target as unknown as ExportMixin).exportAsync({ format: msg.format });
      } catch (err: unknown) {
        const text = err instanceof Error ? err.message : String(err);
        postToUI({
          type: 'target-updated',
          ok: false,
          error: msg.format + '-export mislukt: ' + text,
        });
        return;
      }
      postToUI({
        type: 'document-ready',
        target: 'slide',
        format: msg.format,
        bytes: bytes,
        filename: filename,
        title: baseName,
      });
      return;
    }

    // Presentation export.
    const baseName = figma.currentPage.name || 'presentation';
    if (msg.format === 'PNG') {
      // PNG of an entire presentation is ambiguous (giant single image
      // vs. a zip of per-slide PNGs). Not supported in v1; UI gates
      // this combo, so this branch is a defensive guard.
      postToUI({
        type: 'target-updated',
        ok: false,
        error: 'PNG-export voor de hele presentatie wordt nog niet ondersteund.',
      });
      return;
    }

    // Presentation PDF — iterate non-skipped SLIDE nodes (or the
    // Welder INSTANCE when there's no SLIDE parent), exportAsync
    // each as a single-page PDF, ship the parts to the iframe; the
    // iframe merges with pdf-lib. Page-level exportAsync would just
    // produce one giant single-page PDF spanning the canvas grid.
    const welderSlides = getSlidesOnCurrentPage();
    const targets: SceneNode[] = [];
    for (let i = 0; i < welderSlides.length; i++) {
      const ws = welderSlides[i];
      if (ws.parent !== null && ws.parent.type === 'SLIDE') {
        const slide = ws.parent as SlideNode;
        if (slide.isSkippedSlide) continue;
        targets.push(slide);
      } else {
        targets.push(ws);
      }
    }
    if (targets.length === 0) {
      postToUI({
        type: 'target-updated',
        ok: false,
        error: 'Geen slides om te exporteren.',
      });
      return;
    }

    const parts: Uint8Array[] = [];
    for (let i = 0; i < targets.length; i++) {
      try {
        const bytes = await (targets[i] as unknown as ExportMixin).exportAsync({
          format: 'PDF',
        });
        parts.push(bytes);
      } catch (err: unknown) {
        const text = err instanceof Error ? err.message : String(err);
        postToUI({
          type: 'target-updated',
          ok: false,
          error: 'PDF-export slide ' + String(i + 1) + ' mislukt: ' + text,
        });
        return;
      }
    }
    postToUI({
      type: 'presentation-pdf-parts',
      parts: parts,
      filename: sanitizeBaseFilename(baseName) + '.pdf',
      title: baseName,
    });
    return;
  }

  if (msg.type === 'close') {
    figma.closePlugin();
    return;
  }
}

/**
 * Strip filesystem-unfriendly characters from a string so it's safe
 * as a download filename across macOS / Windows / Linux. Collapses
 * runs of spaces / underscores into a single hyphen, drops leading
 * and trailing hyphens, caps length at 80 chars. Caller appends the
 * format extension.
 */
function sanitizeBaseFilename(raw: string): string {
  const trimmed = raw.replace(/[\\/:*?"<>|]/g, '').trim();
  const collapsed = trimmed.replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  const safe = collapsed.length > 0 ? collapsed : 'export';
  return safe.length > 80 ? safe.slice(0, 80) : safe;
}

// ============================================================
// Main — init-sequence
// ============================================================

async function main(): Promise<void> {
  // Command-dispatch: v0.1.0 heeft alleen 'open' (manifest menu +
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
    if (pendingSlideContentUpdate !== null) {
      clearTimeout(pendingSlideContentUpdate);
      pendingSlideContentUpdate = null;
    }
    if (pendingSlideSummaryUpdate !== null) {
      clearTimeout(pendingSlideSummaryUpdate);
      pendingSlideSummaryUpdate = null;
    }
  });
}

main().catch((err: unknown) => {
  const text = err instanceof Error ? err.message : String(err);
  debugLog('sandbox', 'startup-error', err);
  figma.notify('Slide editor failed to start: ' + text, { error: true });
  figma.closePlugin();
});
