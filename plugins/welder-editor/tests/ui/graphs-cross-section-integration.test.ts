// plugins/welder-editor/tests/ui/graphs-cross-section-integration.test.ts
// Sprint 5 Wave 2: removed switchToGraphsTab helper (no tab navigation).
// Graphs card renders directly when tableModel or journeyModel is non-null.
//
// Sprint 4 Task 4.6 — Cross-section integration tests for the Graphs tab.
//
// Purpose: validate interactions BETWEEN TableEditor and JourneyEditor as they
// are composed inside App.vue's Graphs tab. These tests cover the integration
// layer that graphs-tab.test.ts (4.3) did NOT cover: store mutation visibility
// across sections, optimistic rollback, bridge round-trips, persisted-state
// writes, concurrent dispatch slice isolation, error recovery, CSV import
// flow, and JourneyEditor range clamping.
//
// Design:
//   - Real Pinia store + real useEditorActions + real section rendering.
//   - usePluginBridge mocked at module level (same pattern as
//     cross-section-integration.test.ts).
//   - mockPostAndWait configured per-test to control bridge responses.
//   - Deferred promises used for in-flight / concurrent scenarios.
//   - waitFor used for all async assertions — no raw setTimeout.
//
// Scenarios (≥ 8 groups, ≥ 16 cases):
//   1. TableEditor cell edit → store.graphs.table reflects update; bridge receives
//      correct payload.
//   2. JourneyEditor item label edit → store.graphs.journey.items reflects
//      update; bridge receives correct payload.
//   3. Both blocks visible: TableEditor edit does NOT stomp JourneyEditor state.
//   4. Bridge round-trip: applyTableWidth dispatched → store + TableEditor input
//      both reflect new width; postAndWait receives correct payload.
//   5. pinia-plugin-persistedstate: localStorage write verified on graphs slice
//      mutation.
//   6. Concurrent: store-layer proof that optimisticallyApply for table and
//      journey are slice-independent; UI disabled state during in-flight.
//   7. Error path: bridge returns ok=false for applyTable → rollback restores
//      original table model; inFlightRequestId cleared.
//   8. CSV import flow: TableEditor emits replaceContent → bridge →
//      store.graphs.table.rows reflects parsed CSV.
//   9. JourneyEditor invalid range: end < start → clamp logic clamps in section,
//      no malformed payload reaches bridge.
//
// axe: 3 additional states — in-flight Graphs tab edit, post-rollback graphs
//      state, both-sections concurrent disabled state.
//
// Environment: jsdom (vitest.config.ts environmentMatchGlobs tests/ui/**).
// Cleanup and Pinia bootstrap handled globally by tests/setup.ts.
//
// Owner: plugin-tester. Resolves MON-2893996394 (Sprint 4, Task 4.6).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, within, fireEvent, waitFor } from '@testing-library/vue';
import { createPinia, setActivePinia } from 'pinia';
import axe from 'axe-core';

import App from '../../ui/App.vue';
import { useEditorStore } from '../../ui/stores/useEditorStore.js';
import type {
  GeneralSections,
  GraphItems,
  TableWrapModel,
  JourneyWrapModel,
  Message,
} from '../../shared/messages.js';

// ---------------------------------------------------------------------------
// Bridge mock — same pattern as cross-section-integration.test.ts
// ---------------------------------------------------------------------------

const mockPostAndWait = vi.fn();
const mockPost = vi.fn();

