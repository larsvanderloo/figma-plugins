// Welder Editor — code-side entry (Sprint 1 Wave 2a)
//
// Runs in Figma's plugin sandbox. No DOM, no window, no localStorage.
// Owns figma.* integration and message-bus dispatch.
//
// Replaces the Sprint 0 stub (57 lines).
//
// Wave 1 wrappers used:
//   - createRouter (router.ts): typed message dispatch with version gate.
//   - loadNamedVariables (variables.ts): library variable pre-warm.
//   - onSelectionChange (selection.ts): subscribe to selection events.
//   - withTimeout (progress.ts): guard long-running async paths.
//   - getNodeByIdSafe (selection.ts): null-safe node lookup.
//
// ADRs:
//   - ADR-0002: editorType ['figma','slides'] — guard on init.
//   - ADR-0003: no Zod on code side; hand-rolled guards in handlers.
//   - ADR-0004: withAtomic opt-in inside table/journey apply; no commitUndo default.
//   - ADR-0005: loadNamedVariables + resolveVariableForConsumer (T28.2 pattern).
//   - ADR-0007: no chart handlers.
//
// Owner: figma-api-engineer

import {
  createRouter,
  loadNamedVariables,
  onSelectionChange,
  withTimeout,
  getNodeByIdSafe,
} from '@figma-plugins/figma-api';
import { MESSAGE_BUS_VERSION } from '@shared/messages';
import type {
  Message,
  EditorType,
  SlideSummary,
  GeneralSections,
  ContentItems,
  GraphItems,
  WelderError,
  WelderErrorCode,
  TableWrapModel,
  JourneyWrapModel,
} from '@shared/messages';
import {
  findSlidesOnCurrentPage,
  buildSlideSummary,
  buildSlideListSignature,
  isSlide,
  findSlideAncestor,
  findCopyWrap,
  findBadge,
  findImageWrap,
  findCardWrap,
  findTimelineWrap,
  findTableSlot,
  findJourneySlot,
} from './slide-machine';
import { extractCopyWrap, applyCopyWrap } from './wrappers/CopyWrap';
import { extractBadge, applyBadge } from './wrappers/Badge';
import { extractImageWrap, applyImageWrap, getImagePreviewBytes } from './wrappers/ImageWrap';
import { extractCardsFromScope, applyCard } from './wrappers/CardWrap';
import { extractCopyWrapItems, applyTimeline } from './wrappers/TimelineWrap';
import { scanTableSlotNode, applyTableToSlot, setTableVariables } from './wrappers/TableWrap';
import { scanJourneySlotNode, applyJourneyToSlot } from './wrappers/JourneyWrap';
import { primeIconCache } from './icon-swap';
import { getClientState, setClientState } from './persistence';

// ---------------------------------------------------------------------------
// Welder variable keys — published Slide Machine library
// (kAZqxj4nxpafYjB5FhfOru). See ADR-0005.
// ---------------------------------------------------------------------------

const WELDER_VARIABLE_KEYS = {
  text: 'aaeec2f93a38b8a2e3af696972c4313eff529bc7',
  dimmer: 'cd3f59ce0c953ee93c4a30b738a96683035b3d72',
} as const;

// ---------------------------------------------------------------------------
// Router setup
// ---------------------------------------------------------------------------

const router = createRouter({ version: MESSAGE_BUS_VERSION });

// ---------------------------------------------------------------------------
// Result envelope helpers
//
// The router's Result<T, E> defaults to E=string. Our handlers return
// WelderError (a typed object). We cast via `handlerResult` below so TS
// accepts the typed error in the router while the wire payload carries the
// full WelderError object (which postMessage sends as a plain object).
// ---------------------------------------------------------------------------

function ok<T>(data: T): { ok: true; data: T } {
  return { ok: true, data };
}

function err(code: WelderErrorCode, message: string): { ok: false; error: WelderError } {
  return { ok: false, error: { code, message } };
}

/**
 * Wrapper around router.on that casts the handler's WelderError to `unknown`
 * so the router's Result<T, string> default accepts our typed error envelope.
 * The wire format carries the WelderError object serialised by postMessage.
 */
function handle<P, R>(
  type: string,
  fn: (payload: P) => Promise<{ ok: boolean; data?: R; error?: WelderError }>,
): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  router.on(type, fn as any);
}

