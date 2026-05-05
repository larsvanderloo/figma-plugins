// tests/ui/stores/useEditorStore.test.ts
//
// Unit tests for useEditorStore actions, persistence shape, and reconciliation.
//
// Pinia is bootstrapped per-test via tests/setup.ts (setActivePinia in beforeEach).
// pinia-plugin-persistedstate is disabled in the test environment.
//
// Tests are grouped into:
//   1. Initial state
//   2. applySlideListResult
//   3. applySlideLoadResult
//   4. applyEditorResult
//   5. setActiveSlide
//   6. recordPendingRequest
//   7. reconcileFrom (cross-file guard + normal case)
//   8. captureSnapshot / rollbackFromSnapshot
//   9. optimisticallyApply
//  10. isCacheStale / TTL behavior

import { describe, it, expect, beforeEach } from 'vitest';
import { useEditorStore } from '../../../ui/stores/useEditorStore.js';
import type {
  SlideSummary,
  GeneralSections,
  ContentItems,
  GraphItems,
} from '../../../shared/messages.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SLIDE_A: SlideSummary = {
  id: 'node-1',
  number: 1,
  name: 'Slide 1 — Overview',
  isSkipped: false,
};

const SLIDE_B: SlideSummary = {
  id: 'node-2',
  number: 2,
  name: 'Slide 2 — Details',
  isSkipped: null,
};

const GENERAL_FIXTURE: GeneralSections = {
  titleDescription: {
    copyWrapId: 'cwrap-1',
    heading: 'Hello',
    paragraph: 'World',
    headingDim: [],
  },
  badge: null,
  image: null,
};

const CONTENT_FIXTURE: ContentItems = {
  cardWrapId: 'cwrap-2',
  cards: [],
  timelineItems: [],
  journeyModel: null,
};