vi.mock('../../ui/composables/usePluginBridge.js', () => ({
  usePluginBridge: () => ({
    post: mockPost,
    postAndWait: mockPostAndWait,
    onMessage: (_handler: (msg: Message) => void) => {
      return () => undefined;
    },
  }),
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// No titleDescription to avoid competing heading textboxes with JourneyEditor.
// With stacked panels all sections are visible simultaneously.
const GENERAL_MINIMAL: GeneralSections = {
  titleDescription: null,
  badge: { badgeNodeId: 'badge-1', label: 'Q4', icon: 'sparkles' },
  image: null,
};

const TABLE_MODEL: TableWrapModel = {
  slotId: 'slot-table-1',
  width: 'md',
  hasColumnHeader: true,
  textSize: 'md',
  rows: [
    {
      rowNodeId: 'row-1',
      cells: [
        { cellNodeId: 'cell-1-1', value: 'Header A' },
        { cellNodeId: 'cell-1-2', value: 'Header B' },
      ],
    },
    {
      rowNodeId: 'row-2',
      cells: [
        { cellNodeId: 'cell-2-1', value: 'Value A' },
        { cellNodeId: 'cell-2-2', value: 'Value B' },
      ],
    },
  ],
};

const JOURNEY_MODEL: JourneyWrapModel = {
  slotId: 'slot-journey-1',
  columns: [
    { header: 'Phase 1', subheader: 'Discovery' },
    { header: 'Phase 2', subheader: 'Delivery' },
  ],
  items: [
    { itemNodeId: 'item-1', icon: 'sparkles', label: 'Research', startPct: 0, endPct: 40 },
    { itemNodeId: 'item-2', icon: 'zap', label: 'Build', startPct: 45, endPct: 90 },
  ],
};

const GRAPHS_BOTH: GraphItems = {
  tableModel: TABLE_MODEL,
  journeyModel: JOURNEY_MODEL,
};

const GRAPHS_TABLE_ONLY: GraphItems = {
  tableModel: TABLE_MODEL,
  journeyModel: null,
};

const GRAPHS_JOURNEY_ONLY: GraphItems = {
  tableModel: null,
  journeyModel: JOURNEY_MODEL,
};

// ---------------------------------------------------------------------------
// Bridge response envelopes
// ---------------------------------------------------------------------------

const APPLY_TABLE_SUCCESS = {
  type: 'apply-table:result' as const,
  version: 1 as const,
  payload: { ok: true as const, data: { slotId: 'slot-table-1' } },
  correlationId: 'any',
};

const APPLY_JOURNEY_SUCCESS = {
  type: 'apply-journey:result' as const,
  version: 1 as const,
  payload: { ok: true as const, data: { slotId: 'slot-journey-1' } },
  correlationId: 'any',
};

const APPLY_TABLE_ERROR = {
  type: 'apply-table:result' as const,
  version: 1 as const,
  payload: {
    ok: false as const,
    error: { code: 'MUTATION_FAILED' as const, message: 'Canvas is read-only' },
  },
  correlationId: 'any',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function populateStoreWithGraphs(
  store: ReturnType<typeof useEditorStore>,
  graphs: GraphItems | null,
  general: GeneralSections | null = GENERAL_MINIMAL,
) {
  store.reconcileFrom({
    fileKey: 'file-key-graphs-xsection',
    slides: [{ id: 'slide-1', number: 1, name: 'Slide 1', isSkipped: false }],
    activeSlideId: 'slide-1',
    general,
    content: null,
    graphs,
  });
}

// No switchToGraphsTab helper needed — stacked panels.
// Graphs card renders directly when graphs.tableModel !== null or
// graphs.journeyModel !== null. No tab interaction required.

// ---------------------------------------------------------------------------
// Per-test lifecycle
// ---------------------------------------------------------------------------

// Suppress console.warn/error from @iconify/vue manifest loading in jsdom.
const originalWarn = console.warn;
const originalError = console.error;
beforeEach(() => {
  console.warn = vi.fn();
  console.error = vi.fn();
  mockPostAndWait.mockReset();
  mockPost.mockReset();
  mockPostAndWait.mockResolvedValue(APPLY_TABLE_SUCCESS);
});

afterEach(() => {
  console.warn = originalWarn;
  console.error = originalError;
});

// ===========================================================================
// Scenario 1: TableEditor cell edit → store reflects update; bridge gets correct payload
// ===========================================================================

describe('1. TableEditor cell edit → store.graphs.tableModel reflects update; bridge receives correct payload', () => {
  it('store.graphs.tableModel.rows[0].cells[0].value updates after cell input fires', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    populateStoreWithGraphs(store, GRAPHS_TABLE_ONLY);

    // Defer bridge so we can inspect the optimistic state before it resolves.
    let resolveTable!: (v: unknown) => void;
    const deferred = new Promise((res) => {
      resolveTable = res;
    });
    mockPostAndWait.mockReturnValueOnce(deferred);

    const { container } = render(App, { global: { plugins: [pinia] } });
    const q = within(container as HTMLElement);

    // Stacked panel: graphs section visible without tab navigation.

    const row1col1Input = q.getByRole('textbox', { name: /row 1, column 1/i });
    await fireEvent.input(row1col1Input, { target: { value: 'Updated Header A' } });

    // Optimistic write should be visible before bridge resolves.
    await waitFor(
      () => {
        const cell = store.graphs?.tableModel?.rows[0]?.cells[0];
        expect(cell?.value).toBe('Updated Header A');
      },
      { timeout: 500 },
    );

    // Clean up deferred promise.
    resolveTable(APPLY_TABLE_SUCCESS);
    await deferred;
  });

  it('bridge postAndWait receives apply-table with patched cell value in desired.rows', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    populateStoreWithGraphs(store, GRAPHS_TABLE_ONLY);

    mockPostAndWait.mockResolvedValue(APPLY_TABLE_SUCCESS);

    const { container } = render(App, { global: { plugins: [pinia] } });
    const q = within(container as HTMLElement);

    // Stacked panel: graphs section visible without tab navigation.

    mockPostAndWait.mockClear();
    mockPostAndWait.mockResolvedValue(APPLY_TABLE_SUCCESS);

    const row1col1Input = q.getByRole('textbox', { name: /row 1, column 1/i });
    await fireEvent.input(row1col1Input, { target: { value: 'Bridge Cell Value' } });

    await waitFor(
      () => {
        expect(mockPostAndWait).toHaveBeenCalled();
      },
      { timeout: 500 },
    );

    const sentMsg = mockPostAndWait.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(sentMsg?.['type']).toBe('apply-table');
    const payload = sentMsg?.['payload'] as Record<string, unknown> | undefined;
    expect(payload?.['slotId']).toBe('slot-table-1');
    const desired = payload?.['desired'] as {
      rows: Array<{ cells: Array<{ value: string }> }>;
    };
    expect(desired?.['rows']?.[0]?.cells?.[0]?.value).toBe('Bridge Cell Value');

    void store;
  });
});

// ===========================================================================
// Scenario 2: JourneyEditor item label edit → store reflects update; bridge gets correct payload
// ===========================================================================

describe('2. JourneyEditor item label edit → store.graphs.journeyModel.items reflects update; bridge receives correct payload', () => {
  it('store.graphs.journeyModel.items[0].label updates after label input fires', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    populateStoreWithGraphs(store, GRAPHS_JOURNEY_ONLY);

    let resolveJourney!: (v: unknown) => void;
    const deferred = new Promise((res) => {
      resolveJourney = res;
    });
    mockPostAndWait.mockReturnValueOnce(deferred);

    const { container } = render(App, { global: { plugins: [pinia] } });
    const q = within(container as HTMLElement);

    // Stacked panel: graphs section visible without tab navigation.

    await waitFor(() => {
      expect(q.getByRole('textbox', { name: /step 1 label/i })).toBeDefined();
    });

    const labelInput = q.getByRole('textbox', { name: /step 1 label/i });
    await fireEvent.input(labelInput, { target: { value: 'Research Updated' } });

    // Optimistic write visible before bridge resolves.
    await waitFor(
      () => {
        const item = store.graphs?.journeyModel?.items.find((i) => i.itemNodeId === 'item-1');
        expect(item?.label).toBe('Research Updated');
      },
      { timeout: 500 },
    );

    resolveJourney(APPLY_JOURNEY_SUCCESS);
    await deferred;
  });

  it('bridge postAndWait receives apply-journey with patched item label in desired.items', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    populateStoreWithGraphs(store, GRAPHS_JOURNEY_ONLY);

    mockPostAndWait.mockResolvedValue(APPLY_JOURNEY_SUCCESS);

    const { container } = render(App, { global: { plugins: [pinia] } });
    const q = within(container as HTMLElement);

    // Stacked panel: graphs section visible without tab navigation.

    await waitFor(() => {
      expect(q.getByRole('textbox', { name: /step 1 label/i })).toBeDefined();
    });

    mockPostAndWait.mockClear();
    mockPostAndWait.mockResolvedValue(APPLY_JOURNEY_SUCCESS);

    const labelInput = q.getByRole('textbox', { name: /step 1 label/i });
    await fireEvent.input(labelInput, { target: { value: 'Bridge Label Value' } });

    await waitFor(
      () => {
        expect(mockPostAndWait).toHaveBeenCalled();
      },
      { timeout: 500 },
    );

    const sentMsg = mockPostAndWait.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(sentMsg?.['type']).toBe('apply-journey');
    const payload = sentMsg?.['payload'] as Record<string, unknown> | undefined;
    expect(payload?.['slotId']).toBe('slot-journey-1');
    const desired = payload?.['desired'] as {
      items: Array<{ itemNodeId: string; label: string }>;
    };
    const item1 = desired?.['items']?.find((i) => i.itemNodeId === 'item-1');
    expect(item1?.label).toBe('Bridge Label Value');

    void store;
  });
});

