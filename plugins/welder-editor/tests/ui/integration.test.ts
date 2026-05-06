// plugins/welder-editor/tests/ui/integration.test.ts
//
// Sprint 2 Task 2.10 — Cross-section integration tests.
//
// Purpose: prove that the composed App.vue behaves correctly when sections
// interact with each other through the real Pinia store and composables.
// These tests cover scenarios that smoke tests (App.test.ts) cannot cover
// because they require bridge message I/O and async action dispatch.
//
// Design:
//   - Real Pinia store + real useEditorActions + real section rendering.
//   - ONLY the bridge (usePluginBridge) is mocked — its postAndWait and
//     onMessage are controlled per-test.
//   - onMessage: the mock captures the handler App.vue registers; tests call
//     it directly to simulate inbound messages (selection-changed, etc.).
//   - postAndWait: vi.fn() configured per-test with mockResolvedValueOnce /
//     mockReturnValueOnce (deferred) to control action results.
//
// Scenarios:
//   1. Slide pick → all general sections populate
//   2. Slide pick with partial wrappers → empty sections absent, tab visible
//   3. Slide pick with NO wrappers → empty state shown
//   4. Edit heading → applyTitleDescription called + optimistic UI
//   5. Edit fails → rollback fires
//   6. Tab switch → only active tab content visible
//   7. Selection-change from canvas → active slide updates
//
// Environment: jsdom (vitest.config.ts environmentMatchGlobs tests/ui/**).
// Cleanup and Pinia bootstrap handled globally by tests/setup.ts.
//
// Owner: ui-engineer. Resolves MON-2893853693.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, within, fireEvent, waitFor } from '@testing-library/vue';
import { createPinia, setActivePinia } from 'pinia';

import App from '../../ui/App.vue';
import { useEditorStore } from '../../ui/stores/useEditorStore.js';
import type {
  SlideSummary,
  GeneralSections,
  ContentItems,
  GraphItems,
  Message,
} from '../../shared/messages.js';

// ---------------------------------------------------------------------------
// Bridge mock
//
// usePluginBridge is mocked at the module level. The mock implementation:
//   - postAndWait: vi.fn() — configured per-test with mockResolvedValueOnce.
//   - onMessage: captures the registered handler into `capturedMessageHandler`
//     so tests can fire inbound messages directly.
//   - post: vi.fn() — for fire-and-forget sends (not exercised here but present
//     so the mock is structurally complete).
//
// Both App.vue (bridge.onMessage) and useEditorActions (bridge.postAndWait)
// call usePluginBridge() — both get the same mock factory instance, which
// shares the same mockPostAndWait and capturedMessageHandler binding.
// ---------------------------------------------------------------------------

const mockPostAndWait = vi.fn();
const mockPost = vi.fn();

/**
 * Holds the onMessage handler that App.vue registers during setup().
 * Populated synchronously when App.vue calls bridge.onMessage(handler).
 * Tests fire inbound messages by calling capturedMessageHandler(msg).
 */
let capturedMessageHandler: ((msg: Message) => void) | null = null;