const GRAPHS_FIXTURE: GraphItems = {
  tableModel: null,
  journeyModel: null,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useEditorStore', () => {
  let store: ReturnType<typeof useEditorStore>;

  beforeEach(() => {
    // Fresh store per test. Pinia is reset by tests/setup.ts beforeEach.
    store = useEditorStore();
  });

  // ---- 1. Initial state ----

  describe('initial state', () => {
    it('starts with empty slides array', () => {
      expect(store.slides).toEqual([]);
    });

    it('starts with null activeSlideId', () => {
      expect(store.activeSlideId).toBeNull();
    });

    it('starts with null general, content, graphs', () => {
      expect(store.general).toBeNull();
      expect(store.content).toBeNull();
      expect(store.graphs).toBeNull();
    });

    it('starts with zeroed sync state', () => {
      expect(store.sync.lastKnownAt).toBe(0);
      expect(store.sync.fileKey).toBe('');
      expect(store.sync.inFlightRequestId).toBeNull();
      expect(store.sync.reconciling).toBe(false);
    });
  });

  // ---- 2. applySlideListResult ----

  describe('applySlideListResult', () => {
    it('populates slides on ok=true result', () => {
      store.applySlideListResult({ ok: true, data: { slides: [SLIDE_A, SLIDE_B] } }, 'file-abc');
      expect(store.slides).toHaveLength(2);
      expect(store.slides[0]).toEqual(SLIDE_A);
    });

    it('updates sync.fileKey and clears inFlight on success', () => {
      store.applySlideListResult({ ok: true, data: { slides: [SLIDE_A] } }, 'file-abc');
      expect(store.sync.fileKey).toBe('file-abc');
      expect(store.sync.inFlightRequestId).toBeNull();
      expect(store.sync.reconciling).toBe(false);
    });

    it('updates sync.lastKnownAt to approximately now', () => {
      const before = Date.now();
      store.applySlideListResult({ ok: true, data: { slides: [] } }, 'file-abc');
      const after = Date.now();
      expect(store.sync.lastKnownAt).toBeGreaterThanOrEqual(before);
      expect(store.sync.lastKnownAt).toBeLessThanOrEqual(after);
    });

    it('does not mutate slides on ok=false result', () => {
      store.applySlideListResult({ ok: true, data: { slides: [SLIDE_A] } }, 'file-abc');
      store.applySlideListResult(
        { ok: false, error: { code: 'UNEXPECTED', message: 'fail' } },
        'file-abc',
      );
      expect(store.slides).toHaveLength(1); // unchanged
    });
  });

  // ---- 3. applySlideLoadResult ----

  describe('applySlideLoadResult', () => {
    beforeEach(() => {
      store.setActiveSlide('node-1');
    });

    it('writes general, content, graphs on ok=true for active slide', () => {
      store.applySlideLoadResult({
        ok: true,
        data: {
          slideId: 'node-1',
          general: GENERAL_FIXTURE,
          content: CONTENT_FIXTURE,
          graphs: GRAPHS_FIXTURE,
        },
      });
      expect(store.general).toEqual(GENERAL_FIXTURE);
      expect(store.content).toEqual(CONTENT_FIXTURE);
      expect(store.graphs).toEqual(GRAPHS_FIXTURE);
    });

    it('does nothing when slideId does not match activeSlideId', () => {
      store.applySlideLoadResult({
        ok: true,
        data: {
          slideId: 'node-2', // not the active slide
          general: GENERAL_FIXTURE,
          content: null,
          graphs: null,
        },
      });
      // setActiveSlide('node-1') cleared these, they should stay null
      expect(store.general).toBeNull();
    });

    it('does not mutate slices on ok=false result', () => {
      store.applySlideLoadResult({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'slide gone' },
      });
      expect(store.general).toBeNull();
    });

    it('updates sync.lastKnownAt and clears reconciling on success', () => {
      store.beginReconcile();
      store.applySlideLoadResult({
        ok: true,
        data: { slideId: 'node-1', general: null, content: null, graphs: null },
      });
      expect(store.sync.reconciling).toBe(false);
      expect(store.sync.lastKnownAt).toBeGreaterThan(0);
    });
  });

  // ---- 4. applyEditorResult ----

  describe('applyEditorResult', () => {
    it('writes general slice on kind=general + ok=true', () => {
      store.applyEditorResult('general', { ok: true, data: GENERAL_FIXTURE });
      expect(store.general).toEqual(GENERAL_FIXTURE);
    });

    it('writes content slice on kind=content + ok=true', () => {
      store.applyEditorResult('content', { ok: true, data: CONTENT_FIXTURE });
      expect(store.content).toEqual(CONTENT_FIXTURE);
    });

    it('writes graphs slice on kind=graphs + ok=true', () => {
      store.applyEditorResult('graphs', { ok: true, data: GRAPHS_FIXTURE });
      expect(store.graphs).toEqual(GRAPHS_FIXTURE);
    });

    it('clears inFlightRequestId even on ok=false', () => {
      store.recordPendingRequest('corr-1', 'general');
      store.applyEditorResult('general', {
        ok: false,
        error: { code: 'MUTATION_FAILED', message: 'failed' },
      });
      expect(store.sync.inFlightRequestId).toBeNull();
    });

    it('does not write slice data on ok=false', () => {
      store.applyEditorResult('general', GENERAL_FIXTURE as never); // pre-set
      store.applyEditorResult('general', {
        ok: false,
        error: { code: 'MUTATION_FAILED', message: 'failed' },
      });
      // general was never set to GENERAL_FIXTURE properly — stays null
      // This test validates that ok=false does not write
      const freshStore = useEditorStore();
      freshStore.applyEditorResult('general', { ok: true, data: GENERAL_FIXTURE });
      const before = freshStore.general;
      freshStore.applyEditorResult('general', {
        ok: false,
        error: { code: 'MUTATION_FAILED', message: 'failed' },
      });
      expect(freshStore.general).toEqual(before); // unchanged
    });
  });

  // ---- 5. setActiveSlide ----

  describe('setActiveSlide', () => {
    it('updates activeSlideId', () => {
      store.setActiveSlide('node-42');
      expect(store.activeSlideId).toBe('node-42');
    });

    it('clears general, content, graphs when switching slides', () => {
      store.applyEditorResult('general', { ok: true, data: GENERAL_FIXTURE });
      store.applyEditorResult('content', { ok: true, data: CONTENT_FIXTURE });
      store.applyEditorResult('graphs', { ok: true, data: GRAPHS_FIXTURE });

      store.setActiveSlide('node-99');

      expect(store.general).toBeNull();
      expect(store.content).toBeNull();
      expect(store.graphs).toBeNull();
    });

    it('accepts null to deselect', () => {
      store.setActiveSlide('node-1');
      store.setActiveSlide(null);
      expect(store.activeSlideId).toBeNull();
    });
  });

  // ---- 6. recordPendingRequest ----

  describe('recordPendingRequest', () => {
    it('sets inFlightRequestId', () => {
      store.recordPendingRequest('uuid-xyz', 'slide-list');
      expect(store.sync.inFlightRequestId).toBe('uuid-xyz');
    });
  });

  // ---- 7. reconcileFrom ----

  describe('reconcileFrom', () => {
    const snapshot = {
      fileKey: 'file-NEW',
      slides: [SLIDE_A],
      activeSlideId: 'node-1',
      general: GENERAL_FIXTURE,
      content: null,
      graphs: null,
    };

    it('writes all slices from the canvas snapshot', () => {
      store.reconcileFrom(snapshot);
      expect(store.slides).toEqual([SLIDE_A]);
      expect(store.activeSlideId).toBe('node-1');
      expect(store.general).toEqual(GENERAL_FIXTURE);
    });

    it('sets sync.fileKey and clears reconciling + inFlight', () => {
      store.beginReconcile();
      store.reconcileFrom(snapshot);
      expect(store.sync.fileKey).toBe('file-NEW');
      expect(store.sync.reconciling).toBe(false);
      expect(store.sync.inFlightRequestId).toBeNull();
    });

    it('clears data slices on cross-file switch before writing', () => {
      // Establish an existing fileKey
      store.reconcileFrom({ ...snapshot, fileKey: 'file-OLD' });
      store.applyEditorResult('graphs', { ok: true, data: GRAPHS_FIXTURE });

      // Now reconcile from a different file
      store.reconcileFrom({ ...snapshot, fileKey: 'file-NEW', graphs: null });

      // graphs should be whatever was in the new snapshot (null), not the old value
      expect(store.graphs).toBeNull();
      expect(store.sync.fileKey).toBe('file-NEW');
    });

    it('does NOT clear data when fileKey was unset (first open)', () => {
      // sync.fileKey starts as '' — should not be treated as a cross-file switch
      store.applyEditorResult('general', { ok: true, data: GENERAL_FIXTURE });
      store.reconcileFrom({ ...snapshot, fileKey: 'file-NEW', general: GENERAL_FIXTURE });
      expect(store.general).toEqual(GENERAL_FIXTURE);
    });
  });

  // ---- 8. captureSnapshot / rollbackFromSnapshot ----

  describe('captureSnapshot / rollbackFromSnapshot', () => {
    it('captures the current slice state', () => {
      store.setActiveSlide('node-1');
      store.applyEditorResult('general', { ok: true, data: GENERAL_FIXTURE });
      const snap = store.captureSnapshot();
      expect(snap.general).toEqual(GENERAL_FIXTURE);
      expect(snap.activeSlideId).toBe('node-1');
    });

    it('restores prior slice state on rollback', () => {
      store.applyEditorResult('general', { ok: true, data: GENERAL_FIXTURE });
      const snap = store.captureSnapshot();

      // Mutate general to a different value
      const altered: GeneralSections = {
        ...GENERAL_FIXTURE,
        badge: { badgeNodeId: 'b1', label: 'new', icon: 'star' },
      };
      store.applyEditorResult('general', { ok: true, data: altered });
      expect(store.general?.badge).not.toBeNull();

      // Rollback
      store.rollbackFromSnapshot(snap);
      expect(store.general).toEqual(GENERAL_FIXTURE);
    });

    it('rollback clears inFlightRequestId', () => {
      const snap = store.captureSnapshot();
      store.recordPendingRequest('corr-rollback', 'general');
      store.rollbackFromSnapshot(snap);
      expect(store.sync.inFlightRequestId).toBeNull();
    });
  });

  // ---- 9. optimisticallyApply ----

  describe('optimisticallyApply', () => {
    it('merges partial into general slice', () => {
      store.applyEditorResult('general', { ok: true, data: GENERAL_FIXTURE });
      store.optimisticallyApply('general', {
        badge: { badgeNodeId: 'b1', label: 'Opt', icon: 'star' },
      });
      expect(store.general?.badge?.label).toBe('Opt');
      // Original titleDescription preserved
      expect(store.general?.titleDescription?.heading).toBe('Hello');
    });

    it('merges partial into content slice', () => {
      store.applyEditorResult('content', { ok: true, data: CONTENT_FIXTURE });
      const newCards = [
        { cardNodeId: 'c1', heading: 'H', paragraph: 'P', icon: null, visualHash: null },
      ];
      store.optimisticallyApply('content', { cards: newCards });
      expect(store.content?.cards).toHaveLength(1);
    });

    it('does not throw when slice is null (uninitialized slide)', () => {
      // general is null; optimisticallyApply should be a no-op
      expect(() => {
        store.optimisticallyApply('general', { badge: null });
      }).not.toThrow();
      expect(store.general).toBeNull(); // still null
    });
  });

  // ---- 10. isCacheStale / TTL ----

  describe('isCacheStale', () => {
    it('returns true when lastKnownAt is 0 (initial state)', () => {
      expect(store.isCacheStale()).toBe(true);
    });

    it('returns false immediately after a successful result', () => {
      store.applySlideListResult({ ok: true, data: { slides: [] } }, 'file-abc');
      expect(store.isCacheStale()).toBe(false);
    });

    it('returns true when lastKnownAt is older than 7 days', () => {
      // Fake time: set lastKnownAt to 8 days ago
      const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
      store.sync.lastKnownAt = eightDaysAgo;
      expect(store.isCacheStale()).toBe(true);
    });

    it('returns false when lastKnownAt is within 7 days', () => {
      store.sync.lastKnownAt = Date.now() - 1000; // 1 second ago
      expect(store.isCacheStale()).toBe(false);
    });
  });

  // ---- 11. beginReconcile ----

  describe('beginReconcile', () => {
    it('sets sync.reconciling to true', () => {
      expect(store.sync.reconciling).toBe(false);
      store.beginReconcile();
      expect(store.sync.reconciling).toBe(true);
    });

    it('does not clear other sync fields', () => {
      store.recordPendingRequest('corr-x', 'slide-list');
      store.beginReconcile();
      expect(store.sync.inFlightRequestId).toBe('corr-x');
    });
  });
});