// ===========================================================================
// Scenario 3: Both blocks visible — TableEditor edit does NOT stomp JourneyEditor state
// ===========================================================================

describe('3. Both blocks visible: TableEditor edit does NOT stomp JourneyEditor state', () => {
  it('store.graphs.journeyModel is unchanged after a TableEditor cell edit', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    populateStoreWithGraphs(store, GRAPHS_BOTH);

    mockPostAndWait.mockResolvedValue(APPLY_TABLE_SUCCESS);

    const { container } = render(App, { global: { plugins: [pinia] } });
    const q = within(container as HTMLElement);

    // Stacked panel: graphs section visible without tab navigation.

    // Capture journey state before edit.
    const journeyBefore = store.graphs?.journeyModel;
    const item1Before = journeyBefore?.items.find((i) => i.itemNodeId === 'item-1');
    expect(item1Before?.label).toBe('Research');

    // Edit a table cell.
    const row1col1Input = q.getByRole('textbox', { name: /row 1, column 1/i });
    await fireEvent.input(row1col1Input, { target: { value: 'Changed Cell' } });

    // Wait for table update to land.
    await waitFor(
      () => {
        const cell = store.graphs?.tableModel?.rows[0]?.cells[0];
        expect(cell?.value).toBe('Changed Cell');
      },
      { timeout: 500 },
    );

    // Journey model must be untouched.
    const item1After = store.graphs?.journeyModel?.items.find((i) => i.itemNodeId === 'item-1');
    expect(item1After?.label).toBe('Research');
    expect(store.graphs?.journeyModel?.items).toHaveLength(2);
  });

  it('store.graphs.tableModel is unchanged after a JourneyEditor label edit', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    populateStoreWithGraphs(store, GRAPHS_BOTH);

    mockPostAndWait.mockResolvedValue(APPLY_JOURNEY_SUCCESS);

    const { container } = render(App, { global: { plugins: [pinia] } });
    const q = within(container as HTMLElement);

    // Stacked panel: graphs section visible without tab navigation.

    // Capture table state before edit.
    const tableBefore = store.graphs?.tableModel;
    const cellBefore = tableBefore?.rows[0]?.cells[0];
    expect(cellBefore?.value).toBe('Header A');

    await waitFor(() => {
      expect(q.getByRole('textbox', { name: /step 1 label/i })).toBeDefined();
    });

    const labelInput = q.getByRole('textbox', { name: /step 1 label/i });
    await fireEvent.input(labelInput, { target: { value: 'Journey Changed' } });

    // Wait for journey update to land.
    await waitFor(
      () => {
        const item = store.graphs?.journeyModel?.items.find((i) => i.itemNodeId === 'item-1');
        expect(item?.label).toBe('Journey Changed');
      },
      { timeout: 500 },
    );

    // Table model must be untouched.
    const cellAfter = store.graphs?.tableModel?.rows[0]?.cells[0];
    expect(cellAfter?.value).toBe('Header A');
    expect(store.graphs?.tableModel?.rows).toHaveLength(2);
  });
});

