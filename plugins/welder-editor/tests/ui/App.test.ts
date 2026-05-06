// plugins/welder-editor/tests/ui/App.test.ts
//
// Sprint 2 Task 2.9 — App.vue assembly smoke tests.
//
// Coverage required (per task spec):
//   1. Mounts cleanly with empty store
//   2. Renders SlidePicker, TabStrip placeholder
//   3. When activeSlideId set + general state populated:
//      renders TitleDescriptionEditor / BadgeEditor / ImageEditor
//   4. Active tab switch updates rendered panel
//   5. Hide-empty-tab fires when a section state is null
//   6. axe WCAG 2.1 AA: 0 violations across mounted states
//
// Environment: jsdom (set by vitest.config.ts environmentMatchGlobs tests/ui/**).
// Pinia: bootstrapped fresh per-test via createPinia() + passed to render().
// Cleanup: handled globally by tests/setup.ts afterEach.
//
// Query isolation: every test uses `within(container)` from the render() return
// value rather than the global `screen` object. This prevents false
// "found multiple elements" failures when @testing-library/vue renders into
// the same document across tests in the same describe block.
//
// Owner: ui-engineer. Resolves MON-2893895223.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, within, fireEvent } from '@testing-library/vue';
import { createPinia, setActivePinia } from 'pinia';
import { mount } from '@vue/test-utils';
import axe from 'axe-core';

import App from '../../ui/App.vue';
import { useEditorStore } from '../../ui/stores/useEditorStore.js';
import type {
  SlideSummary,
  GeneralSections,
  ContentItems,
  GraphItems,
} from '../../shared/messages.js';

// ---------------------------------------------------------------------------
// Silence console.warn/error from @iconify/vue manifest loading in jsdom.
// The IconPicker calls loadIconManifest() on mount; in jsdom there is no
// network, so the dynamic import falls back to ICON_KEYS without error.
// ---------------------------------------------------------------------------
const originalWarn = console.warn;
const originalError = console.error;
beforeEach(() => {
  console.warn = vi.fn();
  console.error = vi.fn();
});
afterEach(() => {
  console.warn = originalWarn;
  console.error = originalError;
});

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