// ---------------------------------------------------------------------------
// Slide list state (debounced page-changed emit)
// ---------------------------------------------------------------------------

let lastSlideListSignature = '';
let pendingSlideListTimer: number | null = null;

function buildSlideList(): { summaries: SlideSummary[]; slides: InstanceNode[] } {
  const slides = findSlidesOnCurrentPage();
  const summaries = slides.map(function (slide, i) {
    return buildSlideSummary(slide, i + 1);
  });
  return { summaries, slides };
}

function postPageChanged(summaries: SlideSummary[]): void {
  const msg: Message = {
    type: 'page-changed',
    version: MESSAGE_BUS_VERSION,
    payload: { slides: summaries },
  };
  figma.ui.postMessage(msg);
}

function scheduleSlideListUpdate(): void {
  if (pendingSlideListTimer !== null) {
    clearTimeout(pendingSlideListTimer);
  }
  // @figma-direct: setTimeout — no wrapper for timer in code sandbox.
  pendingSlideListTimer = setTimeout(function () {
    pendingSlideListTimer = null;
    try {
      const list = buildSlideList();
      const sig = buildSlideListSignature(list.summaries);
      if (sig === lastSlideListSignature) return;
      lastSlideListSignature = sig;
      postPageChanged(list.summaries);
    } catch (err: unknown) {
      console.warn('[main] scheduleSlideListUpdate failed:', err);
    }
  }, 200) as unknown as number;
}

// ---------------------------------------------------------------------------
// Slide scan (reads all wrapper models for a slide)
// ---------------------------------------------------------------------------

interface SlideScan {
  general: GeneralSections | null;
  content: ContentItems | null;
  graphs: GraphItems | null;
}

async function scanSlide(slide: InstanceNode): Promise<SlideScan> {
  // --- General tab ---
  const copyWrap = findCopyWrap(slide);
  const badge = findBadge(slide);
  const imageWrap = findImageWrap(slide);

  let general: GeneralSections | null = null;
  if (copyWrap !== null || badge !== null || imageWrap !== null) {
    general = {
      titleDescription: copyWrap !== null ? extractCopyWrap(copyWrap, slide) : null,
      badge: badge !== null ? extractBadge(badge) : null,
      image: imageWrap !== null ? extractImageWrap(imageWrap) : null,
    };
  }

  // --- Content tab ---
  const cardWrap = findCardWrap(slide);
  const timelineWrap = findTimelineWrap(slide);
  const journeySlotNode = findJourneySlot(slide);
  const journeyModel = journeySlotNode !== null ? scanJourneySlotNode(journeySlotNode) : null;

  let content: ContentItems | null = null;
  const cards = cardWrap !== null ? extractCardsFromScope(cardWrap, slide) : [];
  const timelineCards = timelineWrap !== null ? extractCardsFromScope(timelineWrap, slide) : [];
  const timelineItems = timelineWrap !== null ? extractCopyWrapItems(timelineWrap) : [];
  const allCards = [...cards, ...timelineCards];

  if (allCards.length > 0 || timelineItems.length > 0 || journeyModel !== null) {
    const wrapId =
      cardWrap !== null
        ? cardWrap.id
        : timelineWrap !== null
          ? timelineWrap.id
          : journeySlotNode !== null
            ? journeySlotNode.id
            : '';
    content = {
      cardWrapId: wrapId,
      cards: allCards,
      timelineItems: timelineItems,
      journeyModel: journeyModel,
    };
  }

  // --- Graphs tab (table only; no chart per ADR-0007) ---
  const tableSlot = findTableSlot(slide);
  const tableModel = tableSlot !== null ? scanTableSlotNode(tableSlot) : null;

  let graphs: GraphItems | null = null;
  if (tableModel !== null || journeyModel !== null) {
    graphs = {
      tableModel: tableModel ?? null,
      journeyModel: journeyModel ?? null,
    };
  }

  return { general, content, graphs };
}

// ---------------------------------------------------------------------------
// Handler: init
// ---------------------------------------------------------------------------