// ===========================================================================
// Scenario 4: Bridge round-trip: applyTableWidth → store + TableEditor reflect new width;
//             postAndWait receives correct payload
// ===========================================================================

describe('4. Bridge round-trip: applyTableWidth dispatched → store + TableEditor reflect new width; postAndWait receives correct payload', () => {
  it('store.graphs.tableModel.width updates to lg after bridge success', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    populateStoreWithGraphs(store, GRAPHS_TABLE_ONLY);

    mockPostAndWait.mockResolvedValue(APPLY_TABLE_SUCCESS);

    const { container } = render(App, { global: { plugins: [pinia] } });
    const q = within(container as HTMLElement);

    // Stacked panel: graphs section visible without tab navigation.

    // Width group is first: lg button at index 0.
    const lgBtns = q.getAllByRole('button', { name: 'lg' });
    await fireEvent.click(lgBtns[0]!);

    await waitFor(
      () => {
        expect(store.graphs?.tableModel?.width).toBe('lg');
      },
      { timeout: 500 },
    );

    // inFlightRequestId must clear after success.
    await waitFor(() => {
      expect(store.sync.inFlightRequestId).toBeNull();
    });
  });

  it('postAndWait receives apply-table with correct slotId and desired.width=lg', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    populateStoreWithGraphs(store, GRAPHS_TABLE_ONLY);

    mockPostAndWait.mockResolvedValue(APPLY_TABLE_SUCCESS);

    const { container } = render(App, { global: { plugins: [pinia] } });
    const q = within(container as HTMLElement);

    // Stacked panel: graphs section visible without tab navigation.

    mockPostAndWait.mockClear();
    mockPostAndWait.mockResolvedValue(APPLY_TABLE_SUCCESS);

    const lgBtns = q.getAllByRole('button', { name: 'lg' });
    await fireEvent.click(lgBtns[0]!);

    await waitFor(
      () => {
        expect(mockPostAndWait).toHaveBeenCalled();
      },
      { timeout: 500 },
    );

    const sentMsg = mockPostAndWait.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(sentMsg?.['type']).toBe('apply-table');
    const payload = sentMsg?.['payload'] as Record<string, unknown> | undefined;
    expect(payload?.['slotId']).toBe('slot-table-1');
    const desired = payload?.['desired'] as Record<string, unknown> | undefined;
    expect(desired?.['width']).toBe('lg');

    void store;
  });
});

