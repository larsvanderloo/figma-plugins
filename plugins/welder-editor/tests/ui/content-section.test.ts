// plugins/welder-editor/tests/ui/content-section.test.ts
//
// Sprint 5 Wave 2 (was: content-tab.test.ts — Sprint 3 Task 3.4).
//
// Structural change from Sprint 3:
//   - No TabStrip. No role="tab" queries. No switchToContentTab helper.
//   - Content card renders automatically when content.cards.length > 0 or
//     content.timelineItems.length > 0.
//   - Empty state uses UAlert description text.
//
// Test cases (preserved from Sprint 3):
//   1. cards + timeline both populated, both PropertyPanel blocks render.
//   2. cards only, cards block renders (no timeline).
//   3. timeline only, timeline block renders (no cards).
//   4. both empty, UAlert "No cards or timeline items" shows.
//   5. selecting card via CardList → CardEditor renders heading.
//   6. CardEditor update:heading → applyCard called.
//   7. TimelineEditor update:itemHeading → applyTimeline called.
//   8. inFlightRequestId set → disabled propagates to CardList.
//   + axe scans for all 4 states.
//
// Owner: ui-engineer. Resolves MON-2894436938.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, within, fireEvent, waitFor } from '@testing-library/vue';
import { createPinia, setActivePinia } from 'pinia';
import axe from 'axe-core';

import App from '../../ui/App.vue';
import { useEditorStore } from '../../ui/stores/useEditorStore.js';
import type { GeneralSections, ContentItems, Message } from '../../shared/messages.js';

const mockPostAndWait = vi.fn();
const mockPost = vi.fn();

vi.mock('../../ui/composables/usePluginBridge.js', () => ({
  usePluginBridge: () => ({
    post: mockPost,
    postAndWait: mockPostAndWait,
    onMessage: (_handler: (msg: Message) => void) => () => undefined,
  }),
}));

// Use a general fixture WITHOUT titleDescription to avoid competing heading
// textboxes when CardEditor also renders a heading input. With stacked panels,
// both sections are simultaneously visible.
const GENERAL_ALL: GeneralSections = {
  titleDescription: null,
  badge: { badgeNodeId: 'badge-1', label: 'Q4', icon: 'sparkles' },
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

const CONTENT_BOTH: ContentItems = {
  cardWrapId: 'cwrap-content',
  cards: [CARD_A, CARD_B],
  timelineItems: [TIMELINE_STEP_1, TIMELINE_STEP_2],
  journeyModel: null,
};
const CONTENT_CARDS_ONLY: ContentItems = {
  cardWrapId: 'cwrap-content',
  cards: [CARD_A, CARD_B],
  timelineItems: [],
  journeyModel: null,
};
const CONTENT_TIMELINE_ONLY: ContentItems = {
  cardWrapId: '',
  cards: [],
  timelineItems: [TIMELINE_STEP_1, TIMELINE_STEP_2],
  journeyModel: null,
};
const CONTENT_EMPTY: ContentItems = {
  cardWrapId: '',
  cards: [],
  timelineItems: [],
  journeyModel: null,
};

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

function populateStoreWithContent(
  store: ReturnType<typeof useEditorStore>,
  content: ContentItems | null,
  general: GeneralSections | null = GENERAL_ALL,
) {
  store.reconcileFrom({
    fileKey: 'file-key-content-section',
    slides: [{ id: 'slide-1', number: 1, name: 'Slide 1', isSkipped: false }],
    activeSlideId: 'slide-1',
    general,
    content,
    graphs: null,
  });
}

beforeEach(() => {
  mockPostAndWait.mockReset();
  mockPost.mockReset();
  mockPostAndWait.mockResolvedValue(APPLY_CARD_SUCCESS);
});

describe('1. cards + timeline both populated', () => {
  it('renders Cards and Timeline sections', () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    populateStoreWithContent(store, CONTENT_BOTH);
    const { container } = render(App, { global: { plugins: [pinia] } });
    const q = within(container as HTMLElement);
    expect(q.getByText('Cards')).toBeDefined();
    expect(q.getByText('Timeline')).toBeDefined();
  });
  it('does not show empty-state message', () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    populateStoreWithContent(store, CONTENT_BOTH);
    const { container } = render(App, { global: { plugins: [pinia] } });
    const q = within(container as HTMLElement);
    expect(q.queryByText(/no cards or timeline items/i)).toBeNull();
  });
});

describe('2. cards only', () => {
  it('renders Cards section, not Timeline', () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    populateStoreWithContent(store, CONTENT_CARDS_ONLY);
    const { container } = render(App, { global: { plugins: [pinia] } });
    const q = within(container as HTMLElement);
    expect(q.getByText('Cards')).toBeDefined();
    expect(q.queryByText('Timeline')).toBeNull();
  });
});

describe('3. timeline only', () => {
  it('renders Timeline section, not Cards', () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    populateStoreWithContent(store, CONTENT_TIMELINE_ONLY);
    const { container } = render(App, { global: { plugins: [pinia] } });
    const q = within(container as HTMLElement);
    expect(q.getByText('Timeline')).toBeDefined();
    expect(q.queryByText('Cards')).toBeNull();
  });
});