async function handleInit(): Promise<void> {
  const list = buildSlideList();
  lastSlideListSignature = buildSlideListSignature(list.summaries);

  // Determine initial slide from current canvas selection.
  const selection = figma.currentPage.selection;
  let initialSlideId: string | null = null;
  if (selection.length > 0) {
    const first = selection[0]!;
    if (first.type === 'INSTANCE' && isSlide(first)) {
      initialSlideId = first.id;
    } else {
      const ancestor = findSlideAncestor(first as BaseNode);
      if (ancestor !== null) initialSlideId = ancestor.id;
    }
    if (initialSlideId === null && list.summaries.length > 0) {
      initialSlideId = list.summaries[0]?.id ?? null;
    }
  } else if (list.summaries.length > 0) {
    initialSlideId = list.summaries[0]?.id ?? null;
  }

  const initMsg: Message = {
    type: 'init',
    version: MESSAGE_BUS_VERSION,
    payload: {
      slides: list.summaries,
      initialSlideId,
      // @figma-direct: figma.editorType — no wrapper covers editor type detection.
      editorType: figma.editorType as EditorType,
    },
  };
  figma.ui.postMessage(initMsg);
}

// ---------------------------------------------------------------------------
// Handler: slide-list:request
// ---------------------------------------------------------------------------

handle('slide-list:request', async function (_payload: unknown) {
  const list = buildSlideList();
  const sig = buildSlideListSignature(list.summaries);
  lastSlideListSignature = sig;
  return ok({ slides: list.summaries });
});

// ---------------------------------------------------------------------------
// Handler: slide-load:request
// ---------------------------------------------------------------------------

handle('slide-load:request', async function (payload: unknown) {
  if (!isSlideLoadPayload(payload)) {
    return err('INVALID_INPUT', 'slide-load:request payload missing slideId');
  }

  const node = await withTimeout(
    getNodeByIdSafe(payload.slideId),
    5000,
    'getNodeByIdSafe:slide-load',
  );
  if (node === null) return err('NOT_FOUND', 'Slide not found: ' + payload.slideId);
  if (node.type !== 'INSTANCE' || !isSlide(node)) {
    return err('NODE_TYPE_MISMATCH', 'Node is not a Welder Slide: ' + payload.slideId);
  }

  const scan = await withTimeout(scanSlide(node), 10000, 'scanSlide');

  // Fire-and-forget: image preview bytes sent as separate fire-and-forget message.
  if (
    scan.general !== null &&
    scan.general.image !== null &&
    scan.general.image.imageHash !== null
  ) {
    const imageWrapId = scan.general.image.imageWrapId;
    (async function () {
      try {
        const imageWrapNode = await getNodeByIdSafe(imageWrapId);
        if (imageWrapNode === null || imageWrapNode.type !== 'INSTANCE') return;
        const preview = await getImagePreviewBytes(imageWrapNode as InstanceNode);
        if (preview === null) return;
        // Post image preview as a fire-and-forget message (not in Message union;
        // ui-side handles it as an extension of the message bus).
        figma.ui.postMessage({
          type: 'image-preview',
          version: MESSAGE_BUS_VERSION,
          payload: {
            imageWrapId,
            bytes: preview.bytes,
            fillW: preview.fillW,
            fillH: preview.fillH,
          },
        });
      } catch (_e) {
        // fire-and-forget: ignore errors
      }
    })().catch(function () {});
  }

  // Prime icon cache in background using first card or badge.
  (async function () {
    let targetNode: InstanceNode | null = null;
    if (scan.content !== null && scan.content.cards.length > 0) {
      try {
        const n = await getNodeByIdSafe(scan.content.cards[0]!.cardNodeId);
        if (n !== null && n.type === 'INSTANCE') targetNode = n as InstanceNode;
      } catch (_e) {
        // ignore
      }
    }
    if (targetNode !== null) {
      await primeIconCache(targetNode).catch(function () {});
    }
    figma.ui.postMessage({ type: 'icons-ready', version: MESSAGE_BUS_VERSION });
  })().catch(function () {});

  return ok({
    slideId: node.id,
    general: scan.general,
    content: scan.content,
    graphs: scan.graphs,
  });
});

// ---------------------------------------------------------------------------
// Handler: apply-title-description
// ---------------------------------------------------------------------------

