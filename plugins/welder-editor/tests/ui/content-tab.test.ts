// plugins/welder-editor/tests/ui/content-tab.test.ts
//
// Sprint 3 Task 3.4 — Content tab wiring tests.
//
// Purpose: verify that the Content tab in App.vue correctly composes
// CardList + CardEditor + TimelineEditor and wires their emits to
// useEditorActions.applyCard / applyTimeline.
//
// Design:
//   - Real Pinia store + real section rendering.
//   - usePluginBridge is mocked at module level (same pattern as integration.test.ts).
//   - useEditorActions: applyCard and applyTimeline are spied upon via vi.spyOn
//     AFTER the module is imported so we intercept the real function calls.
//     The underlying bridge.postAndWait is mocked to return success immediately
//     so the async action completes without hanging.
//
// Test cases (≥ 8 required):
//   1. With cards + timeline both populated, both PropertyPanel blocks render.
//   2. With only cards, only the cards block renders (no timeline).
//   3. With only timeline, only the timeline block renders (no cards).
//   4. With both empty, the StatusMessage "No cards or timeline items" shows.
//   5. Selecting a card via CardList emits → CardEditor renders that card's heading.
//   6. CardEditor emits update:heading → useEditorActions.applyCard called with cardNodeId.
//   7. TimelineEditor emits update:itemHeading → useEditorActions.applyTimeline called.
//   8. While sync.inFlightRequestId is set, disabled state propagates to CardList.
//
// axe-clean: checked for all 4 content states (both / cards only / timeline only / empty).
//
// Environment: jsdom (vitest.config.ts environmentMatchGlobs tests/ui/**).
// Cleanup and Pinia bootstrap handled globally by tests/setup.ts.
//
// Owner: ui-engineer. Resolves MON-2893994818 (Sprint 3, Task 3.4).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, within, fireEvent, waitFor } from '@testing-library/vue';
import { createPinia, setActivePinia } from 'pinia';
import axe from 'axe-core';

import App from '../../ui/App.vue';
import { useEditorStore } from '../../ui/stores/useEditorStore.js';
import type { GeneralSections, ContentItems, Message } from '../../shared/messages.js';

// ---------------------------------------------------------------------------
// Bridge mock — same pattern as integration.test.ts
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

const GENERAL_ALL: GeneralSections = {
  titleDescription: {
    copyWrapId: 'cwrap-1',
    heading: 'Slide Heading',
    paragraph: 'Slide paragraph.',
    headingDim: [],
  },
  badge: null,
  image: null,
};

const CARD_A = {
  cardNodeId: 'card-a',
  heading: 'Card A Heading',
  paragraph: 'Card A paragraph.',
  icon: 'sparkles',
  visualHash: undefined,
} as const;

const CARD_B = {
  cardNodeId: 'card-b',
  heading: 'Card B Heading',
  paragraph: 'Card B paragraph.',
  icon: null,
  visualHash: undefined,
} as const;

const TIMELINE_STEP_1 = {
  copyWrapNodeId: 'timeline-1',
  heading: 'Step 1 Heading',
  paragraph: 'Step 1 paragraph.',
} as const;

const TIMELINE_STEP_2 = {
  copyWrapNodeId: 'timeline-2',
  heading: 'Step 2 Heading',
  paragraph: 'Step 2 paragraph.',
} as const;

/** Content with both cards and timeline populated. */
const CONTENT_BOTH: ContentItems = {
  cardWrapId: 'cwrap-content',
  cards: [CARD_A, CARD_B],
  timelineItems: [TIMELINE_STEP_1, TIMELINE_STEP_2],
  journeyModel: null,
};

/** Content with cards only. */
const CONTENT_CARDS_ONLY: ContentItems = {
  cardWrapId: 'cwrap-content',
  cards: [CARD_A, CARD_B],
  timelineItems: [],
  journeyModel: null,
};

/** Content with timeline only. */
const CONTENT_TIMELINE_ONLY: ContentItems = {
  cardWrapId: '',
  cards: [],
  timelineItems: [TIMELINE_STEP_1, TIMELINE_STEP_2],
  journeyModel: null,
};

/** Content loaded but both arrays empty. */
const CONTENT_EMPTY: ContentItems = {
  cardWrapId: '',
  cards: [],
  timelineItems: [],
  journeyModel: null,
};

// ---------------------------------------------------------------------------
// Bridge success stubs (prevents async actions from hanging)
// ---------------------------------------------------------------------------