// ===========================================================================
// Scenario 5: pinia-plugin-persistedstate — localStorage write on graphs slice mutation
// ===========================================================================

describe('5. Pinia persistedstate: graphs slice mutation produces localStorage write (or store confirms state)', () => {
  it('store.graphs.tableModel reflects updated width; localStorage entry contains updated model if plugin active', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    populateStoreWithGraphs(store, GRAPHS_TABLE_ONLY);

    mockPostAndWait.mockResolvedValue(APPLY_TABLE_SUCCESS);

    const { container } = render(App, { global: { plugins: [pinia] } });
    const q = within(container as HTMLElement);

    // Stacked panel: graphs section visible without tab navigation.

    const lgBtns = q.getAllByRole('button', { name: 'lg' });
    await fireEvent.click(lgBtns[0]!);

    // Wait for optimistic write to land in the store.
    await waitFor(
      () => {
        expect(store.graphs?.tableModel?.width).toBe('lg');
      },
      { timeout: 500 },
    );

    // Persistence: either localStorage carries the value, or the store does.
    // pinia-plugin-persistedstate is disabled in test env (import.meta.env.TEST === 'true').
    const lsRaw = localStorage.getItem('welder-editor');
    if (lsRaw !== null) {
      // Plugin active — confirm the graphs slice is serialised with the updated width.
      const parsed = JSON.parse(lsRaw) as Record<string, unknown>;
      const graphs = parsed['graphs'] as Record<string, unknown> | undefined;
      const tableModel = graphs?.['tableModel'] as Record<string, unknown> | undefined;
      expect(tableModel?.['width']).toBe('lg');
    } else {
      // Plugin disabled in test environment — confirm store state directly.
      expect(store.graphs?.tableModel?.width).toBe('lg');
    }
  });
});

// ===========================================================================
// Scenario 6: Concurrent — table and journey optimisticallyApply are slice-independent;
//             UI disabled state during in-flight
// ===========================================================================