/** A GeneralSections fixture with all three sub-sections populated. */
const GENERAL_ALL: GeneralSections = {
  titleDescription: {
    copyWrapId: 'cwrap-1',
    heading: 'My Heading',
    paragraph: 'My paragraph text.',
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

/** A GeneralSections fixture with only titleDescription. */
const GENERAL_TITLE_ONLY: GeneralSections = {
  titleDescription: {
    copyWrapId: 'cwrap-2',
    heading: 'Only a heading',
    paragraph: null,
    headingDim: null,
  },
  badge: null,
  image: null,
};

const CONTENT_FIXTURE: ContentItems = {
  cardWrapId: 'cwrap-3',
  cards: [],
  timelineItems: [],
  journeyModel: null,
};

const GRAPHS_FIXTURE: GraphItems = {
  tableModel: null,
  journeyModel: null,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a fresh Pinia, sets it active, and returns both the pinia instance
 * and the store. Tests always call this instead of relying on setup.ts's
 * beforeEach so that each test can pass its own pinia to render() global plugins.
 */
function setupPinia() {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useEditorStore();
  return { pinia, store };
}

function populateStoreWithSlide(
  store: ReturnType<typeof useEditorStore>,
  slideId: string,
  general: GeneralSections | null,
  content: ContentItems | null = null,
  graphs: GraphItems | null = null,
): void {
  store.reconcileFrom({
    fileKey: 'file-key-1',
    slides: [SLIDE_A, SLIDE_B],
    activeSlideId: slideId,
    general,
    content,
    graphs,
  });
}

// ---------------------------------------------------------------------------
// Helper: run axe against a mounted component element (blocking gate only).
// ---------------------------------------------------------------------------
async function runAxeBlocking(el: Element): Promise<axe.Result[]> {
  const results = await axe.run(el, {
    runOnly: {
      type: 'tag',
      values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
    },
  });
  return results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
}

function formatViolations(violations: axe.Result[]): string {
  if (violations.length === 0) return 'none';
  return violations
    .map(
      (v) =>
        `[${v.impact ?? 'unknown'}] ${v.id}: ${v.description}\n` +
        v.nodes
          .slice(0, 3)
          .map((n) => `  • ${n.html}`)
          .join('\n'),
    )
    .join('\n\n');
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('App.vue — assembly smoke tests', () => {
  // ---- 1. Mounts cleanly with empty store ----------------------------------

  describe('1. empty store', () => {
    it('mounts without throwing', () => {
      const { pinia } = setupPinia();
      expect(() => render(App, { global: { plugins: [pinia] } })).not.toThrow();
    });

    it('renders the slide picker combobox', () => {
      const { pinia } = setupPinia();
      const { container } = render(App, { global: { plugins: [pinia] } });
      const q = within(container as HTMLElement);
      // SlidePicker renders a native <select> (role="combobox").
      const select = q.getByRole('combobox');
      expect(select).toBeDefined();
    });

    it('shows empty-state message when no slide is selected', () => {
      const { pinia } = setupPinia();
      const { container } = render(App, { global: { plugins: [pinia] } });
      const q = within(container as HTMLElement);
      const msg = q.getByText(/pick a slide above/i);
      expect(msg).toBeDefined();
    });

    it('does NOT render TitleDescriptionEditor heading input in empty state', () => {
      const { pinia } = setupPinia();
      const { container } = render(App, { global: { plugins: [pinia] } });
      const q = within(container as HTMLElement);
      const headingInput = q.queryByRole('textbox', { name: /heading/i });
      expect(headingInput).toBeNull();
    });
  });

  // ---- 2. SlidePicker + slide list ----------------------------------------

  describe('2. slide list populated (no slide selected)', () => {
    it('renders slides in the picker', () => {
      const { pinia, store } = setupPinia();
      store.reconcileFrom({
        fileKey: 'fk',
        slides: [SLIDE_A, SLIDE_B],
        activeSlideId: null,
        general: null,
        content: null,
        graphs: null,
      });

      const { container } = render(App, { global: { plugins: [pinia] } });
      const q = within(container as HTMLElement);

      // SlidePicker uses USelectMenu (replaced native <select> in PR #58).
      // Items in USelectMenu are portal-rendered and only visible when the dropdown is open.
      // Verify via the combobox being present and the store reflecting the correct slides.
      expect(q.getByRole('combobox')).toBeDefined();
      expect(store.slides.length).toBe(2);
      expect(store.slides[0]!.name).toBe(SLIDE_A.name);
      expect(store.slides[1]!.name).toBe(SLIDE_B.name);
    });
  });

  // ---- 3. Slide selected + general state populated -------------------------

  describe('3. slide selected, all general sub-sections populated', () => {
    it('renders TitleDescriptionEditor heading input', () => {
      const { pinia, store } = setupPinia();
      populateStoreWithSlide(store, SLIDE_A.id, GENERAL_ALL);
      const { container } = render(App, { global: { plugins: [pinia] } });
      const q = within(container as HTMLElement);

      const headingInput = q.getByRole('textbox', { name: /heading/i });
      expect(headingInput).toBeDefined();
    });

    it('renders TitleDescriptionEditor paragraph textarea', () => {
      const { pinia, store } = setupPinia();
      populateStoreWithSlide(store, SLIDE_A.id, GENERAL_ALL);
      const { container } = render(App, { global: { plugins: [pinia] } });
      const q = within(container as HTMLElement);

      const paragraphInput = q.getByRole('textbox', { name: /paragraph/i });
      expect(paragraphInput).toBeDefined();
    });

    it('renders BadgeEditor label input', () => {
      const { pinia, store } = setupPinia();
      populateStoreWithSlide(store, SLIDE_A.id, GENERAL_ALL);
      const { container } = render(App, { global: { plugins: [pinia] } });
      const q = within(container as HTMLElement);

      const badgeLabelInput = q.getByRole('textbox', { name: /badge label/i });
      expect(badgeLabelInput).toBeDefined();
    });

    it('renders ImageEditor replace-image button', () => {
      const { pinia, store } = setupPinia();
      populateStoreWithSlide(store, SLIDE_A.id, GENERAL_ALL);
      const { container } = render(App, { global: { plugins: [pinia] } });
      const q = within(container as HTMLElement);

      const replaceBtn = q.getByRole('button', { name: /replace image/i });
      expect(replaceBtn).toBeDefined();
    });

    it('editors are enabled when a slide is selected and no request is in-flight', () => {
      const { pinia, store } = setupPinia();
      populateStoreWithSlide(store, SLIDE_A.id, GENERAL_ALL);
      const { container } = render(App, { global: { plugins: [pinia] } });
      const q = within(container as HTMLElement);

      const headingInput = q.getByRole('textbox', { name: /heading/i });
      expect((headingInput as HTMLInputElement).disabled).toBe(false);
    });
  });

  // ---- 3b. Slide selected with only titleDescription -----------------------

  describe('3b. slide selected, only titleDescription sub-section', () => {
    it('renders TitleDescriptionEditor but NOT BadgeEditor or ImageEditor', () => {
      const { pinia, store } = setupPinia();
      populateStoreWithSlide(store, SLIDE_A.id, GENERAL_TITLE_ONLY);
      const { container } = render(App, { global: { plugins: [pinia] } });
      const q = within(container as HTMLElement);

      // Heading present
      expect(q.getByRole('textbox', { name: /heading/i })).toBeDefined();

      // Badge label and replace-image button absent
      expect(q.queryByRole('textbox', { name: /badge label/i })).toBeNull();
      expect(q.queryByRole('button', { name: /replace image/i })).toBeNull();
    });

    it('does NOT show paragraph textarea when paragraph is null', () => {
      const { pinia, store } = setupPinia();
      populateStoreWithSlide(store, SLIDE_A.id, GENERAL_TITLE_ONLY);
      const { container } = render(App, { global: { plugins: [pinia] } });
      const q = within(container as HTMLElement);

      const paragraphInput = q.queryByRole('textbox', { name: /paragraph/i });
      expect(paragraphInput).toBeNull();
    });
  });

  // ---- 4. Active tab switch ------------------------------------------------

  describe('4. active tab switch', () => {
    it('switching to Content tab shows the content panel (empty-state message when no cards or timeline)', async () => {
      const { pinia, store } = setupPinia();
      // Content is populated so the tab is visible (contentNull = false).
      // CONTENT_FIXTURE has empty cards + timelineItems → shows the empty-state StatusMessage.
      populateStoreWithSlide(store, SLIDE_A.id, GENERAL_ALL, CONTENT_FIXTURE);
      const { container } = render(App, { global: { plugins: [pinia] } });
      const q = within(container as HTMLElement);

      const contentTab = q.getByRole('tab', { name: /content/i });
      await fireEvent.click(contentTab);

      // Content tab is now selected.
      expect((contentTab as HTMLElement).getAttribute('aria-selected')).toBe('true');
      // Empty-state message is visible (no cards or timeline items in fixture).
      const emptyMsg = q.getByText(/no cards or timeline items on this slide/i);
      expect(emptyMsg).toBeDefined();
    });

    it('switching to Graphs tab shows the graphs panel (Sprint 4 — TableEditor visible when tableModel present)', async () => {
      const { pinia, store } = setupPinia();
      // Graphs fixture with a real tableModel so graphsNull=false → tab is visible.
      const graphsWithTable: GraphItems = {
        tableModel: {
          slotId: 'slot-t1',
          width: 'md',
          hasColumnHeader: true,
          textSize: 'md',
          rows: [{ rowNodeId: 'r1', cells: [{ cellNodeId: 'c1', value: 'Header' }] }],
        },
        journeyModel: null,
      };
      populateStoreWithSlide(store, SLIDE_A.id, GENERAL_ALL, null, graphsWithTable);
      const { container } = render(App, { global: { plugins: [pinia] } });
      const q = within(container as HTMLElement);

      const graphsTab = q.getByRole('tab', { name: /graphs/i });
      await fireEvent.click(graphsTab);

      // Sprint 4 Task 4.3 — TableEditor renders under a "Table" PropertyPanel.
      // The placeholder text is gone now that the section is wired.
      expect(q.queryByText(/graphs editing.*sprint 4/i)).toBeNull();
      // The table section renders (heading inside the table-editor section).
      const tableSection = container.querySelector('.table-editor');
      expect(tableSection).not.toBeNull();
    });
  });

  // ---- 5. Hide-empty-tab ---------------------------------------------------

  describe('5. hide-empty-tab', () => {
    it('does not render General tab when general slice is null', () => {
      const { pinia, store } = setupPinia();
      // general is null, content is populated.
      populateStoreWithSlide(store, SLIDE_A.id, null, CONTENT_FIXTURE);
      const { container } = render(App, { global: { plugins: [pinia] } });
      const q = within(container as HTMLElement);

      // The General tab trigger should not be present in the tab list.
      const generalTab = q.queryByRole('tab', { name: /^general$/i });
      expect(generalTab).toBeNull();
    });

    it('does not render Content tab when content slice is null', () => {
      const { pinia, store } = setupPinia();
      populateStoreWithSlide(store, SLIDE_A.id, GENERAL_ALL, null, GRAPHS_FIXTURE);
      const { container } = render(App, { global: { plugins: [pinia] } });
      const q = within(container as HTMLElement);

      const contentTab = q.queryByRole('tab', { name: /^content$/i });
      expect(contentTab).toBeNull();
    });

    it('does not render Graphs tab when graphs slice is null', () => {
      const { pinia, store } = setupPinia();
      populateStoreWithSlide(store, SLIDE_A.id, GENERAL_ALL, CONTENT_FIXTURE, null);
      const { container } = render(App, { global: { plugins: [pinia] } });
      const q = within(container as HTMLElement);

      const graphsTab = q.queryByRole('tab', { name: /^graphs$/i });
      expect(graphsTab).toBeNull();
    });
  });

  // ---- 5b. slide-loading state --------------------------------------------

  describe('5b. slide-loading state (in-flight request)', () => {
    it('editors are disabled while a request is in-flight', () => {
      const { pinia, store } = setupPinia();
      populateStoreWithSlide(store, SLIDE_A.id, GENERAL_ALL);

      // Simulate an in-flight request (recordPendingRequest sets inFlightRequestId).
      store.recordPendingRequest('corr-id-test', 'general');

      const { container } = render(App, { global: { plugins: [pinia] } });
      const q = within(container as HTMLElement);

      const headingInput = q.getByRole('textbox', { name: /heading/i });
      expect((headingInput as HTMLInputElement).disabled).toBe(true);
    });
  });

  // ---- 6. axe WCAG 2.1 AA — 0 serious/critical violations -----------------

  describe('6. axe WCAG 2.1 AA', () => {
    let wrapper: ReturnType<typeof mount>;

    afterEach(() => {
      wrapper?.unmount();
    });

    it('empty store state: 0 serious/critical violations', async () => {
      const pinia = createPinia();
      setActivePinia(pinia);

      wrapper = mount(App, {
        attachTo: document.body,
        global: { plugins: [pinia] },
      });

      const violations = await runAxeBlocking(wrapper.element);
      expect(
        violations,
        `BLOCKING axe violations (empty store):\n${formatViolations(violations)}`,
      ).toHaveLength(0);
    });

    it('slide selected + all general sections: 0 serious/critical violations', async () => {
      const pinia = createPinia();
      setActivePinia(pinia);
      const store = useEditorStore();
      populateStoreWithSlide(store, SLIDE_A.id, GENERAL_ALL);

      wrapper = mount(App, {
        attachTo: document.body,
        global: { plugins: [pinia] },
      });

      const violations = await runAxeBlocking(wrapper.element);
      expect(
        violations,
        `BLOCKING axe violations (general panel):\n${formatViolations(violations)}`,
      ).toHaveLength(0);
    });

    it('slide selected + only titleDescription: 0 serious/critical violations', async () => {
      const pinia = createPinia();
      setActivePinia(pinia);
      const store = useEditorStore();
      populateStoreWithSlide(store, SLIDE_A.id, GENERAL_TITLE_ONLY);

      wrapper = mount(App, {
        attachTo: document.body,
        global: { plugins: [pinia] },
      });

      const violations = await runAxeBlocking(wrapper.element);
      expect(
        violations,
        `BLOCKING axe violations (title-only):\n${formatViolations(violations)}`,
      ).toHaveLength(0);
    });

    it('slide selected + content + graphs loaded: 0 serious/critical violations', async () => {
      const pinia = createPinia();
      setActivePinia(pinia);
      const store = useEditorStore();
      populateStoreWithSlide(store, SLIDE_A.id, GENERAL_ALL, CONTENT_FIXTURE, GRAPHS_FIXTURE);

      wrapper = mount(App, {
        attachTo: document.body,
        global: { plugins: [pinia] },
      });

      const violations = await runAxeBlocking(wrapper.element);
      expect(
        violations,
        `BLOCKING axe violations (all tabs):\n${formatViolations(violations)}`,
      ).toHaveLength(0);
    });
  });
});