handle('apply-title-description', async function (payload: unknown) {
  if (!isApplyTitleDescriptionPayload(payload)) {
    return err('INVALID_INPUT', 'apply-title-description payload invalid');
  }
  const node = await withTimeout(
    getNodeByIdSafe(payload.copyWrapId),
    5000,
    'getNodeByIdSafe:apply-title-description',
  );
  if (node === null) return err('NOT_FOUND', 'CopyWrap not found: ' + payload.copyWrapId);

  // Walk up to the enclosing slide.
  const slide = findSlideAncestor(node);
  if (slide === null) {
    return err('NOT_FOUND', 'No enclosing Welder Slide for copyWrap: ' + payload.copyWrapId);
  }

  const result = await applyCopyWrap(slide, payload.heading, payload.paragraph);
  if (result === null) return err('NOT_FOUND', 'CopyWrap not found on slide');

  return ok({ copyWrapId: result.copyWrapId });
});

// ---------------------------------------------------------------------------
// Handler: apply-badge
// ---------------------------------------------------------------------------

handle('apply-badge', async function (payload: unknown) {
  if (!isApplyBadgePayload(payload)) {
    return err('INVALID_INPUT', 'apply-badge payload invalid');
  }
  const node = await withTimeout(
    getNodeByIdSafe(payload.badgeNodeId),
    5000,
    'getNodeByIdSafe:apply-badge',
  );
  if (node === null) return err('NOT_FOUND', 'Badge not found: ' + payload.badgeNodeId);

  const slide = findSlideAncestor(node);
  if (slide === null) {
    return err('NOT_FOUND', 'No enclosing Welder Slide for badge: ' + payload.badgeNodeId);
  }

  const result = await applyBadge(slide, payload.label, payload.icon);
  if (result === null) return err('NOT_FOUND', 'Badge not found on slide');

  return ok({ badgeNodeId: result.badgeNodeId });
});

// ---------------------------------------------------------------------------
// Handler: apply-image
// ---------------------------------------------------------------------------

handle('apply-image', async function (payload: unknown) {
  if (!isApplyImagePayload(payload)) {
    return err('INVALID_INPUT', 'apply-image payload invalid');
  }
  const node = await withTimeout(
    getNodeByIdSafe(payload.imageWrapId),
    5000,
    'getNodeByIdSafe:apply-image',
  );
  if (node === null) return err('NOT_FOUND', 'ImageWrap not found: ' + payload.imageWrapId);

  const slide = findSlideAncestor(node);
  if (slide === null) {
    return err('NOT_FOUND', 'No enclosing Welder Slide for imageWrap: ' + payload.imageWrapId);
  }

  const result = await applyImageWrap(slide, payload.bytes);
  if (result === null) return err('MUTATION_FAILED', 'ImageWrap slot not found');

  return ok({ imageWrapId: result.imageWrapId, imageHash: result.imageHash });
});

// ---------------------------------------------------------------------------
// Handler: apply-card
// ---------------------------------------------------------------------------

handle('apply-card', async function (payload: unknown) {
  if (!isApplyCardPayload(payload)) {
    return err('INVALID_INPUT', 'apply-card payload invalid');
  }
  const node = await withTimeout(
    getNodeByIdSafe(payload.cardNodeId),
    5000,
    'getNodeByIdSafe:apply-card',
  );
  if (node === null) return err('NOT_FOUND', 'Card not found: ' + payload.cardNodeId);

  const slide = findSlideAncestor(node);
  if (slide === null) {
    return err('NOT_FOUND', 'No enclosing Welder Slide for card: ' + payload.cardNodeId);
  }

  const result = await applyCard(
    slide,
    payload.cardNodeId,
    payload.heading,
    payload.paragraph,
    payload.icon,
  );
  if (result === null) return err('NOT_FOUND', 'Card not found on slide');

  return ok({ cardNodeId: result.cardNodeId });
});

// ---------------------------------------------------------------------------
// Handler: apply-timeline
// ---------------------------------------------------------------------------