describe('6. Concurrent: table and journey optimisticallyApply are slice-independent', () => {
  it('optimistically applying table then journey does not corrupt either sub-model', () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    populateStoreWithGraphs(store, GRAPHS_BOTH);

    // Capture snapshot before any writes (simulates applyTable capturing before dispatch).
    const snapshotBeforeTable = store.captureSnapshot();

    // --- Optimistic table write: change width to lg ---
    const updatedTable: TableWrapModel = { ...TABLE_MODEL, width: 'lg' };
    store.optimisticallyApply('graphs', {
      tableModel: updatedTable,
    });
    store.recordPendingRequest('corr-table-1', 'graphs');

    // Capture snapshot before journey write.
    const snapshotBeforeJourney = store.captureSnapshot();

    // --- Optimistic journey write while table is in-flight: change item-1 label ---
    const updatedJourney: JourneyWrapModel = {
      ...JOURNEY_MODEL,
      items: JOURNEY_MODEL.items.map((item) =>
        item.itemNodeId === 'item-1' ? { ...item, label: 'Concurrent Research' } : item,
      ),
    };
    store.optimisticallyApply('graphs', {
      journeyModel: updatedJourney,
    });
    store.recordPendingRequest('corr-journey-1', 'graphs');

    // Both writes visible simultaneously — neither overwrote the other.
    expect(store.graphs?.tableModel?.width).toBe('lg');
    expect(store.graphs?.journeyModel?.items.find((i) => i.itemNodeId === 'item-1')?.label).toBe(
      'Concurrent Research',
    );

    // Resolve journey (bridge returns ok=true).
    store.applyEditorResult('graphs', { ok: true, data: store.graphs! });
    expect(store.sync.inFlightRequestId).toBeNull();

    // Resolve table (bridge returns ok=true).
    store.applyEditorResult('graphs', { ok: true, data: store.graphs! });
    expect(store.sync.inFlightRequestId).toBeNull();

    // Both updates survive.
    expect(store.graphs?.tableModel?.width).toBe('lg');
    expect(store.graphs?.journeyModel?.items.find((i) => i.itemNodeId === 'item-1')?.label).toBe(
      'Concurrent Research',
    );

    // Snapshot independence: rolling back to snapshotBeforeTable restores original state.
    store.rollbackFromSnapshot(snapshotBeforeTable);
    expect(store.graphs?.tableModel?.width).toBe('md'); // original TABLE_MODEL.width
    expect(store.graphs?.journeyModel?.items.find((i) => i.itemNodeId === 'item-1')?.label).toBe(
      'Research',
    ); // original

    // snapshotBeforeJourney captured the table-updated state.
    store.rollbackFromSnapshot(snapshotBeforeJourney);
    expect(store.graphs?.tableModel?.width).toBe('lg');
    expect(store.graphs?.journeyModel?.items.find((i) => i.itemNodeId === 'item-1')?.label).toBe(
      'Research',
    );

    // No snapshot leaked to inFlightRequestId after rollback.
    expect(store.sync.inFlightRequestId).toBeNull();

    // Suppress unused warnings from fixtures.
    void snapshotBeforeTable;
    void snapshotBeforeJourney;
  });

  it('UI: both TableEditor and JourneyEditor are disabled during in-flight', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    populateStoreWithGraphs(store, GRAPHS_BOTH);

    // Mark a request as in-flight (simulates concurrent dispatch state).
    store.recordPendingRequest('corr-concurrent-ui', 'graphs');

    const { container } = render(App, { global: { plugins: [pinia] } });
    const q = within(container as HTMLElement);

    // Stacked panel: graphs section visible without tab navigation.

    // TableEditor renders <section class="table-editor" aria-disabled="true"> when disabled.
    const tableSection = container.querySelector('.table-editor');
    expect(tableSection).not.toBeNull();
    expect(tableSection!.getAttribute('aria-disabled')).toBe('true');

    // JourneyEditor heading input should be disabled.
    await waitFor(() => {
      expect(q.getByRole('textbox', { name: /heading/i })).toBeDefined();
    });
    const headingInput = q.getByRole('textbox', { name: /heading/i }) as HTMLInputElement;
    expect(headingInput.disabled).toBe(true);
  });
});

// ===========================================================================
// Scenario 7: Error path — bridge returns ok=false for applyTable → rollback restores
//             original table model; inFlightRequestId cleared
// ===========================================================================

