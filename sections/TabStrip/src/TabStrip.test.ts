// TabStrip.test.ts
//
// Tests for sections/TabStrip/src/TabStrip.vue.
//
// Coverage:
//   - All three tabs visible when all slices are non-null.
//   - General tab hidden when generalNull=true.
//   - Content tab hidden when contentNull=true.
//   - Graphs tab hidden when graphsNull=true.
//   - Active tab auto-switches to the first non-hidden tab when the active
//     tab becomes hidden (modelValue changed by emitted event).
//   - Clicking a visible tab emits update:modelValue with the correct TabId.
//   - Active tab has aria-selected="true"; others have aria-selected="false".
//   - Tabpanel for the active tab is not hidden; others have [hidden].
//   - Arrow-key keyboard navigation emits the correct tab.
//   - axe: zero WCAG 2.1 AA violations.
//
// Mutation discipline: no Pinia store — TabStrip is purely prop-driven.

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/vue';
import axe from 'axe-core';
import TabStrip from './TabStrip.vue';
import type { TabId } from './TabStrip.vue';

// ---------------------------------------------------------------------------
// Cleanup DOM after each test
// ---------------------------------------------------------------------------
beforeEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getTabByName(name: string): HTMLElement | null {
  return screen.queryByRole('tab', { name });
}

