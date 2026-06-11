// ============================================================
// sandbox/session.ts
//
// Sessie-state van één plugin-run: welke slide de iframe toont, de
// dedup-signatures en debounce-timers, plus de emit-helpers
// (postSlideContent / postSlideSummary / emitSlideLoaded) die
// canvas-state naar de iframe doorzetten. Gedeeld tussen de
// figma.on-listeners in code.ts en de handlers onder
// sandbox/handlers/.
//
// ES2017-compat: geen optional chaining, geen nullish coalescing.
// ============================================================

import { debugLog } from '../shared/debug';
import { isDevModeRuntime } from './runtime';
import { isWithinSelfWriteWindow, postToUI } from './bridge';
import { findSlideById, summaryForSlide } from './slides';
import { scanSlide, SlideScan } from './scan/slide-scan';
import { postInitialSlidePreviews } from './scan/previews';
import { primeIconCache } from './editors/_shared/icon-swap';
import { loadAccentVars } from './editors/_shared/accent-vars';

// ============================================================
// Live current-slide refresh — debounced content + summary posts
// ============================================================

/**
 * Iframe's currently-displayed slide id. Set on every `pick-slide`
 * message; consumed by `postSlideContent()` so the sandbox can re-emit
 * `slide-loaded` when the canvas mutates externally (native Cmd+Z,
 * documentchange, etc.). Without this the iframe's optimistic store
 * state survives undo and the pickers desync from the canvas.
 */
export let lastDisplayedSlideId: string | null = null;

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

export function postSlideContent(): void {
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
        const slide = await findSlideById(lastDisplayedSlideId!);
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

/**
 * Overschrijf de summary-dedup-signature. Gebruikt door de
 * `set-slide-skipped` handler die de signature pre-seed zodat de
 * optimistische iframe-flip niet gevolgd wordt door een redundante
 * slide-summary-echo.
 */
export function setLastSentSummarySignature(sig: string): void {
  lastSentSummarySignature = sig;
}

export function postSlideSummary(): void {
  if (lastDisplayedSlideId === null) return;
  if (pendingSlideSummaryUpdate !== null) {
    clearTimeout(pendingSlideSummaryUpdate);
  }
  pendingSlideSummaryUpdate = setTimeout(async () => {
    pendingSlideSummaryUpdate = null;
    if (lastDisplayedSlideId === null) return;
    const startedAt = Date.now();
    try {
      const slide = await findSlideById(lastDisplayedSlideId);
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
export async function emitSlideLoaded(slide: InstanceNode): Promise<void> {
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

export function clearDisplayedSlide(): void {
  debugLog('sandbox', 'slide-deselected');
  lastDisplayedSlideId = null;
  lastSentSlideContentSignature = '';
  lastSentSummarySignature = '';
  postToUI({ type: 'slide-deselected' });
}

/**
 * Annuleer de pending debounce-timers. Aangeroepen vanuit de
 * figma.on('close')-hook in code.ts (FIG-CLOSE-01).
 */
export function clearPendingSlideEmitTimers(): void {
  if (pendingSlideContentUpdate !== null) {
    clearTimeout(pendingSlideContentUpdate);
    pendingSlideContentUpdate = null;
  }
  if (pendingSlideSummaryUpdate !== null) {
    clearTimeout(pendingSlideSummaryUpdate);
    pendingSlideSummaryUpdate = null;
  }
}