const APPLY_CARD_SUCCESS = {
  type: 'apply-card:result' as const,
  version: 1 as const,
  payload: { ok: true as const, data: { cardNodeId: 'card-a' } },
  correlationId: 'any',
};

const APPLY_TIMELINE_SUCCESS = {
  type: 'apply-timeline:result' as const,
  version: 1 as const,
  payload: { ok: true as const, data: { copyWrapNodeId: 'timeline-1' } },
  correlationId: 'any',
};

// ---------------------------------------------------------------------------
// Helper: populate store with a slide selected + content loaded
// ---------------------------------------------------------------------------

function populateStoreWithContent(
  store: ReturnType<typeof useEditorStore>,
  content: ContentItems | null,
  general: GeneralSections | null = GENERAL_ALL,
) {
  store.reconcileFrom({
    fileKey: 'file-key-content-tab',
    slides: [{ id: 'slide-1', number: 1, name: 'Slide 1', isSkipped: false }],
    activeSlideId: 'slide-1',
    general,
    content,
    graphs: null,
  });
}

// ---------------------------------------------------------------------------
// Helper: verify Content panel is visible
//
// Sprint 5 Task 5.2 / 5.16: TabStrip removed; stacked UCard panels.
// Content panel is visible as long as content slice is non-null and a slide
// is selected — no tab interaction needed.
// ---------------------------------------------------------------------------

async function switchToContentTab(q: ReturnType<typeof within>) {
  // In the stacked-panel layout, the Content panel is always visible when
  // content is non-null. Wait for the Content panel heading to appear.
  await waitFor(() => {
    const contentHeading = q.queryByRole('heading', { name: /^content$/i });
    if (!contentHeading) {
      // Panel not yet rendered — store reconcile may still be pending.
      throw new Error('Content panel heading not found yet');
    }
  });
}

// ---------------------------------------------------------------------------
// Per-test lifecycle
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockPostAndWait.mockReset();
  mockPost.mockReset();
  // Default: all bridge calls succeed so async actions don't hang.
  mockPostAndWait.mockResolvedValue(APPLY_CARD_SUCCESS);
});

afterEach(() => {
  // nothing extra — tests/setup.ts handles @testing-library/vue cleanup.
});

// ---------------------------------------------------------------------------
// Test case 1: Both cards + timeline → both blocks render
// ---------------------------------------------------------------------------