describe('4. content loaded but empty → UAlert renders', () => {
  it('shows no-cards message', () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    populateStoreWithContent(store, CONTENT_EMPTY);
    const { container } = render(App, { global: { plugins: [pinia] } });
    const q = within(container as HTMLElement);
    expect(q.getByText(/no cards or timeline items on this slide/i)).toBeDefined();
  });
  it('no Cards or Timeline labels when empty', () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    populateStoreWithContent(store, CONTENT_EMPTY);
    const { container } = render(App, { global: { plugins: [pinia] } });
    const q = within(container as HTMLElement);
    expect(q.queryByText('Cards')).toBeNull();
    expect(q.queryByText('Timeline')).toBeNull();
  });
});

describe('5. card select → CardEditor renders', () => {
  it('clicking card-a shows CardEditor with Card A heading', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    populateStoreWithContent(store, CONTENT_CARDS_ONLY);
    const { container } = render(App, { global: { plugins: [pinia] } });
    const q = within(container as HTMLElement);
    const cardAOption = q.getByRole('option', { name: /card a heading/i });
    await fireEvent.click(cardAOption);
    await waitFor(() => {
      const hi = q.getByRole('textbox', { name: /heading/i });
      expect((hi as HTMLInputElement).value).toBe('Card A Heading');
    });
  });
});

describe('6. CardEditor update:heading → applyCard dispatched', () => {
  it('typing new heading calls postAndWait with apply-card', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    populateStoreWithContent(store, CONTENT_CARDS_ONLY);
    mockPostAndWait.mockResolvedValue(APPLY_CARD_SUCCESS);
    const { container } = render(App, { global: { plugins: [pinia] } });
    const q = within(container as HTMLElement);
    const cardAOption = q.getByRole('option', { name: /card a heading/i });
    await fireEvent.click(cardAOption);
    await waitFor(() => {
      expect(q.getByRole('textbox', { name: /heading/i })).toBeDefined();
    });
    const hi = q.getByRole('textbox', { name: /heading/i }) as HTMLInputElement;
    mockPostAndWait.mockClear();
    mockPostAndWait.mockResolvedValue(APPLY_CARD_SUCCESS);
    await fireEvent.input(hi, { target: { value: 'Updated Card Heading' } });
    await waitFor(
      () => {
        expect(mockPostAndWait).toHaveBeenCalled();
      },
      { timeout: 500 },
    );
    const sentMsg = mockPostAndWait.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(sentMsg?.['type']).toBe('apply-card');
    const payload = sentMsg?.['payload'] as Record<string, unknown> | undefined;
    expect(payload?.['cardNodeId']).toBe('card-a');
    expect(payload?.['heading']).toBe('Updated Card Heading');
  });
});

describe('7. TimelineEditor update:itemHeading → applyTimeline dispatched', () => {
  it('typing Step 1 heading calls postAndWait with apply-timeline', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    populateStoreWithContent(store, CONTENT_TIMELINE_ONLY);
    mockPostAndWait.mockResolvedValue(APPLY_TIMELINE_SUCCESS);
    const { container } = render(App, { global: { plugins: [pinia] } });
    const q = within(container as HTMLElement);
    await waitFor(() => {
      expect(q.getAllByRole('textbox', { name: /heading/i }).length).toBeGreaterThan(0);
    });
    const step1hi = q.getAllByRole('textbox', { name: /heading/i })[0] as HTMLInputElement;
    mockPostAndWait.mockClear();
    mockPostAndWait.mockResolvedValue(APPLY_TIMELINE_SUCCESS);
    await fireEvent.input(step1hi, { target: { value: 'Updated Step 1 Heading' } });
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

describe('8. sync.inFlightRequestId set → disabled propagates', () => {
  it('listbox aria-disabled=true when in-flight', () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    populateStoreWithContent(store, CONTENT_CARDS_ONLY);
    store.recordPendingRequest('req-123', 'content');
    const { container } = render(App, { global: { plugins: [pinia] } });
    const listbox = container.querySelector('[role=listbox]') as HTMLElement | null;
    expect(listbox).not.toBeNull();
    expect(listbox!.getAttribute('aria-disabled')).toBe('true');
  });
  it('listbox aria-disabled absent when idle', () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    populateStoreWithContent(store, CONTENT_CARDS_ONLY);
    expect(store.sync.inFlightRequestId).toBeNull();
    const { container } = render(App, { global: { plugins: [pinia] } });
    const listbox = container.querySelector('[role=listbox]') as HTMLElement | null;
    expect(listbox).not.toBeNull();
    expect(listbox!.getAttribute('aria-disabled')).toBeNull();
  });
});

describe('axe: Content section — 4 states', () => {
  async function runAxe(content: ContentItems | null) {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useEditorStore();
    populateStoreWithContent(store, content);
    const { container } = render(App, { global: { plugins: [pinia] } });
    return axe.run(container as Element, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
  }
  it('both cards + timeline: zero violations', async () => {
    const r = await runAxe(CONTENT_BOTH);
    expect(r.violations).toHaveLength(0);
  });
  it('cards only: zero violations', async () => {
    const r = await runAxe(CONTENT_CARDS_ONLY);
    expect(r.violations).toHaveLength(0);
  });
  it('timeline only: zero violations', async () => {
    const r = await runAxe(CONTENT_TIMELINE_ONLY);
    expect(r.violations).toHaveLength(0);
  });
  it('both empty: zero violations', async () => {
    const r = await runAxe(CONTENT_EMPTY);
    expect(r.violations).toHaveLength(0);
  });
});