function getEmittedTabIds(emitted: Record<string, unknown[]>): TabId[] {
  const raw = emitted['update:modelValue'] as TabId[][] | undefined;
  if (!raw) return [];
  const result: TabId[] = [];
  for (const args of raw) {
    const first = args[0];
    if (first !== undefined) result.push(first);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Visibility
// ---------------------------------------------------------------------------

describe('TabStrip — tab visibility', () => {
  it('shows all three tabs when all slices are non-null', () => {
    render(TabStrip, {
      props: { modelValue: 'general', generalNull: false, contentNull: false, graphsNull: false },
    });

    expect(getTabByName('General')).toBeTruthy();
    expect(getTabByName('Content')).toBeTruthy();
    expect(getTabByName('Graphs')).toBeTruthy();
  });

  it('hides the General tab when generalNull=true', () => {
    render(TabStrip, {
      props: { modelValue: 'content', generalNull: true, contentNull: false, graphsNull: false },
    });

    expect(getTabByName('General')).toBeNull();
    expect(getTabByName('Content')).toBeTruthy();
    expect(getTabByName('Graphs')).toBeTruthy();
  });

  it('hides the Content tab when contentNull=true', () => {
    render(TabStrip, {
      props: { modelValue: 'general', generalNull: false, contentNull: true, graphsNull: false },
    });

    expect(getTabByName('General')).toBeTruthy();
    expect(getTabByName('Content')).toBeNull();
    expect(getTabByName('Graphs')).toBeTruthy();
  });

  it('hides the Graphs tab when graphsNull=true', () => {
    render(TabStrip, {
      props: { modelValue: 'general', generalNull: false, contentNull: false, graphsNull: true },
    });

    expect(getTabByName('General')).toBeTruthy();
    expect(getTabByName('Content')).toBeTruthy();
    expect(getTabByName('Graphs')).toBeNull();
  });

  it('renders no tablist when all slices are null', () => {
    render(TabStrip, {
      props: { modelValue: 'general', generalNull: true, contentNull: true, graphsNull: true },
    });

    expect(screen.queryByRole('tablist')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Auto-switch: active tab becomes hidden
// ---------------------------------------------------------------------------

describe('TabStrip — auto-switch when active tab is hidden', () => {
  it('emits "content" (first non-null) when general becomes null while active', async () => {
    const { emitted, rerender } = render(TabStrip, {
      props: { modelValue: 'general', generalNull: false, contentNull: false, graphsNull: false },
    });

    await rerender({
      modelValue: 'general',
      generalNull: true,
      contentNull: false,
      graphsNull: false,
    });

    const ids = getEmittedTabIds(emitted());
    expect(ids.at(-1)).toBe('content');
  });

  it('emits "graphs" when only graphs remains visible', async () => {
    const { emitted, rerender } = render(TabStrip, {
      props: { modelValue: 'general', generalNull: false, contentNull: false, graphsNull: false },
    });

    await rerender({
      modelValue: 'general',
      generalNull: true,
      contentNull: true,
      graphsNull: false,
    });

    const ids = getEmittedTabIds(emitted());
    expect(ids.at(-1)).toBe('graphs');
  });

  it('emits nothing when all tabs become null (no fallback available)', async () => {
    const { emitted, rerender } = render(TabStrip, {
      props: { modelValue: 'general', generalNull: false, contentNull: false, graphsNull: false },
    });

    await rerender({
      modelValue: 'general',
      generalNull: true,
      contentNull: true,
      graphsNull: true,
    });

    // No visible tab to fall back to — no emit.
    const ids = getEmittedTabIds(emitted());
    expect(ids).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Click dispatches correct action
// ---------------------------------------------------------------------------

describe('TabStrip — tab click', () => {
  it('emits update:modelValue with the clicked tab id', async () => {
    const { emitted } = render(TabStrip, {
      props: { modelValue: 'general', generalNull: false, contentNull: false, graphsNull: false },
    });

    await fireEvent.click(screen.getByRole('tab', { name: 'Content' }));

    const ids = getEmittedTabIds(emitted());
    expect(ids.at(-1)).toBe('content');
  });

  it('emits "graphs" when Graphs tab is clicked', async () => {
    const { emitted } = render(TabStrip, {
      props: { modelValue: 'general', generalNull: false, contentNull: false, graphsNull: false },
    });

    await fireEvent.click(screen.getByRole('tab', { name: 'Graphs' }));

    const ids = getEmittedTabIds(emitted());
    expect(ids.at(-1)).toBe('graphs');
  });

  it('does not emit when clicking the already-active tab', async () => {
    const { emitted } = render(TabStrip, {
      props: { modelValue: 'general', generalNull: false, contentNull: false, graphsNull: false },
    });

    await fireEvent.click(screen.getByRole('tab', { name: 'General' }));

    expect(getEmittedTabIds(emitted())).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// ARIA attributes
// ---------------------------------------------------------------------------

describe('TabStrip — ARIA semantics', () => {
  it('sets aria-selected="true" only on the active tab', () => {
    render(TabStrip, {
      props: { modelValue: 'content', generalNull: false, contentNull: false, graphsNull: false },
    });

    expect(screen.getByRole('tab', { name: 'General' }).getAttribute('aria-selected')).toBe(
      'false',
    );
    expect(screen.getByRole('tab', { name: 'Content' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: 'Graphs' }).getAttribute('aria-selected')).toBe('false');
  });

  it('active tab has tabindex="0"; others have tabindex="-1"', () => {
    render(TabStrip, {
      props: { modelValue: 'graphs', generalNull: false, contentNull: false, graphsNull: false },
    });

    expect(screen.getByRole('tab', { name: 'General' }).getAttribute('tabindex')).toBe('-1');
    expect(screen.getByRole('tab', { name: 'Content' }).getAttribute('tabindex')).toBe('-1');
    expect(screen.getByRole('tab', { name: 'Graphs' }).getAttribute('tabindex')).toBe('0');
  });

  it('the active tabpanel does not have [hidden]; others do', () => {
    render(TabStrip, {
      props: { modelValue: 'content', generalNull: false, contentNull: false, graphsNull: false },
    });

    const allPanels = document.querySelectorAll('[role="tabpanel"]');
    expect(allPanels.length).toBe(3);

    allPanels.forEach((panel) => {
      const labelledBy = panel.getAttribute('aria-labelledby');
      if (labelledBy === 'tab-trigger-content') {
        expect(panel.hasAttribute('hidden')).toBe(false);
      } else {
        expect(panel.hasAttribute('hidden')).toBe(true);
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Keyboard navigation
// ---------------------------------------------------------------------------

describe('TabStrip — keyboard navigation', () => {
  it('ArrowRight from General moves to Content', async () => {
    const { emitted } = render(TabStrip, {
      props: { modelValue: 'general', generalNull: false, contentNull: false, graphsNull: false },
    });

    await fireEvent.keyDown(screen.getByRole('tab', { name: 'General' }), { key: 'ArrowRight' });

    const ids = getEmittedTabIds(emitted());
    expect(ids.at(-1)).toBe('content');
  });

  it('ArrowLeft from General wraps to Graphs', async () => {
    const { emitted } = render(TabStrip, {
      props: { modelValue: 'general', generalNull: false, contentNull: false, graphsNull: false },
    });

    await fireEvent.keyDown(screen.getByRole('tab', { name: 'General' }), { key: 'ArrowLeft' });

    const ids = getEmittedTabIds(emitted());
    expect(ids.at(-1)).toBe('graphs');
  });

  it('Home from Graphs moves to General', async () => {
    const { emitted } = render(TabStrip, {
      props: { modelValue: 'graphs', generalNull: false, contentNull: false, graphsNull: false },
    });

    await fireEvent.keyDown(screen.getByRole('tab', { name: 'Graphs' }), { key: 'Home' });

    const ids = getEmittedTabIds(emitted());
    expect(ids.at(-1)).toBe('general');
  });

  it('End from General moves to Graphs', async () => {
    const { emitted } = render(TabStrip, {
      props: { modelValue: 'general', generalNull: false, contentNull: false, graphsNull: false },
    });

    await fireEvent.keyDown(screen.getByRole('tab', { name: 'General' }), { key: 'End' });

    const ids = getEmittedTabIds(emitted());
    expect(ids.at(-1)).toBe('graphs');
  });

  it('ArrowRight skips hidden tabs (generalNull=true, active=content)', async () => {
    // Only content and graphs are visible. ArrowRight from Content → Graphs.
    const { emitted } = render(TabStrip, {
      props: { modelValue: 'content', generalNull: true, contentNull: false, graphsNull: false },
    });

    await fireEvent.keyDown(screen.getByRole('tab', { name: 'Content' }), { key: 'ArrowRight' });

    const ids = getEmittedTabIds(emitted());
    expect(ids.at(-1)).toBe('graphs');
  });
});

// ---------------------------------------------------------------------------
// axe WCAG 2.1 AA scan
// ---------------------------------------------------------------------------

describe('TabStrip — axe accessibility', () => {
  it('zero WCAG 2.1 AA violations with all tabs visible', async () => {
    const { container } = render(TabStrip, {
      props: { modelValue: 'general', generalNull: false, contentNull: false, graphsNull: false },
      slots: {
        general: '<p>General panel</p>',
        content: '<p>Content panel</p>',
        graphs: '<p>Graphs panel</p>',
      },
    });

    const results = await axe.run(container, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });

    expect(results.violations).toEqual([]);
  });

  it('zero WCAG 2.1 AA violations with one tab hidden', async () => {
    const { container } = render(TabStrip, {
      props: { modelValue: 'content', generalNull: true, contentNull: false, graphsNull: false },
      slots: {
        content: '<p>Content panel</p>',
        graphs: '<p>Graphs panel</p>',
      },
    });

    const results = await axe.run(container, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });

    expect(results.violations).toEqual([]);
  });
});