describe('1. cards + timeline both populated → both PropertyPanel blocks render', () => {
  it('renders a "Cards" section and a "Timeline" section', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    populateStoreWithContent(store, CONTENT_BOTH);

    const { container } = render(App, { global: { plugins: [pinia] } });
    const q = within(container as HTMLElement);

    await switchToContentTab(q);

    // Both PropertyPanel labels should be visible.
    expect(q.getByText('Cards')).toBeDefined();
    expect(q.getByText('Timeline')).toBeDefined();
  });

  it('does not show the empty-state message when both blocks are populated', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    populateStoreWithContent(store, CONTENT_BOTH);

    const { container } = render(App, { global: { plugins: [pinia] } });
    const q = within(container as HTMLElement);

    await switchToContentTab(q);

    expect(q.queryByText(/no cards or timeline items/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Test case 2: Cards only → only cards block renders
// ---------------------------------------------------------------------------

describe('2. cards only → cards block renders, no timeline block', () => {
  it('renders Cards section but not Timeline section', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    populateStoreWithContent(store, CONTENT_CARDS_ONLY);

    const { container } = render(App, { global: { plugins: [pinia] } });
    const q = within(container as HTMLElement);

    await switchToContentTab(q);

    expect(q.getByText('Cards')).toBeDefined();
    expect(q.queryByText('Timeline')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Test case 3: Timeline only → only timeline block renders
// ---------------------------------------------------------------------------

describe('3. timeline only → timeline block renders, no cards block', () => {
  it('renders Timeline section but not Cards section', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    populateStoreWithContent(store, CONTENT_TIMELINE_ONLY);

    const { container } = render(App, { global: { plugins: [pinia] } });
    const q = within(container as HTMLElement);

    await switchToContentTab(q);

    expect(q.getByText('Timeline')).toBeDefined();
    expect(q.queryByText('Cards')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Test case 4: Both empty → StatusMessage shown
// ---------------------------------------------------------------------------

describe('4. content loaded but empty → StatusMessage renders', () => {
  it('shows "No cards or timeline items on this slide" message', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    populateStoreWithContent(store, CONTENT_EMPTY);

    const { container } = render(App, { global: { plugins: [pinia] } });
    const q = within(container as HTMLElement);

    await switchToContentTab(q);

    expect(q.getByText(/no cards or timeline items on this slide/i)).toBeDefined();
  });

  it('does not render Cards or Timeline PropertyPanel when both empty', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    populateStoreWithContent(store, CONTENT_EMPTY);

    const { container } = render(App, { global: { plugins: [pinia] } });
    const q = within(container as HTMLElement);

    await switchToContentTab(q);

    expect(q.queryByText('Cards')).toBeNull();
    expect(q.queryByText('Timeline')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Test case 5: Card select → CardEditor renders the selected card
// ---------------------------------------------------------------------------

describe('5. selecting a card in CardList → CardEditor renders that card', () => {
  it('clicking card-a row opens CardEditor showing Card A heading input', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    // Pass general: null so the General panel (with its own "Heading" textbox) does
    // not render. Without this, getByRole('textbox', { name: /heading/i }) finds both
    // the slide TitleDescriptionEditor heading and the CardEditor heading (ambiguous).
    populateStoreWithContent(store, CONTENT_CARDS_ONLY, null);

    const { container } = render(App, { global: { plugins: [pinia] } });
    const q = within(container as HTMLElement);

    await switchToContentTab(q);

    // Before selection: CardEditor should not be visible.
    // (No card row is selected by default — selectedCardNodeId starts null.)
    // Click Card A's list item.
    const cardAOption = q.getByRole('option', { name: /card a heading/i });
    await fireEvent.click(cardAOption);

    // After selection: CardEditor should render with Card A's heading.
    await waitFor(() => {
      const headingInput = q.getByRole('textbox', { name: /heading/i });
      expect((headingInput as HTMLInputElement).value).toBe('Card A Heading');
    });
  });
});

// ---------------------------------------------------------------------------
// Test case 6: CardEditor update:heading → applyCard called
// ---------------------------------------------------------------------------

describe('6. CardEditor update:heading → useEditorActions.applyCard dispatched', () => {
  it('typing in heading input calls postAndWait with apply-card + cardNodeId', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    // Pass general: null — isolate the Content panel so the only "Heading" textbox is
    // the CardEditor's, preventing getByRole ambiguity with TitleDescriptionEditor.
    populateStoreWithContent(store, CONTENT_CARDS_ONLY, null);

    mockPostAndWait.mockResolvedValue(APPLY_CARD_SUCCESS);

    const { container } = render(App, { global: { plugins: [pinia] } });
    const q = within(container as HTMLElement);

    await switchToContentTab(q);

    // Select card A to open CardEditor.
    const cardAOption = q.getByRole('option', { name: /card a heading/i });
    await fireEvent.click(cardAOption);

    // Wait for CardEditor to mount.
    await waitFor(() => {
      expect(q.getByRole('textbox', { name: /heading/i })).toBeDefined();
    });

    const headingInput = q.getByRole('textbox', { name: /heading/i }) as HTMLInputElement;

    // Clear mock call count from any earlier calls.
    mockPostAndWait.mockClear();
    mockPostAndWait.mockResolvedValue(APPLY_CARD_SUCCESS);

    // Type a new heading value.
    await fireEvent.input(headingInput, { target: { value: 'Updated Card Heading' } });

    // Wait for debounce (TitleDescriptionEditor debounces 300 ms) + dispatch.
    await waitFor(
      () => {
        expect(mockPostAndWait).toHaveBeenCalled();
      },
      { timeout: 500 },
    );

    // Confirm the message type and cardNodeId in the dispatched payload.
    const sentMsg = mockPostAndWait.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(sentMsg?.['type']).toBe('apply-card');
    const payload = sentMsg?.['payload'] as Record<string, unknown> | undefined;
    expect(payload?.['cardNodeId']).toBe('card-a');
    expect(payload?.['heading']).toBe('Updated Card Heading');
  });
});

// ---------------------------------------------------------------------------
// Test case 7: TimelineEditor update:itemHeading → applyTimeline called
// ---------------------------------------------------------------------------

describe('7. TimelineEditor update:itemHeading → useEditorActions.applyTimeline dispatched', () => {
  it('typing in Step 1 heading input calls postAndWait with apply-timeline + copyWrapNodeId', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    // Pass general: null — without this, GENERAL_ALL renders TitleDescriptionEditor whose
    // "Heading" input is the first match of getAllByRole('textbox',{name:/heading/i})[0],
    // so the test edits the slide heading instead of the Step 1 timeline heading.
    populateStoreWithContent(store, CONTENT_TIMELINE_ONLY, null);

    mockPostAndWait.mockResolvedValue(APPLY_TIMELINE_SUCCESS);

    const { container } = render(App, { global: { plugins: [pinia] } });
    const q = within(container as HTMLElement);

    await switchToContentTab(q);

    // Wait for TimelineEditor to render. Multiple heading inputs exist (one per step).
    await waitFor(() => {
      expect(q.getAllByRole('textbox', { name: /heading/i }).length).toBeGreaterThan(0);
    });

    // Get the first heading input — this is Step 1's heading (TimelineItem index 0).
    const headingInputs = q.getAllByRole('textbox', { name: /heading/i });
    const step1HeadingInput = headingInputs[0] as HTMLInputElement;

    mockPostAndWait.mockClear();
    mockPostAndWait.mockResolvedValue(APPLY_TIMELINE_SUCCESS);

    await fireEvent.input(step1HeadingInput, { target: { value: 'Updated Step 1 Heading' } });

    // Wait for debounce (300 ms) + dispatch.
    await waitFor(
      () => {
        expect(mockPostAndWait).toHaveBeenCalled();
      },
      { timeout: 500 },
    );

    const sentMsg = mockPostAndWait.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(sentMsg?.['type']).toBe('apply-timeline');
    const payload = sentMsg?.['payload'] as Record<string, unknown> | undefined;
    expect(payload?.['copyWrapNodeId']).toBe('timeline-1');
    expect(payload?.['heading']).toBe('Updated Step 1 Heading');
  });
});

// ---------------------------------------------------------------------------
// Test case 8: disabled state propagates while inFlightRequestId is set
//
// TabStrip hides inactive tab panels with display:none, which means
// getAllByRole('option') won't find options on the Content tab while the
// General tab is still the selected tab. We check the CardList listbox's
// aria-disabled attribute via container.querySelector (always scans the full
// DOM tree regardless of visibility) to verify the disabled prop is wired.
// ---------------------------------------------------------------------------

describe('8. sync.inFlightRequestId set → disabled propagates to CardList', () => {
  it('listbox aria-disabled="true" when a request is in-flight', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    populateStoreWithContent(store, CONTENT_CARDS_ONLY);

    // Mark a request as in-flight so sectionsDisabled = true.
    store.recordPendingRequest('req-123', 'content');

    const { container } = render(App, { global: { plugins: [pinia] } });
    const q = within(container as HTMLElement);

    await switchToContentTab(q);

    // CardList renders ul[role="listbox"] with aria-disabled="true" when disabled.
    // querySelector searches the full DOM tree (including display:none panels).
    const listbox = container.querySelector('[role="listbox"]') as HTMLElement | null;
    expect(listbox).not.toBeNull();
    expect(listbox!.getAttribute('aria-disabled')).toBe('true');
  });

  it('listbox aria-disabled is absent when no request is in-flight', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    populateStoreWithContent(store, CONTENT_CARDS_ONLY);

    // No request in-flight; sectionsDisabled = false.
    expect(store.sync.inFlightRequestId).toBeNull();

    const { container } = render(App, { global: { plugins: [pinia] } });
    const q = within(container as HTMLElement);

    await switchToContentTab(q);

    const listbox = container.querySelector('[role="listbox"]') as HTMLElement | null;
    expect(listbox).not.toBeNull();
    // When not disabled, aria-disabled attribute is absent (undefined → not set).
    expect(listbox!.getAttribute('aria-disabled')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// axe accessibility scans — all 4 content states
// ---------------------------------------------------------------------------

describe('axe: Content tab — all 4 states pass WCAG 2.1 AA', () => {
  async function runAxeOnContentTab(content: ContentItems | null): Promise<axe.AxeResults> {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    populateStoreWithContent(store, content);

    const { container } = render(App, { global: { plugins: [pinia] } });
    const q = within(container as HTMLElement);

    await switchToContentTab(q);

    return axe.run(container as Element, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
  }

  it('both cards + timeline populated: zero axe violations', async () => {
    const results = await runAxeOnContentTab(CONTENT_BOTH);
    expect(results.violations).toHaveLength(0);
  });

  it('cards only: zero axe violations', async () => {
    const results = await runAxeOnContentTab(CONTENT_CARDS_ONLY);
    expect(results.violations).toHaveLength(0);
  });

  it('timeline only: zero axe violations', async () => {
    const results = await runAxeOnContentTab(CONTENT_TIMELINE_ONLY);
    expect(results.violations).toHaveLength(0);
  });

  it('both empty (StatusMessage): zero axe violations', async () => {
    const results = await runAxeOnContentTab(CONTENT_EMPTY);
    expect(results.violations).toHaveLength(0);
  });
});