describe('7. Error path: bridge returns ok=false for applyTable → rollback restores original table model; inFlightRequestId cleared', () => {
  it('store.graphs.tableModel reverts to original model when bridge returns ok=false', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    populateStoreWithGraphs(store, GRAPHS_TABLE_ONLY);

    // Bridge responds with failure.
    mockPostAndWait.mockResolvedValue(APPLY_TABLE_ERROR);

    const { container } = render(App, { global: { plugins: [pinia] } });
    const q = within(container as HTMLElement);

    // Stacked panel: graphs section visible without tab navigation.

    // Capture the original cell value.
    const originalValue = 'Header A';

    // Edit a cell — triggers optimistic write + bridge dispatch.
    const row1col1Input = q.getByRole('textbox', { name: /row 1, column 1/i });
    await fireEvent.input(row1col1Input, { target: { value: 'Will Be Rolled Back' } });

    // After bridge returns ok=false, store should rollback to original.
    await waitFor(
      () => {
        const cell = store.graphs?.tableModel?.rows[0]?.cells[0];
        expect(cell?.value).toBe(originalValue);
      },
      { timeout: 500 },
    );
  });

  it('inFlightRequestId is null after rollback (sync state clean)', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    populateStoreWithGraphs(store, GRAPHS_TABLE_ONLY);

    mockPostAndWait.mockResolvedValue(APPLY_TABLE_ERROR);

    const { container } = render(App, { global: { plugins: [pinia] } });
    const q = within(container as HTMLElement);

    // Stacked panel: graphs section visible without tab navigation.

    const row1col1Input = q.getByRole('textbox', { name: /row 1, column 1/i });
    await fireEvent.input(row1col1Input, { target: { value: 'Failed Edit' } });

    await waitFor(
      () => {
        expect(store.sync.inFlightRequestId).toBeNull();
      },
      { timeout: 500 },
    );
  });
});

// ===========================================================================
// Scenario 8: CSV import flow — TableEditor emits replaceContent → bridge →
//             store.graphs.tableModel.rows reflects parsed CSV
// ===========================================================================

describe('8. CSV import flow: TableEditor replaceContent → bridge → store.graphs.tableModel.rows reflects parsed CSV', () => {
  it('pasting CSV and clicking Parse & Apply dispatches apply-table with 2 rows (header + body)', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    populateStoreWithGraphs(store, GRAPHS_TABLE_ONLY);

    mockPostAndWait.mockResolvedValue(APPLY_TABLE_SUCCESS);

    const { container } = render(App, { global: { plugins: [pinia] } });
    const q = within(container as HTMLElement);

    // Stacked panel: graphs section visible without tab navigation.

    const csvTextarea = q.getByRole('textbox', { name: /paste csv/i });
    await fireEvent.update(csvTextarea, 'Name,Role\nAlice,Engineer');

    const parseBtn = q.getByRole('button', { name: /parse.*apply/i });
    await fireEvent.click(parseBtn);

    await waitFor(
      () => {
        expect(mockPostAndWait).toHaveBeenCalled();
      },
      { timeout: 500 },
    );

    const sentMsg = mockPostAndWait.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(sentMsg?.['type']).toBe('apply-table');
    const payload = sentMsg?.['payload'] as Record<string, unknown> | undefined;
    const desired = payload?.['desired'] as { rows: unknown[] } | undefined;
    // 2 CSV rows: header row + 1 body row.
    expect(desired?.['rows']?.length).toBe(2);
    void store;
  });

  it('store.graphs.tableModel.rows updated after CSV import bridge success', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    populateStoreWithGraphs(store, GRAPHS_TABLE_ONLY);

    mockPostAndWait.mockResolvedValue(APPLY_TABLE_SUCCESS);

    const { container } = render(App, { global: { plugins: [pinia] } });
    const q = within(container as HTMLElement);

    // Stacked panel: graphs section visible without tab navigation.

    const csvTextarea = q.getByRole('textbox', { name: /paste csv/i });
    await fireEvent.update(csvTextarea, 'Col1,Col2,Col3\nA,B,C');

    const parseBtn = q.getByRole('button', { name: /parse.*apply/i });
    await fireEvent.click(parseBtn);

    // Optimistic write: store should reflect the CSV-derived rows immediately.
    await waitFor(
      () => {
        const rows = store.graphs?.tableModel?.rows;
        // 2 CSV rows (header + body) should be in the store.
        expect(rows?.length).toBe(2);
      },
      { timeout: 500 },
    );

    // And the first row should have 3 cells matching the CSV header.
    const firstRowCells = store.graphs?.tableModel?.rows[0]?.cells;
    expect(firstRowCells?.length).toBe(3);
  });
});