handle('apply-timeline', async function (payload: unknown) {
  if (!isApplyTimelinePayload(payload)) {
    return err('INVALID_INPUT', 'apply-timeline payload invalid');
  }
  const node = await withTimeout(
    getNodeByIdSafe(payload.copyWrapNodeId),
    5000,
    'getNodeByIdSafe:apply-timeline',
  );
  if (node === null) {
    return err('NOT_FOUND', 'Timeline CopyWrap not found: ' + payload.copyWrapNodeId);
  }

  const slide = findSlideAncestor(node);
  if (slide === null) {
    return err('NOT_FOUND', 'No enclosing Welder Slide for CopyWrap: ' + payload.copyWrapNodeId);
  }

  const result = await applyTimeline(
    slide,
    payload.copyWrapNodeId,
    payload.heading,
    payload.paragraph,
  );
  if (result === null) return err('NOT_FOUND', 'Timeline CopyWrap not found on slide');

  return ok({ copyWrapNodeId: result.copyWrapNodeId });
});

// ---------------------------------------------------------------------------
// Handler: apply-table
// ---------------------------------------------------------------------------

handle('apply-table', async function (payload: unknown) {
  if (!isApplyTablePayload(payload)) {
    return err('INVALID_INPUT', 'apply-table payload invalid');
  }
  const node = await withTimeout(
    getNodeByIdSafe(payload.slotId),
    5000,
    'getNodeByIdSafe:apply-table',
  );
  if (node === null) return err('NOT_FOUND', 'Table slot not found: ' + payload.slotId);
  if (node.type !== 'FRAME') {
    return err('NODE_TYPE_MISMATCH', 'Table slot is not a FRAME: ' + payload.slotId);
  }

  try {
    await withTimeout(
      applyTableToSlot(node as FrameNode, payload.desired),
      15000,
      'applyTableToSlot',
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return err('MUTATION_FAILED', 'Table render failed: ' + msg);
  }

  return ok({ slotId: payload.slotId });
});

// ---------------------------------------------------------------------------
// Handler: apply-journey
// ---------------------------------------------------------------------------

handle('apply-journey', async function (payload: unknown) {
  if (!isApplyJourneyPayload(payload)) {
    return err('INVALID_INPUT', 'apply-journey payload invalid');
  }
  const node = await withTimeout(
    getNodeByIdSafe(payload.slotId),
    5000,
    'getNodeByIdSafe:apply-journey',
  );
  if (node === null) return err('NOT_FOUND', 'Journey slot not found: ' + payload.slotId);
  if (node.type !== 'FRAME') {
    return err('NODE_TYPE_MISMATCH', 'Journey slot is not a FRAME: ' + payload.slotId);
  }

  try {
    await withTimeout(
      applyJourneyToSlot(node as FrameNode, payload.desired),
      20000,
      'applyJourneyToSlot',
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return err('MUTATION_FAILED', 'Journey render failed: ' + msg);
  }

  return ok({ slotId: payload.slotId });
});

// ---------------------------------------------------------------------------
// Handler: image-upload:request (fetch bytes for existing image)
// ---------------------------------------------------------------------------

handle('image-upload:request', async function (payload: unknown) {
  if (!isImageUploadRequestPayload(payload)) {
    return err('INVALID_INPUT', 'image-upload:request payload invalid');
  }
  const node = await withTimeout(
    getNodeByIdSafe(payload.imageWrapId),
    5000,
    'getNodeByIdSafe:image-upload',
  );
  if (node === null || node.type !== 'INSTANCE') {
    return err('NOT_FOUND', 'ImageWrap not found: ' + payload.imageWrapId);
  }

  const preview = await withTimeout(
    getImagePreviewBytes(node as InstanceNode),
    10000,
    'getImagePreviewBytes',
  );
  if (preview === null) {
    return err('NOT_FOUND', 'No image fill in ImageWrap: ' + payload.imageWrapId);
  }

  return ok({
    imageWrapId: payload.imageWrapId,
    bytes: preview.bytes,
    fillW: preview.fillW,
    fillH: preview.fillH,
  });
});

// ---------------------------------------------------------------------------
// Handler: persisted-state:get
// ---------------------------------------------------------------------------

handle('persisted-state:get', async function (payload: unknown) {
  if (!isPersistedStateGetPayload(payload)) {
    return err('INVALID_INPUT', 'persisted-state:get payload invalid');
  }
  const value = await getClientState(payload.key, function (_u): _u is unknown {
    return true;
  });
  return ok({ key: payload.key, value: value });
});

// ---------------------------------------------------------------------------
// Handler: persisted-state:set
// ---------------------------------------------------------------------------

handle('persisted-state:set', async function (payload: unknown) {
  if (!isPersistedStateSetPayload(payload)) {
    return err('INVALID_INPUT', 'persisted-state:set payload invalid');
  }
  await setClientState(payload.key, payload.value);
  return ok({ key: payload.key });
});

// ---------------------------------------------------------------------------
// Handler: close
// ---------------------------------------------------------------------------

handle('close', async function (_payload: unknown) {
  figma.closePlugin();
  return ok({});
});

// ---------------------------------------------------------------------------
// Hand-rolled payload guards (no Zod — ADR-0003 §A)
// ---------------------------------------------------------------------------

function isSlideLoadPayload(u: unknown): u is { slideId: string } {
  return (
    typeof u === 'object' &&
    u !== null &&
    typeof (u as Record<string, unknown>).slideId === 'string'
  );
}

function isApplyTitleDescriptionPayload(
  u: unknown,
): u is { copyWrapId: string; heading?: string; paragraph?: string } {
  if (typeof u !== 'object' || u === null) return false;
  const o = u as Record<string, unknown>;
  if (typeof o.copyWrapId !== 'string') return false;
  if (o.heading !== undefined && typeof o.heading !== 'string') return false;
  if (o.paragraph !== undefined && typeof o.paragraph !== 'string') return false;
  return true;
}

function isApplyBadgePayload(
  u: unknown,
): u is { badgeNodeId: string; label?: string; icon?: string } {
  if (typeof u !== 'object' || u === null) return false;
  const o = u as Record<string, unknown>;
  if (typeof o.badgeNodeId !== 'string') return false;
  if (o.label !== undefined && typeof o.label !== 'string') return false;
  if (o.icon !== undefined && typeof o.icon !== 'string') return false;
  return true;
}

function isApplyImagePayload(u: unknown): u is { imageWrapId: string; bytes: Uint8Array } {
  if (typeof u !== 'object' || u === null) return false;
  const o = u as Record<string, unknown>;
  if (typeof o.imageWrapId !== 'string') return false;
  if (!(o.bytes instanceof Uint8Array)) return false;
  return true;
}

function isApplyCardPayload(u: unknown): u is {
  cardNodeId: string;
  heading?: string;
  paragraph?: string;
  icon?: string;
} {
  if (typeof u !== 'object' || u === null) return false;
  const o = u as Record<string, unknown>;
  if (typeof o.cardNodeId !== 'string') return false;
  if (o.heading !== undefined && typeof o.heading !== 'string') return false;
  if (o.paragraph !== undefined && typeof o.paragraph !== 'string') return false;
  if (o.icon !== undefined && typeof o.icon !== 'string') return false;
  return true;
}

function isApplyTimelinePayload(u: unknown): u is {
  copyWrapNodeId: string;
  heading?: string;
  paragraph?: string;
} {
  if (typeof u !== 'object' || u === null) return false;
  const o = u as Record<string, unknown>;
  if (typeof o.copyWrapNodeId !== 'string') return false;
  if (o.heading !== undefined && typeof o.heading !== 'string') return false;
  if (o.paragraph !== undefined && typeof o.paragraph !== 'string') return false;
  return true;
}

function isApplyTablePayload(u: unknown): u is { slotId: string; desired: TableWrapModel } {
  if (typeof u !== 'object' || u === null) return false;
  const o = u as Record<string, unknown>;
  if (typeof o.slotId !== 'string') return false;
  if (typeof o.desired !== 'object' || o.desired === null) return false;
  const d = o.desired as Record<string, unknown>;
  if (typeof d.slotId !== 'string') return false;
  if (!Array.isArray(d.rows)) return false;
  return true;
}

function isApplyJourneyPayload(u: unknown): u is { slotId: string; desired: JourneyWrapModel } {
  if (typeof u !== 'object' || u === null) return false;
  const o = u as Record<string, unknown>;
  if (typeof o.slotId !== 'string') return false;
  if (typeof o.desired !== 'object' || o.desired === null) return false;
  const d = o.desired as Record<string, unknown>;
  if (typeof d.slotId !== 'string') return false;
  if (!Array.isArray(d.items)) return false;
  if (!Array.isArray(d.columns)) return false;
  return true;
}

function isImageUploadRequestPayload(u: unknown): u is { imageWrapId: string } {
  if (typeof u !== 'object' || u === null) return false;
  return typeof (u as Record<string, unknown>).imageWrapId === 'string';
}

function isPersistedStateGetPayload(u: unknown): u is { key: string } {
  if (typeof u !== 'object' || u === null) return false;
  return typeof (u as Record<string, unknown>).key === 'string';
}

function isPersistedStateSetPayload(u: unknown): u is { key: string; value: unknown } {
  if (typeof u !== 'object' || u === null) return false;
  const o = u as Record<string, unknown>;
  return typeof o.key === 'string' && Object.prototype.hasOwnProperty.call(o, 'value');
}

// ---------------------------------------------------------------------------
// Bootstrap / main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  // ADR-0002: guard against unsupported editor types.
  const editorType = figma.editorType;
  if (editorType !== 'figma' && editorType !== 'slides') {
    figma.notify('Welder Editor is not available in ' + String(editorType) + ' editor.', {
      error: true,
    });
    figma.closePlugin();
    return;
  }

  // Show UI per api-spec brief.
  // @figma-direct: figma.showUI — no wrapper covers showUI.
  figma.showUI(__html__, { width: 520, height: 760, themeColors: true });

  // ADR-0005 / Wave 1 handoff: pre-warm named variables before first handler dispatch.
  const vars = await loadNamedVariables(WELDER_VARIABLE_KEYS);
  const textVar = vars.text ?? null;
  const dimmerVar = vars.dimmer ?? null;
  // Share resolved variables with TableWrap module.
  setTableVariables(textVar, dimmerVar);

  // Wire message-bus router.
  // The router handles version checking and dispatches to registered handlers.
  figma.ui.onmessage = async function (raw: unknown) {
    const msg = raw as { type: string; version: number; payload?: unknown; correlationId?: string };

    // Handle init separately — it's a fire-and-forget send, not a router dispatch.
    if (msg.type === 'ui-ready' || msg.type === undefined) {
      await handleInit();
      return;
    }

    // Delegate to router for all other messages.
    await router.handle(msg as Parameters<typeof router.handle>[0]);
  };

  // Selection-change listener — emit selection-changed to ui.
  const unsubSelection = onSelectionChange(function () {
    try {
      const selectedNodeIds = figma.currentPage.selection.map(function (n) {
        return n.id;
      });
      const msg: Message = {
        type: 'selection-changed',
        version: MESSAGE_BUS_VERSION,
        payload: { selectedNodeIds },
      };
      figma.ui.postMessage(msg);
    } catch (e: unknown) {
      console.warn('[main] selectionchange handler failed:', e);
    }
  });

  // Page-change listener.
  // @figma-direct: figma.on('currentpagechange') — no wrapper for page change events.
  figma.on('currentpagechange', function () {
    try {
      scheduleSlideListUpdate();
    } catch (e: unknown) {
      console.warn('[main] currentpagechange handler failed:', e);
    }
  });

  // Document-change listener (slide add/remove/property changes).
  try {
    // @figma-direct: figma.on('documentchange') — no wrapper covers document events.
    figma.on('documentchange', function (event: DocumentChangeEvent) {
      try {
        const relevant = event.documentChanges.some(function (change) {
          if (change.type === 'CREATE') return true;
          if (change.type === 'DELETE') return true;
          if (change.type === 'PROPERTY_CHANGE' && change.node.type === 'SLIDE') return true;
          return false;
        });
        if (!relevant) return;
        scheduleSlideListUpdate();
      } catch (e: unknown) {
        console.warn('[main] documentchange handler failed:', e);
      }
    });
  } catch (e: unknown) {
    // documentchange may not be available in dynamic-page mode without loadAllPagesAsync.
    console.warn('[main] documentchange registration skipped:', e);
  }

  // Close listener — cleanup timers.
  // @figma-direct: figma.on('close') — no wrapper.
  figma.on('close', function () {
    if (pendingSlideListTimer !== null) {
      clearTimeout(pendingSlideListTimer);
      pendingSlideListTimer = null;
    }
    unsubSelection();
  });
}

main().catch(function (e: unknown) {
  const text = e instanceof Error ? e.message : String(e);
  figma.notify('Welder Editor failed to start: ' + text, { error: true });
  figma.closePlugin();
});
