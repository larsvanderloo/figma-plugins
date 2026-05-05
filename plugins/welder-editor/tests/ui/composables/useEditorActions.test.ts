// tests/ui/composables/useEditorActions.test.ts
//
// Tests for useEditorActions: optimistic-UI flow and rollback on failure.
//
// usePluginBridge is mocked at the module level (vi.mock). The mock provides
// a controllable `postAndWait` that resolves with fixtures we supply per test.
//
// Tests cover:
//   1. applyTitleDescription — optimistic write, success path
//   2. applyTitleDescription — rollback on ok=false
//   3. applyBadge — optimistic write, success path
//   4. applyBadge — rollback on ok=false
//   5. applyCard — optimistic write per cardNodeId, success path
//   6. applyCard — rollback on ok=false
//   7. loadSlideList — records pending request, applies result
//   8. loadSlide — sets active slide, applies result

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useEditorStore } from '../../../ui/stores/useEditorStore.js';
import { useEditorActions } from '../../../ui/composables/useEditorActions.js';
import type { GeneralSections, ContentItems } from '../../../shared/messages.js';

// ---------------------------------------------------------------------------
// Mock usePluginBridge
// ---------------------------------------------------------------------------

// We need to control postAndWait's resolved value per test. Use a vi.fn() that
// callers can configure per test via mockResolvedValueOnce.
const mockPostAndWait = vi.fn();
const mockPost = vi.fn();
const mockOnMessage = vi.fn().mockReturnValue(() => {});