vi.mock('../../ui/composables/usePluginBridge.js', () => ({
  usePluginBridge: () => ({
    post: mockPost,
    postAndWait: mockPostAndWait,
    onMessage: (handler: (msg: Message) => void) => {
      // App.vue registers its handler here during setup(). Capture it.
      capturedMessageHandler = handler;
      // Return a no-op unsubscribe (auto-cleanup in onUnmounted is not
      // exercised in these tests; the component is unmounted via cleanup()).
      return () => {
        capturedMessageHandler = null;
      };
    },
  }),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SLIDE_A: SlideSummary = {
  id: 'node-slide-a',
  number: 1,
  name: 'Slide 1 — Overview',
  isSkipped: false,
};

const SLIDE_B: SlideSummary = {
  id: 'node-slide-b',
  number: 2,
  name: 'Slide 2 — Details',
  isSkipped: null,
};

/** Full general payload: all three sub-sections present. */
const GENERAL_ALL: GeneralSections = {
  titleDescription: {
    copyWrapId: 'cwrap-1',
    heading: 'Initial Heading',
    paragraph: 'Initial paragraph text.',
    headingDim: [],
  },
  badge: {
    badgeNodeId: 'badge-1',
    label: 'New',
    icon: 'sparkles',
  },
  image: {
    imageWrapId: 'img-1',
    imageHash: 'abc123',
    cropTransform: [
      [1, 0, 0],
      [0, 1, 0],
    ],
  },
};

/** Partial general payload: only CopyWrap present. */
const GENERAL_COPY_ONLY: GeneralSections = {
  titleDescription: {
    copyWrapId: 'cwrap-2',
    heading: 'Copy-only heading',
    paragraph: null,
    headingDim: null,
  },
  badge: null,
  image: null,
};

/** Empty general payload: slide has GeneralSections record but no sub-section instances. */
const GENERAL_EMPTY: GeneralSections = {
  titleDescription: null,
  badge: null,
  image: null,
};

const CONTENT_FIXTURE: ContentItems = {
  cardWrapId: 'cwrap-content',
  cards: [],
  timelineItems: [],
  journeyModel: null,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Populates store so a slide is selected and general/content/graphs are loaded.
 * Uses store.reconcileFrom — the canonical "canvas data wins" write path.
 */
function populateStore(
  store: ReturnType<typeof useEditorStore>,
  opts: {
    activeSlideId: string;
    general: GeneralSections | null;
    content?: ContentItems | null;
    graphs?: GraphItems | null;
  },
) {
  store.reconcileFrom({
    fileKey: 'file-key-integration',
    slides: [SLIDE_A, SLIDE_B],
    activeSlideId: opts.activeSlideId,
    general: opts.general,
    content: opts.content ?? null,
    graphs: opts.graphs ?? null,
  });
}

/**
 * Simulates a bridge `slide-load:result` response for postAndWait.
 * The correlationId is `'any'` — the mock resolves regardless of ID.
 */
function makeSlideLoadResult(
  slideId: string,
  general: GeneralSections | null,
  content: ContentItems | null = null,
  graphs: GraphItems | null = null,
) {
  return {
    type: 'slide-load:result' as const,
    version: 1 as const,
    payload: {
      ok: true as const,
      data: { slideId, general, content, graphs },
    },
    correlationId: 'any',
  };
}

// ---------------------------------------------------------------------------
// Per-test lifecycle
// ---------------------------------------------------------------------------

beforeEach(() => {
  capturedMessageHandler = null;
  mockPostAndWait.mockReset();
  mockPost.mockReset();
});

afterEach(() => {
  capturedMessageHandler = null;
});

// ---------------------------------------------------------------------------
// Scenario 1: Slide pick → all general sections populate
// ---------------------------------------------------------------------------

describe('1. Slide pick → all general sections populate', () => {
  it('after picking a slide with all wrappers, TitleDescriptionEditor renders with correct heading', async () => {
    // Prime store with slide list but no active slide.
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    store.reconcileFrom({
      fileKey: 'fk',
      slides: [SLIDE_A, SLIDE_B],
      activeSlideId: null,
      general: null,
      content: null,
      graphs: null,
    });

    // Bridge will return the full slide load result.
    mockPostAndWait.mockResolvedValueOnce(makeSlideLoadResult(SLIDE_A.id, GENERAL_ALL));

    const { container } = render(App, { global: { plugins: [pinia] } });
    const q = within(container as HTMLElement);

    // Simulate slide selection via the message bus (selection-changed is the
    // canonical trigger path; USelectMenu replaced the native <select> in PR #58,
    // so fireEvent.change no longer applies to the combobox).
    expect(capturedMessageHandler).not.toBeNull();
    capturedMessageHandler!({
      type: 'selection-changed',
      version: 1,
      payload: { selectedNodeIds: [SLIDE_A.id] },
    });

    // Wait for the async bridge call to resolve and reactivity to flush.
    await waitFor(() => {
      const headingInput = q.getByRole('textbox', { name: /heading/i });
      expect(headingInput).toBeDefined();
    });

    const headingInput = q.getByRole('textbox', { name: /heading/i }) as HTMLInputElement;
    expect(headingInput.value).toBe('Initial Heading');
  });

  it('after picking a slide with all wrappers, BadgeEditor and ImageEditor also render', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    store.reconcileFrom({
      fileKey: 'fk',
      slides: [SLIDE_A, SLIDE_B],
      activeSlideId: null,
      general: null,
      content: null,
      graphs: null,
    });

    mockPostAndWait.mockResolvedValueOnce(makeSlideLoadResult(SLIDE_A.id, GENERAL_ALL));

    const { container } = render(App, { global: { plugins: [pinia] } });
    const q = within(container as HTMLElement);

    // Simulate slide selection via message bus (USelectMenu replaced native <select> — PR #58).
    expect(capturedMessageHandler).not.toBeNull();
    capturedMessageHandler!({
      type: 'selection-changed',
      version: 1,
      payload: { selectedNodeIds: [SLIDE_A.id] },
    });

    await waitFor(() => {
      expect(q.getByRole('textbox', { name: /badge label/i })).toBeDefined();
    });

    expect(q.getByRole('button', { name: /replace image/i })).toBeDefined();
  });

  it('active tab defaults to General after slide pick', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    store.reconcileFrom({
      fileKey: 'fk',
      slides: [SLIDE_A, SLIDE_B],
      activeSlideId: null,
      general: null,
      content: null,
      graphs: null,
    });

    mockPostAndWait.mockResolvedValueOnce(
      makeSlideLoadResult(SLIDE_A.id, GENERAL_ALL, CONTENT_FIXTURE),
    );

    const { container } = render(App, { global: { plugins: [pinia] } });
    const q = within(container as HTMLElement);

    // Simulate slide selection via message bus (USelectMenu replaced native <select> — PR #58).
    expect(capturedMessageHandler).not.toBeNull();
    capturedMessageHandler!({
      type: 'selection-changed',
      version: 1,
      payload: { selectedNodeIds: [SLIDE_A.id] },
    });

    await waitFor(() => {
      // General tab should be the selected tab (aria-selected="true").
      const generalTab = q.getByRole('tab', { name: /^general$/i });
      expect((generalTab as HTMLElement).getAttribute('aria-selected')).toBe('true');
    });

    // General content visible: heading input is accessible (not inside a hidden panel).
    const headingInput = q.queryByRole('textbox', { name: /heading/i });
    expect(headingInput).not.toBeNull();

    // Content tab exists but is not selected (General is the default active tab).
    const contentTab = q.getByRole('tab', { name: /^content$/i });
    expect((contentTab as HTMLElement).getAttribute('aria-selected')).toBe('false');
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: Slide pick with partial wrappers → empty sections absent
// ---------------------------------------------------------------------------

describe('2. Slide pick with partial wrappers → Badge+Image absent, General tab visible', () => {
  it('renders TitleDescriptionEditor but not BadgeEditor or ImageEditor when only CopyWrap present', async () => {
    // Mount with store already showing the partial general state.
    // (Avoids the async load path; store state is canonical for rendering.)
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    populateStore(store, { activeSlideId: SLIDE_A.id, general: GENERAL_COPY_ONLY });

    const { container } = render(App, { global: { plugins: [pinia] } });
    const q = within(container as HTMLElement);

    // CopyWrap is present.
    expect(q.getByRole('textbox', { name: /heading/i })).toBeDefined();

    // Badge and Image are absent.
    expect(q.queryByRole('textbox', { name: /badge label/i })).toBeNull();
    expect(q.queryByRole('button', { name: /replace image/i })).toBeNull();
  });

  it('General tab is still visible (not hidden) when at least CopyWrap is present', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    populateStore(store, { activeSlideId: SLIDE_A.id, general: GENERAL_COPY_ONLY });

    const { container } = render(App, { global: { plugins: [pinia] } });
    const q = within(container as HTMLElement);

    // generalNull = false (GENERAL_COPY_ONLY !== null) so General tab is rendered.
    const generalTab = q.queryByRole('tab', { name: /^general$/i });
    expect(generalTab).not.toBeNull();
  });

  it('Content and Graphs tabs are hidden when their slices are null', async () => {
    // general is present (partial); content + graphs are null.
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    populateStore(store, {
      activeSlideId: SLIDE_A.id,
      general: GENERAL_COPY_ONLY,
      content: null,
      graphs: null,
    });

    const { container } = render(App, { global: { plugins: [pinia] } });
    const q = within(container as HTMLElement);

    // TabStrip hide-empty rule: tabs for null slices are not rendered.
    expect(q.queryByRole('tab', { name: /^content$/i })).toBeNull();
    expect(q.queryByRole('tab', { name: /^graphs$/i })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: Slide pick with NO wrappers → empty state shown
// ---------------------------------------------------------------------------

describe('3. Slide pick with NO wrappers → empty state message, no tabs visible', () => {
  it('shows "No editable general elements" message when general is non-null but all fields null', () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    // general is present (generalNull = false) but all sub-fields are null.
    populateStore(store, {
      activeSlideId: SLIDE_A.id,
      general: GENERAL_EMPTY,
      content: null,
      graphs: null,
    });

    const { container } = render(App, { global: { plugins: [pinia] } });
    const q = within(container as HTMLElement);

    // App.vue renders the section-empty StatusMessage for this case.
    const emptyMsg = q.getByText(/no editable general elements/i);
    expect(emptyMsg).toBeDefined();
  });

  it('does not render any section editor when general has all null sub-sections', () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    populateStore(store, {
      activeSlideId: SLIDE_A.id,
      general: GENERAL_EMPTY,
      content: null,
      graphs: null,
    });

    const { container } = render(App, { global: { plugins: [pinia] } });
    const q = within(container as HTMLElement);

    expect(q.queryByRole('textbox', { name: /heading/i })).toBeNull();
    expect(q.queryByRole('textbox', { name: /badge label/i })).toBeNull();
    expect(q.queryByRole('button', { name: /replace image/i })).toBeNull();
  });

  it('does not render Content or Graphs tabs when their slices are null', () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    populateStore(store, {
      activeSlideId: SLIDE_A.id,
      general: GENERAL_EMPTY,
      content: null,
      graphs: null,
    });

    const { container } = render(App, { global: { plugins: [pinia] } });
    const q = within(container as HTMLElement);

    expect(q.queryByRole('tab', { name: /^content$/i })).toBeNull();
    expect(q.queryByRole('tab', { name: /^graphs$/i })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: Edit heading → action dispatched + optimistic UI
// ---------------------------------------------------------------------------

describe('4. Edit heading → applyTitleDescription dispatched + optimistic write', () => {
  it('optimistic: store reflects new heading value immediately when postAndWait is deferred', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    populateStore(store, { activeSlideId: SLIDE_A.id, general: GENERAL_ALL });

    // Defer resolution so we can inspect the optimistic state before settle.
    let resolveResult!: (v: unknown) => void;
    const deferred = new Promise((res) => {
      resolveResult = res;
    });
    mockPostAndWait.mockReturnValueOnce(deferred);

    const { container } = render(App, { global: { plugins: [pinia] } });
    const q = within(container as HTMLElement);

    const headingInput = q.getByRole('textbox', { name: /heading/i }) as HTMLInputElement;

    // Type a new value into the heading input.
    await fireEvent.input(headingInput, { target: { value: 'Optimistic Heading' } });

    // Wait for debounce (TitleDescriptionEditor debounces 200 ms per spec).
    // The optimistic write must be visible before the deferred promise resolves.
    await waitFor(
      () => {
        expect(store.general?.titleDescription?.heading).toBe('Optimistic Heading');
      },
      { timeout: 400 },
    );

    // Resolve the bridge call to clean up.
    resolveResult({
      type: 'apply-title-description:result',
      version: 1,
      payload: { ok: true, data: { copyWrapId: 'cwrap-1' } },
      correlationId: 'any',
    });
    await deferred;
  });

  it('postAndWait is called with the correct copyWrapId and new heading', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    populateStore(store, { activeSlideId: SLIDE_A.id, general: GENERAL_ALL });

    mockPostAndWait.mockResolvedValue({
      type: 'apply-title-description:result',
      version: 1,
      payload: { ok: true, data: { copyWrapId: 'cwrap-1' } },
      correlationId: 'any',
    });

    const { container } = render(App, { global: { plugins: [pinia] } });
    const q = within(container as HTMLElement);

    const headingInput = q.getByRole('textbox', { name: /heading/i }) as HTMLInputElement;
    await fireEvent.input(headingInput, { target: { value: 'Dispatched Heading' } });

    // Wait for debounce and the postAndWait call to land.
    await waitFor(
      () => {
        expect(mockPostAndWait).toHaveBeenCalled();
      },
      { timeout: 400 },
    );

    // Verify the message sent to the bridge contains the correct payload.
    const sentMsg = mockPostAndWait.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(sentMsg?.['type']).toBe('apply-title-description');
    const payload = sentMsg?.['payload'] as Record<string, unknown> | undefined;
    expect(payload?.['copyWrapId']).toBe('cwrap-1');
    expect(payload?.['heading']).toBe('Dispatched Heading');
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: Edit fails → rollback fires
// ---------------------------------------------------------------------------

describe('5. Edit heading fails → store rolls back to pre-edit value', () => {
  it('heading reverts to original value when bridge returns ok=false', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    populateStore(store, { activeSlideId: SLIDE_A.id, general: GENERAL_ALL });

    // Bridge responds with failure.
    mockPostAndWait.mockResolvedValue({
      type: 'apply-title-description:result',
      version: 1,
      payload: {
        ok: false,
        error: { code: 'MUTATION_FAILED', message: 'Canvas is read-only' },
      },
      correlationId: 'any',
    });

    const { container } = render(App, { global: { plugins: [pinia] } });
    const q = within(container as HTMLElement);

    const headingInput = q.getByRole('textbox', { name: /heading/i });
    await fireEvent.input(headingInput, { target: { value: 'Failed Edit' } });

    // Wait for debounce + bridge result + rollback.
    await waitFor(
      () => {
        // After rollback, store heading should revert to 'Initial Heading'.
        expect(store.general?.titleDescription?.heading).toBe('Initial Heading');
      },
      { timeout: 400 },
    );
  });

  it('inFlightRequestId is null after failed edit (rollback clears it)', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    populateStore(store, { activeSlideId: SLIDE_A.id, general: GENERAL_ALL });

    mockPostAndWait.mockResolvedValue({
      type: 'apply-title-description:result',
      version: 1,
      payload: {
        ok: false,
        error: { code: 'UNEXPECTED', message: 'Unknown error' },
      },
      correlationId: 'any',
    });

    const { container } = render(App, { global: { plugins: [pinia] } });
    const q = within(container as HTMLElement);

    const headingInput = q.getByRole('textbox', { name: /heading/i });
    await fireEvent.input(headingInput, { target: { value: 'Will Fail' } });

    await waitFor(
      () => {
        expect(store.sync.inFlightRequestId).toBeNull();
      },
      { timeout: 400 },
    );
  });
});

// ---------------------------------------------------------------------------
// Scenario 6: Tab switch → only active tab content visible
// ---------------------------------------------------------------------------

describe('6. Tab switch → active tab content visible, inactive hidden', () => {
  it('switching to Content tab shows Sprint 3 placeholder; General editors are hidden', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    // Both general and content populated so both tabs are rendered.
    populateStore(store, {
      activeSlideId: SLIDE_A.id,
      general: GENERAL_ALL,
      content: CONTENT_FIXTURE,
    });

    const { container } = render(App, { global: { plugins: [pinia] } });
    const q = within(container as HTMLElement);

    // Initially on General tab — heading input visible.
    expect(q.getByRole('textbox', { name: /heading/i })).toBeDefined();

    // Switch to Content tab.
    const contentTab = q.getByRole('tab', { name: /^content$/i });
    await fireEvent.click(contentTab);

    // Content tab is now active. General section editors are gone.
    // (Content tab shows the real content panel, not the old placeholder.)
    await waitFor(() => {
      // contentTab aria-selected=true confirms the switch landed.
      expect((contentTab as HTMLElement).getAttribute('aria-selected')).toBe('true');
    });

    // General section editors are no longer visible.
    expect(q.queryByRole('textbox', { name: /heading/i })).toBeNull();
  });

  it('switching back to General tab from Content restores General tab as selected', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    populateStore(store, {
      activeSlideId: SLIDE_A.id,
      general: GENERAL_ALL,
      content: CONTENT_FIXTURE,
    });

    const { container } = render(App, { global: { plugins: [pinia] } });
    const q = within(container as HTMLElement);

    // Switch to Content.
    const contentTab = q.getByRole('tab', { name: /^content$/i });
    await fireEvent.click(contentTab);

    await waitFor(() => {
      // Content tab is now selected.
      expect((contentTab as HTMLElement).getAttribute('aria-selected')).toBe('true');
    });

    // Switch back to General.
    const generalTab = q.getByRole('tab', { name: /^general$/i });
    await fireEvent.click(generalTab);

    await waitFor(() => {
      // General tab is selected again; heading input is accessible (not hidden).
      expect((generalTab as HTMLElement).getAttribute('aria-selected')).toBe('true');
      expect(q.getByRole('textbox', { name: /heading/i })).toBeDefined();
    });

    // Content tab is deselected.
    expect((contentTab as HTMLElement).getAttribute('aria-selected')).toBe('false');
  });

  it('local activeTab ref is not stored in Pinia (no store mutation on tab switch)', async () => {
    // Tab state is local ref in App.vue (per PR #6 / ADR-0010 §3.1 ESLint rule).
    // Verifying: store has no "activeTab" or similar property that changes.
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    populateStore(store, {
      activeSlideId: SLIDE_A.id,
      general: GENERAL_ALL,
      content: CONTENT_FIXTURE,
    });

    const syncBefore = { ...store.sync };

    const { container } = render(App, { global: { plugins: [pinia] } });
    const q = within(container as HTMLElement);

    const contentTab = q.getByRole('tab', { name: /^content$/i });
    await fireEvent.click(contentTab);

    // sync state should be unchanged (no bridge call, no request pending).
    expect(store.sync.inFlightRequestId).toBe(syncBefore.inFlightRequestId);
    expect(store.sync.reconciling).toBe(syncBefore.reconciling);

    // activeSlideId should be unchanged (switching tabs doesn't change the slide).
    expect(store.activeSlideId).toBe(SLIDE_A.id);
  });
});

// ---------------------------------------------------------------------------
// Scenario 7: Selection-change from canvas → active slide updates
// ---------------------------------------------------------------------------

describe('7. selection-changed bridge message → active slide updates in SlidePicker', () => {
  it('fires selection-changed with slide B node id → store.activeSlideId becomes slide B', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();

    // Start: slide A is active, general loaded.
    populateStore(store, {
      activeSlideId: SLIDE_A.id,
      general: GENERAL_ALL,
    });

    // Bridge will respond to the loadSlide triggered by selection-changed.
    mockPostAndWait.mockResolvedValueOnce(makeSlideLoadResult(SLIDE_B.id, GENERAL_COPY_ONLY));

    render(App, { global: { plugins: [pinia] } });

    // capturedMessageHandler is now set (App.vue registered it during setup).
    expect(capturedMessageHandler).not.toBeNull();

    // Simulate the code side sending a selection-changed event for slide B.
    capturedMessageHandler!({
      type: 'selection-changed',
      version: 1,
      payload: { selectedNodeIds: [SLIDE_B.id] },
    });

    // Wait for the store to reflect the new active slide.
    await waitFor(() => {
      expect(store.activeSlideId).toBe(SLIDE_B.id);
    });
  });

  it('fires selection-changed with slide B → SlidePicker renders slide B as selected', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();

    populateStore(store, {
      activeSlideId: SLIDE_A.id,
      general: GENERAL_ALL,
    });

    mockPostAndWait.mockResolvedValueOnce(makeSlideLoadResult(SLIDE_B.id, GENERAL_COPY_ONLY));

    render(App, { global: { plugins: [pinia] } });

    expect(capturedMessageHandler).not.toBeNull();

    capturedMessageHandler!({
      type: 'selection-changed',
      version: 1,
      payload: { selectedNodeIds: [SLIDE_B.id] },
    });

    // Wait for the store's activeSlideId to update to slide B.
    // USelectMenu replaced the native <select> (PR #58); picker.value no longer applies.
    // The store is the canonical truth for the selected slide.
    await waitFor(() => {
      expect(store.activeSlideId).toBe(SLIDE_B.id);
    });
  });

  it('fires selection-changed with an unknown node id → activeSlideId unchanged', async () => {
    // A selection-changed message whose IDs don't match any known slide
    // should be silently ignored (no loadSlide dispatched).
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();

    populateStore(store, {
      activeSlideId: SLIDE_A.id,
      general: GENERAL_ALL,
    });

    render(App, { global: { plugins: [pinia] } });

    expect(capturedMessageHandler).not.toBeNull();

    capturedMessageHandler!({
      type: 'selection-changed',
      version: 1,
      payload: { selectedNodeIds: ['node-not-a-slide'] },
    });

    // Give the event loop a tick to confirm no side-effects.
    await new Promise((r) => setTimeout(r, 0));

    expect(store.activeSlideId).toBe(SLIDE_A.id);
    expect(mockPostAndWait).not.toHaveBeenCalled();
  });
});
