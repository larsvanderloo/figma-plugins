// plugins/welder-editor/ui/composables/useEditorActions.ts
//
// Per-feature dispatch composable. Wraps each apply-X send with:
//   1. Optimistic state write (≤ 16 ms, immediate UI feedback).
//   2. Message-bus dispatch via usePluginBridge.
//   3. Result handling: on ok=true, update lastKnownAt; on ok=false, rollback.
//
// This file is ONE of TWO allowed mutation sites (ADR-0010 §3.1).
// Sections import from useEditorActions — they never import useEditorStore
// for write operations.
//
// Optimistic-UI contract (ADR-0010 §3.3):
//   a. captureSnapshot() → before dispatch, save current slice state.
//   b. optimisticallyApply() → write expected new state immediately.
//   c. dispatch via postAndWait().
//   d. On result.ok === true  → update store via applyEditorResult().
//   e. On result.ok === false → rollbackFromSnapshot() + expose error to section.
//
// correlationId: sections pass their own UUID-v4 so the message-bus router
// can match the request. The composable does not generate IDs — the section
// generates them so it can track its own in-flight state if needed.
//
// Usage (from a section):
//   const { applyTitleDescription, applyBadge, loadSlideList, ... } = useEditorActions();
//   const result = await applyTitleDescription({ copyWrapId, heading: 'New title' });

import type {
  Message,
  SlideSummary,
  GeneralSections,
  ContentItems,
  GraphItems,
  NodeId,
  CorrelationId,
  Result,
  TableWrapModel,
  JourneyWrapModel,
} from '@shared/messages.js';
import { MESSAGE_BUS_VERSION } from '@shared/messages.js';
import { useEditorStore } from '../stores/useEditorStore.js';
import { usePluginBridge } from './usePluginBridge.js';

// ---------------------------------------------------------------------------
// Re-exported for convenience (sections use this type for action return values)
// ---------------------------------------------------------------------------

export type ActionResult<T> = Result<T>;

// ---------------------------------------------------------------------------
// Internal helper: generate a correlationId when the caller does not supply one
// ---------------------------------------------------------------------------