vi.mock('../../../ui/composables/usePluginBridge.js', () => ({
  usePluginBridge: () => ({
    post: mockPost,
    postAndWait: mockPostAndWait,
    onMessage: mockOnMessage,
  }),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const GENERAL_INITIAL: GeneralSections = {
  titleDescription: {
    copyWrapId: 'cwrap-1',
    heading: 'Old heading',
    paragraph: 'Old paragraph',
    headingDim: [],
  },
  badge: {
    badgeNodeId: 'badge-1',
    label: 'Old label',
    icon: 'star',
  },
  image: null,
};

const CONTENT_INITIAL: ContentItems = {
  cardWrapId: 'cwrap-2',
  cards: [
    {
      cardNodeId: 'card-1',
      heading: 'Old card heading',
      paragraph: 'Old card paragraph',
      icon: null,
      visualHash: null,
    },
  ],
  timelineItems: [],
  journeyModel: null,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useEditorActions', () => {
  let store: ReturnType<typeof useEditorStore>;

  beforeEach(() => {
    store = useEditorStore();
    // Reset mocks between tests
    mockPostAndWait.mockReset();
    mockPost.mockReset();

    // Prime the store with initial data so optimistic writes have something to merge into.
    // IMPORTANT: setActiveSlide clears general/content/graphs, so we must set the
    // active slide ID first, then write the data slices via applyEditorResult.
    store.setActiveSlide('node-1');
    store.applyEditorResult('general', { ok: true, data: GENERAL_INITIAL });
    store.applyEditorResult('content', { ok: true, data: CONTENT_INITIAL });
  });

  // ---- 1. applyTitleDescription: success ----

  describe('applyTitleDescription', () => {
    it('writes new heading optimistically before the await resolves', async () => {
      // postAndWait resolves after we check — use a deferred promise
      let resolveResult!: (v: unknown) => void;
      const deferred = new Promise((res) => {
        resolveResult = res;
      });
      mockPostAndWait.mockReturnValueOnce(deferred);

      const actionPromise = useEditorActions().applyTitleDescription({
        copyWrapId: 'cwrap-1',
        heading: 'New heading',
      });

      // Before resolution: optimistic write should be visible
      expect(store.general?.titleDescription?.heading).toBe('New heading');

      // Resolve with success
      resolveResult({
        type: 'apply-title-description:result',
        version: 1,
        payload: { ok: true, data: { copyWrapId: 'cwrap-1' } },
        correlationId: 'any',
      });

      const result = await actionPromise;
      expect(result.ok).toBe(true);
      // heading stays at new value
      expect(store.general?.titleDescription?.heading).toBe('New heading');
    });

    it('preserves other general slice fields during optimistic write', async () => {
      mockPostAndWait.mockResolvedValueOnce({
        type: 'apply-title-description:result',
        version: 1,
        payload: { ok: true, data: { copyWrapId: 'cwrap-1' } },
        correlationId: 'any',
      });

      await useEditorActions().applyTitleDescription({
        copyWrapId: 'cwrap-1',
        heading: 'New heading',
      });

      // Badge should not be touched
      expect(store.general?.badge?.label).toBe('Old label');
    });

    it('rolls back heading on ok=false result', async () => {
      mockPostAndWait.mockResolvedValueOnce({
        type: 'apply-title-description:result',
        version: 1,
        payload: { ok: false, error: { code: 'MUTATION_FAILED', message: 'Canvas locked' } },
        correlationId: 'any',
      });

      const result = await useEditorActions().applyTitleDescription({
        copyWrapId: 'cwrap-1',
        heading: 'New heading',
      });

      expect(result.ok).toBe(false);
      // Heading rolled back to prior value
      expect(store.general?.titleDescription?.heading).toBe('Old heading');
    });
  });

  // ---- 2. applyBadge ----

  describe('applyBadge', () => {
    it('optimistically updates badge label', async () => {
      let resolveResult!: (v: unknown) => void;
      const deferred = new Promise((res) => {
        resolveResult = res;
      });
      mockPostAndWait.mockReturnValueOnce(deferred);

      const actionPromise = useEditorActions().applyBadge({
        badgeNodeId: 'badge-1',
        label: 'New label',
      });

      expect(store.general?.badge?.label).toBe('New label');

      resolveResult({
        type: 'apply-badge:result',
        version: 1,
        payload: { ok: true, data: { badgeNodeId: 'badge-1' } },
        correlationId: 'any',
      });

      const result = await actionPromise;
      expect(result.ok).toBe(true);
    });

    it('rolls back badge label on ok=false result', async () => {
      mockPostAndWait.mockResolvedValueOnce({
        type: 'apply-badge:result',
        version: 1,
        payload: { ok: false, error: { code: 'NOT_FOUND', message: 'Badge gone' } },
        correlationId: 'any',
      });

      await useEditorActions().applyBadge({ badgeNodeId: 'badge-1', label: 'New label' });
      expect(store.general?.badge?.label).toBe('Old label');
    });
  });

  // ---- 3. applyCard ----

  describe('applyCard', () => {
    it('optimistically updates the matching card by cardNodeId', async () => {
      let resolveResult!: (v: unknown) => void;
      const deferred = new Promise((res) => {
        resolveResult = res;
      });
      mockPostAndWait.mockReturnValueOnce(deferred);

      const actionPromise = useEditorActions().applyCard({
        cardNodeId: 'card-1',
        heading: 'New card heading',
      });

      expect(store.content?.cards[0]?.heading).toBe('New card heading');

      resolveResult({
        type: 'apply-card:result',
        version: 1,
        payload: { ok: true, data: { cardNodeId: 'card-1' } },
        correlationId: 'any',
      });

      const result = await actionPromise;
      expect(result.ok).toBe(true);
    });

    it('does not touch other cards during optimistic update', async () => {
      // Add a second card
      const twoCards: ContentItems = {
        ...CONTENT_INITIAL,
        cards: [
          ...CONTENT_INITIAL.cards,
          {
            cardNodeId: 'card-2',
            heading: 'Card 2',
            paragraph: 'Para 2',
            icon: null,
            visualHash: null,
          },
        ],
      };
      store.applyEditorResult('content', { ok: true, data: twoCards });

      mockPostAndWait.mockResolvedValueOnce({
        type: 'apply-card:result',
        version: 1,
        payload: { ok: true, data: { cardNodeId: 'card-1' } },
        correlationId: 'any',
      });

      await useEditorActions().applyCard({ cardNodeId: 'card-1', heading: 'Changed' });

      expect(store.content?.cards[0]?.heading).toBe('Changed');
      expect(store.content?.cards[1]?.heading).toBe('Card 2'); // untouched
    });

    it('rolls back card heading on ok=false result', async () => {
      mockPostAndWait.mockResolvedValueOnce({
        type: 'apply-card:result',
        version: 1,
        payload: { ok: false, error: { code: 'NODE_TYPE_MISMATCH', message: 'wrong type' } },
        correlationId: 'any',
      });

      await useEditorActions().applyCard({ cardNodeId: 'card-1', heading: 'New card heading' });
      expect(store.content?.cards[0]?.heading).toBe('Old card heading');
    });
  });

  // ---- 4. loadSlideList ----

  describe('loadSlideList', () => {
    it('records a pending request before dispatch', async () => {
      mockPostAndWait.mockResolvedValueOnce({
        type: 'slide-list:result',
        version: 1,
        payload: { ok: true, data: { slides: [] } },
        correlationId: 'corr-list',
      });

      const promise = useEditorActions().loadSlideList('file-abc', 'corr-list');
      // inFlight should be set synchronously before the await
      expect(store.sync.inFlightRequestId).toBe('corr-list');
      await promise;
    });

    it('populates slides on success', async () => {
      mockPostAndWait.mockResolvedValueOnce({
        type: 'slide-list:result',
        version: 1,
        payload: {
          ok: true,
          data: {
            slides: [{ id: 'n1', number: 1, name: 'Slide 1', isSkipped: false }],
          },
        },
        correlationId: 'corr-list',
      });

      await useEditorActions().loadSlideList('file-abc');
      expect(store.slides).toHaveLength(1);
      expect(store.sync.fileKey).toBe('file-abc');
    });
  });

  // ---- 5. loadSlide ----

  describe('loadSlide', () => {
    it('sets activeSlideId immediately (optimistic selection)', async () => {
      mockPostAndWait.mockResolvedValueOnce({
        type: 'slide-load:result',
        version: 1,
        payload: {
          ok: true,
          data: { slideId: 'node-5', general: null, content: null, graphs: null },
        },
        correlationId: 'corr-load',
      });

      const promise = useEditorActions().loadSlide('node-5', 'corr-load');
      expect(store.activeSlideId).toBe('node-5');
      await promise;
    });

    it('writes general/content/graphs on success', async () => {
      store.setActiveSlide('node-1');
      mockPostAndWait.mockResolvedValueOnce({
        type: 'slide-load:result',
        version: 1,
        payload: {
          ok: true,
          data: {
            slideId: 'node-1',
            general: GENERAL_INITIAL,
            content: CONTENT_INITIAL,
            graphs: null,
          },
        },
        correlationId: 'corr-load',
      });

      await useEditorActions().loadSlide('node-1', 'corr-load');
      expect(store.general).toEqual(GENERAL_INITIAL);
      expect(store.content).toEqual(CONTENT_INITIAL);
    });
  });

  // ---- 6. recordPendingRequest cleared after action ----

  describe('inFlightRequestId lifecycle', () => {
    it('inFlightRequestId is null after a successful applyTitleDescription', async () => {
      mockPostAndWait.mockResolvedValueOnce({
        type: 'apply-title-description:result',
        version: 1,
        payload: { ok: true, data: { copyWrapId: 'cwrap-1' } },
        correlationId: 'corr-td',
      });

      await useEditorActions().applyTitleDescription({
        copyWrapId: 'cwrap-1',
        heading: 'x',
        correlationId: 'corr-td',
      });

      expect(store.sync.inFlightRequestId).toBeNull();
    });

    it('inFlightRequestId is null after a failed applyBadge (rollback clears it)', async () => {
      mockPostAndWait.mockResolvedValueOnce({
        type: 'apply-badge:result',
        version: 1,
        payload: { ok: false, error: { code: 'UNEXPECTED', message: 'err' } },
        correlationId: 'corr-badge',
      });

      await useEditorActions().applyBadge({
        badgeNodeId: 'badge-1',
        label: 'x',
        correlationId: 'corr-badge',
      });

      expect(store.sync.inFlightRequestId).toBeNull();
    });
  });
});