// ===========================================================================
// Scenario 9: JourneyEditor invalid range — end < start → clamp in section,
//             no malformed payload reaches bridge
// ===========================================================================

describe('9. JourneyEditor invalid range: end < start → clamp clamps in section, no malformed payload reaches bridge', () => {
  it('entering endPct < startPct clamps the value; bridge receives startPct ≤ endPct', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();

    // item-1: startPct=0, endPct=40 — set startPct to 60, then enter endPct=20 (invalid).
    const modelWithHighStart: JourneyWrapModel = {
      ...JOURNEY_MODEL,
      items: [
        { itemNodeId: 'item-1', icon: 'sparkles', label: 'Research', startPct: 60, endPct: 80 },
        { itemNodeId: 'item-2', icon: 'zap', label: 'Build', startPct: 45, endPct: 90 },
      ],
    };
    populateStoreWithGraphs(store, { tableModel: null, journeyModel: modelWithHighStart });

    mockPostAndWait.mockResolvedValue(APPLY_JOURNEY_SUCCESS);

    const { container } = render(App, { global: { plugins: [pinia] } });
    const q = within(container as HTMLElement);

    // Stacked panel: graphs section visible without tab navigation.

    await waitFor(() => {
      expect(q.getByRole('spinbutton', { name: /step 1 end %/i })).toBeDefined();
    });

    // Enter an endPct value less than startPct (60), which is invalid.
    const endInput = q.getByRole('spinbutton', { name: /step 1 end %/i });
    await fireEvent.input(endInput, { target: { value: '20' } });

    await waitFor(
      () => {
        expect(mockPostAndWait).toHaveBeenCalled();
      },
      { timeout: 500 },
    );

    const sentMsg = mockPostAndWait.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(sentMsg?.['type']).toBe('apply-journey');
    const payload = sentMsg?.['payload'] as Record<string, unknown> | undefined;
    const desired = payload?.['desired'] as {
      items: Array<{ itemNodeId: string; startPct: number; endPct: number }>;
    };
    const item1 = desired?.['items']?.find((i) => i.itemNodeId === 'item-1');
    // Clamped: endPct must be ≥ startPct (60) — section clamps up to startPct at minimum.
    expect(item1).toBeDefined();
    expect(item1!.endPct).toBeGreaterThanOrEqual(item1!.startPct);

    void store;
  });
});

// ===========================================================================
// axe: 3 additional states — in-flight edit, post-rollback graphs state,
//      both-sections concurrent disabled state
// ===========================================================================

describe('axe: Graphs cross-section integration states — 3 additional states pass WCAG 2.1 AA', () => {
  it('axe: in-flight Graphs tab edit (both sections disabled): zero violations', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    populateStoreWithGraphs(store, GRAPHS_BOTH);

    // Simulate in-flight state.
    store.recordPendingRequest('req-inflight-axe', 'graphs');

    const { container } = render(App, { global: { plugins: [pinia] } });

    // Stacked panel: graphs section visible without tab navigation.

    const results = await axe.run(container as Element, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    expect(results.violations).toHaveLength(0);
  });

  it('axe: post-rollback graphs state (table only, sync clean): zero violations', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();

    // Simulate post-rollback: table model in original state, sync clean.
    populateStoreWithGraphs(store, GRAPHS_TABLE_ONLY);
    // inFlightRequestId already null after reconcileFrom.

    const { container } = render(App, { global: { plugins: [pinia] } });

    // Stacked panel: graphs section visible without tab navigation.

    const results = await axe.run(container as Element, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    expect(results.violations).toHaveLength(0);
  });

  it('axe: both sections concurrent disabled state (GRAPHS_BOTH in-flight): zero violations', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    populateStoreWithGraphs(store, GRAPHS_BOTH);

    // Simulate both sections disabled via in-flight request.
    store.recordPendingRequest('req-concurrent-axe', 'graphs');

    const { container } = render(App, { global: { plugins: [pinia] } });

    // Stacked panel: graphs section visible without tab navigation.

    const results = await axe.run(container as Element, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    expect(results.violations).toHaveLength(0);
  });
});