function newCorrelationId(): CorrelationId {
  // crypto.randomUUID() is available in all modern browsers and Node 19+.
  // Figma's iframe sandbox supports it.
  return crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// Composable
// ---------------------------------------------------------------------------

export function useEditorActions() {
  const store = useEditorStore();
  const bridge = usePluginBridge();

  // -------------------------------------------------------------------------
  // loadSlideList
  //
  // Requests the current slide list. Called on plugin init and after
  // page-changed. Not optimistic — there is no prior state to show.
  // -------------------------------------------------------------------------

  async function loadSlideList(
    fileKey: string,
    correlationId: CorrelationId = newCorrelationId(),
  ): Promise<Result<{ slides: SlideSummary[] }>> {
    store.recordPendingRequest(correlationId, 'slide-list');

    const msg: Extract<Message, { type: 'slide-list:request' }> = {
      type: 'slide-list:request',
      version: MESSAGE_BUS_VERSION,
      payload: {},
      correlationId,
    };

    const result = await bridge.postAndWait<Extract<Message, { type: 'slide-list:result' }>>(msg);

    store.applySlideListResult(result.payload, fileKey);
    return result.payload;
  }

  // -------------------------------------------------------------------------
  // loadSlide
  //
  // Requests full wrapper data for a specific slide. Sets activeSlideId
  // optimistically (the section knows which slide was picked).
  // -------------------------------------------------------------------------

  async function loadSlide(
    slideId: NodeId,
    correlationId: CorrelationId = newCorrelationId(),
  ): Promise<
    Result<{
      slideId: NodeId;
      general: GeneralSections | null;
      content: ContentItems | null;
      graphs: GraphItems | null;
    }>
  > {
    store.setActiveSlide(slideId);
    store.recordPendingRequest(correlationId, 'slide-load');

    const msg: Extract<Message, { type: 'slide-load:request' }> = {
      type: 'slide-load:request',
      version: MESSAGE_BUS_VERSION,
      payload: { slideId },
      correlationId,
    };

    const result = await bridge.postAndWait<Extract<Message, { type: 'slide-load:result' }>>(msg);

    store.applySlideLoadResult(result.payload);
    return result.payload;
  }

  // -------------------------------------------------------------------------
  // applyTitleDescription
  //
  // Optimistic: the section provides the expected new values, which are
  // written immediately. On failure, the prior snapshot is restored.
  // -------------------------------------------------------------------------

  async function applyTitleDescription(params: {
    copyWrapId: NodeId;
    heading?: string;
    paragraph?: string;
    correlationId?: CorrelationId;
  }): Promise<Result<{ copyWrapId: NodeId }>> {
    const { copyWrapId, heading, paragraph, correlationId = newCorrelationId() } = params;

    const snapshot = store.captureSnapshot();

    // Optimistic write: patch the general slice immediately.
    if (store.general !== null && store.general.titleDescription !== null) {
      store.optimisticallyApply('general', {
        titleDescription: {
          ...store.general.titleDescription,
          ...(heading !== undefined ? { heading } : {}),
          ...(paragraph !== undefined ? { paragraph } : {}),
        },
      } satisfies Partial<GeneralSections>);
    }

    store.recordPendingRequest(correlationId, 'general');

    const msg: Extract<Message, { type: 'apply-title-description' }> = {
      type: 'apply-title-description',
      version: MESSAGE_BUS_VERSION,
      payload: {
        copyWrapId,
        ...(heading !== undefined ? { heading } : {}),
        ...(paragraph !== undefined ? { paragraph } : {}),
      },
      correlationId,
    };

    const result =
      await bridge.postAndWait<Extract<Message, { type: 'apply-title-description:result' }>>(msg);

    if (!result.payload.ok) {
      store.rollbackFromSnapshot(snapshot);
    } else {
      store.applyEditorResult('general', { ok: true, data: store.general as GeneralSections });
    }

    return result.payload;
  }

  // -------------------------------------------------------------------------
  // applyBadge
  //
  // Optimistic: badge label and/or icon updated immediately.
  // -------------------------------------------------------------------------

  async function applyBadge(params: {
    badgeNodeId: NodeId;
    label?: string;
    icon?: string;
    correlationId?: CorrelationId;
  }): Promise<Result<{ badgeNodeId: NodeId }>> {
    const { badgeNodeId, label, icon, correlationId = newCorrelationId() } = params;

    const snapshot = store.captureSnapshot();

    if (store.general !== null && store.general.badge !== null) {
      store.optimisticallyApply('general', {
        badge: {
          ...store.general.badge,
          ...(label !== undefined ? { label } : {}),
          ...(icon !== undefined ? { icon } : {}),
        },
      } satisfies Partial<GeneralSections>);
    }

    store.recordPendingRequest(correlationId, 'general');

    const msg: Extract<Message, { type: 'apply-badge' }> = {
      type: 'apply-badge',
      version: MESSAGE_BUS_VERSION,
      payload: {
        badgeNodeId,
        ...(label !== undefined ? { label } : {}),
        ...(icon !== undefined ? { icon } : {}),
      },
      correlationId,
    };

    const result = await bridge.postAndWait<Extract<Message, { type: 'apply-badge:result' }>>(msg);

    if (!result.payload.ok) {
      store.rollbackFromSnapshot(snapshot);
    } else {
      store.applyEditorResult('general', { ok: true, data: store.general as GeneralSections });
    }

    return result.payload;
  }

  // -------------------------------------------------------------------------
  // applyImage
  //
  // No optimistic write for image — the bytes are large and the result returns
  // the new imageHash. The loading state in the section is sufficient UX.
  // -------------------------------------------------------------------------

  async function applyImage(params: {
    imageWrapId: NodeId;
    bytes: Uint8Array;
    correlationId?: CorrelationId;
  }): Promise<Result<{ imageWrapId: NodeId; imageHash: string }>> {
    const { imageWrapId, bytes, correlationId = newCorrelationId() } = params;

    store.recordPendingRequest(correlationId, 'general');

    const msg: Extract<Message, { type: 'apply-image' }> = {
      type: 'apply-image',
      version: MESSAGE_BUS_VERSION,
      payload: { imageWrapId, bytes },
      correlationId,
    };

    const result = await bridge.postAndWait<Extract<Message, { type: 'apply-image:result' }>>(msg);

    if (result.payload.ok && store.general !== null && store.general.image !== null) {
      store.optimisticallyApply('general', {
        image: {
          ...store.general.image,
          imageHash: result.payload.data.imageHash,
        },
      } satisfies Partial<GeneralSections>);
      store.applyEditorResult('general', { ok: true, data: store.general as GeneralSections });
    }

    return result.payload;
  }

  // -------------------------------------------------------------------------
  // applyCard
  //
  // Optimistic: updates the target card by cardNodeId within content.cards.
  // -------------------------------------------------------------------------

  async function applyCard(params: {
    cardNodeId: NodeId;
    heading?: string;
    paragraph?: string;
    icon?: string;
    correlationId?: CorrelationId;
  }): Promise<Result<{ cardNodeId: NodeId }>> {
    const { cardNodeId, heading, paragraph, icon, correlationId = newCorrelationId() } = params;

    const snapshot = store.captureSnapshot();

    if (store.content !== null) {
      store.optimisticallyApply('content', {
        cards: store.content.cards.map((card) =>
          card.cardNodeId === cardNodeId
            ? {
                ...card,
                ...(heading !== undefined ? { heading } : {}),
                ...(paragraph !== undefined ? { paragraph } : {}),
                ...(icon !== undefined ? { icon } : {}),
              }
            : card,
        ),
      } satisfies Partial<ContentItems>);
    }

    store.recordPendingRequest(correlationId, 'content');

    const msg: Extract<Message, { type: 'apply-card' }> = {
      type: 'apply-card',
      version: MESSAGE_BUS_VERSION,
      payload: {
        cardNodeId,
        ...(heading !== undefined ? { heading } : {}),
        ...(paragraph !== undefined ? { paragraph } : {}),
        ...(icon !== undefined ? { icon } : {}),
      },
      correlationId,
    };

    const result = await bridge.postAndWait<Extract<Message, { type: 'apply-card:result' }>>(msg);

    if (!result.payload.ok) {
      store.rollbackFromSnapshot(snapshot);
    } else {
      store.applyEditorResult('content', { ok: true, data: store.content as ContentItems });
    }

    return result.payload;
  }

  // -------------------------------------------------------------------------
  // applyTimeline
  //
  // Optimistic: updates the target timeline item by copyWrapNodeId.
  // -------------------------------------------------------------------------

  async function applyTimeline(params: {
    copyWrapNodeId: NodeId;
    heading?: string;
    paragraph?: string;
    correlationId?: CorrelationId;
  }): Promise<Result<{ copyWrapNodeId: NodeId }>> {
    const { copyWrapNodeId, heading, paragraph, correlationId = newCorrelationId() } = params;

    const snapshot = store.captureSnapshot();

    if (store.content !== null) {
      store.optimisticallyApply('content', {
        timelineItems: store.content.timelineItems.map((item) =>
          item.copyWrapNodeId === copyWrapNodeId
            ? {
                ...item,
                ...(heading !== undefined ? { heading } : {}),
                ...(paragraph !== undefined ? { paragraph } : {}),
              }
            : item,
        ),
      } satisfies Partial<ContentItems>);
    }

    store.recordPendingRequest(correlationId, 'content');

    const msg: Extract<Message, { type: 'apply-timeline' }> = {
      type: 'apply-timeline',
      version: MESSAGE_BUS_VERSION,
      payload: {
        copyWrapNodeId,
        ...(heading !== undefined ? { heading } : {}),
        ...(paragraph !== undefined ? { paragraph } : {}),
      },
      correlationId,
    };

    const result =
      await bridge.postAndWait<Extract<Message, { type: 'apply-timeline:result' }>>(msg);

    if (!result.payload.ok) {
      store.rollbackFromSnapshot(snapshot);
    } else {
      store.applyEditorResult('content', { ok: true, data: store.content as ContentItems });
    }

    return result.payload;
  }

  // -------------------------------------------------------------------------
  // applyTable
  //
  // Full-state PUT. No partial optimistic write — replaces the whole model.
  // -------------------------------------------------------------------------

  async function applyTable(params: {
    slotId: NodeId;
    desired: TableWrapModel;
    correlationId?: CorrelationId;
  }): Promise<Result<{ slotId: NodeId }>> {
    const { slotId, desired, correlationId = newCorrelationId() } = params;

    const snapshot = store.captureSnapshot();

    if (store.graphs !== null) {
      store.optimisticallyApply('graphs', {
        tableModel: desired,
      } satisfies Partial<GraphItems>);
    }

    store.recordPendingRequest(correlationId, 'graphs');

    const msg: Extract<Message, { type: 'apply-table' }> = {
      type: 'apply-table',
      version: MESSAGE_BUS_VERSION,
      payload: { slotId, desired },
      correlationId,
    };

    const result = await bridge.postAndWait<Extract<Message, { type: 'apply-table:result' }>>(msg);

    if (!result.payload.ok) {
      store.rollbackFromSnapshot(snapshot);
    } else {
      store.applyEditorResult('graphs', { ok: true, data: store.graphs as GraphItems });
    }

    return result.payload;
  }

  // -------------------------------------------------------------------------
  // applyJourney
  //
  // Full-state PUT. No partial optimistic write — replaces the whole model.
  // -------------------------------------------------------------------------

  async function applyJourney(params: {
    slotId: NodeId;
    desired: JourneyWrapModel;
    correlationId?: CorrelationId;
  }): Promise<Result<{ slotId: NodeId }>> {
    const { slotId, desired, correlationId = newCorrelationId() } = params;

    const snapshot = store.captureSnapshot();

    if (store.graphs !== null) {
      store.optimisticallyApply('graphs', {
        journeyModel: desired,
      } satisfies Partial<GraphItems>);
    }

    store.recordPendingRequest(correlationId, 'graphs');

    const msg: Extract<Message, { type: 'apply-journey' }> = {
      type: 'apply-journey',
      version: MESSAGE_BUS_VERSION,
      payload: { slotId, desired },
      correlationId,
    };

    const result =
      await bridge.postAndWait<Extract<Message, { type: 'apply-journey:result' }>>(msg);

    if (!result.payload.ok) {
      store.rollbackFromSnapshot(snapshot);
    } else {
      store.applyEditorResult('graphs', { ok: true, data: store.graphs as GraphItems });
    }

    return result.payload;
  }

  // -------------------------------------------------------------------------
  // Return all actions
  // -------------------------------------------------------------------------

  return {
    loadSlideList,
    loadSlide,
    applyTitleDescription,
    applyBadge,
    applyImage,
    applyCard,
    applyTimeline,
    applyTable,
    applyJourney,
  };
}
