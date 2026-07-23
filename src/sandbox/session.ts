import { debugLog } from '../shared/debug';
import { isDevModeRuntime } from './runtime';
import { isWithinSelfWriteWindow, postToUI } from './bridge';
import { findSlideById, summaryForSlide } from './slides';
import { scanSlide, SlideScan } from './scan/slide-scan';
import { postInitialSlidePreviews } from './scan/previews';
import { primeIconCache } from './editors/_shared/icon-swap';
import { loadAccentVars } from './editors/_shared/accent-vars';

// Slide the iframe currently shows; postSlideContent re-emits slide-loaded on
// external mutations (native Cmd+Z) so the pickers don't hold stale optimistic state.
export let lastDisplayedSlideId: string | null = null;

// 200ms debounce + signature dedup (mirrors postSlideList) so no-op
// documentchanges (e.g. selection-only) don't spam the bridge.
let pendingSlideContentUpdate: number | null = null;
let lastSentSlideContentSignature: string = '';

export function postSlideContent(): void {
  if (lastDisplayedSlideId === null) return;
  if (pendingSlideContentUpdate !== null) {
    clearTimeout(pendingSlideContentUpdate);
  }
  pendingSlideContentUpdate = setTimeout(() => {
    pendingSlideContentUpdate = null;
    if (lastDisplayedSlideId === null) return;
    if (isWithinSelfWriteWindow()) {
      // Echo of our own apply (markSelfWrite in bridge.ts) — the iframe already
      // holds this value. A timestamp window beats the old signature pre-seed,
      // which needed an async scan per apply and went stale when emits finished
      // out of order. Tradeoff: a native Cmd+Z inside the window is skipped
      // too; the next documentchange re-syncs. Plugin-driven undo bypasses
      // this and posts slide-loaded explicitly.
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

// Summary-only (no content rescan) so slide-name keystroke bursts stay cheap;
// same 200ms debounce + signature dedup as postSlideContent.
let pendingSlideSummaryUpdate: number | null = null;
let lastSentSummarySignature: string = '';

// The set-slide-skipped handler pre-seeds this so the optimistic iframe flip
// isn't followed by a redundant slide-summary echo.
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
    // Pre-warm accent-variable imports so the first heading-accent edit skips
    // the importVariableByKeyAsync cost; loadAccentVars is Promise-cached.
    if (!isDevModeRuntime()) {
      void loadAccentVars();
    }
  } catch (err: unknown) {
    debugLog('sandbox', 'emit-slide-loaded:error', err);
    console.log('[welder-slide-editor] emitSlideLoaded failed:', err);
  }
}

// Preload every font on the slide so per-keystroke setTextCharactersSafe hits
// Figma's font cache instead of paying loadFontAsync on the first edit.
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

// Prime the icon-swap cache off the first card so IconPicker's first open skips
// the import cost; always posts icons-ready so the picker can unlock.
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
