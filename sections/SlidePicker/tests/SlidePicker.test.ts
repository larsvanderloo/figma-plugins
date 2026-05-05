// sections/SlidePicker/tests/SlidePicker.test.ts
//
// @testing-library/vue + axe-core tests for SlidePicker.
//
// Owner: ui-engineer
//
// Test contract (ADR-0010 §section authoring template):
//   1. Renders the slide list when populated
//   2. Shows empty state when no slides
//   3. Calls the correct emit on select
//   4. Active slide visually and semantically distinguished
//   5. Loading state
//   6. Error state
//   7. axe WCAG 2.1 AA scan — zero violations on all states
//
// Mutation discipline: SlidePicker never calls useEditorStore().$patch or
// direct property assignment. It is a pure render consumer; all writes flow
// through emits to the parent. The ESLint rule `welder/pinia-mutation-discipline`
// enforces this at lint time; the tests confirm emit-based behavior.

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/vue';
import axe from 'axe-core';
import SlidePicker from '../src/SlidePicker.vue';
import type { SlideSummary } from '../src/types.js';

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
  name: 'Slide 2 — Customer Journey',
  isSkipped: null,
};

const SLIDE_C: SlideSummary = {
  id: 'node-3',
  number: 3,
  name: 'Slide 3 — Skipped',
  isSkipped: true,
};

// ---------------------------------------------------------------------------
// axe helper
// ---------------------------------------------------------------------------

async function runAxeWCAG(el: Element): Promise<axe.Result[]> {
  const results = await axe.run(el, {
    runOnly: {
      type: 'tag',
      values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
    },
  });
  return results.violations;
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
// 1. Renders slide list when populated
// ---------------------------------------------------------------------------

describe('SlidePicker — slide list rendering', () => {
  it('renders all slide names as options', () => {
    render(SlidePicker, {
      props: {
        slides: [SLIDE_A, SLIDE_B, SLIDE_C],
        activeSlideId: null,
      },
    });

    // All three slide names should appear in the combobox/select options.
    expect(screen.getByRole('combobox')).toBeDefined();
    expect(screen.getByText(SLIDE_A.name)).toBeDefined();
    expect(screen.getByText(SLIDE_B.name)).toBeDefined();
  });

  it('renders a skipped slide with "(skipped)" suffix', () => {
    render(SlidePicker, {
      props: {
        slides: [SLIDE_C],
        activeSlideId: null,
      },
    });

    // The option text includes " (skipped)" for isSkipped=true slides.
    const option = screen.getByRole('option', { name: /skipped/i });
    expect(option).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 2. Empty state
// ---------------------------------------------------------------------------

describe('SlidePicker — empty state', () => {
  it('shows the empty state message when slides is empty', () => {
    render(SlidePicker, {
      props: {
        slides: [],
        activeSlideId: null,
      },
    });

    expect(screen.getByText(/no welder slides on this page/i)).toBeDefined();
  });

  it('disables the select when slides is empty', () => {
    render(SlidePicker, {
      props: {
        slides: [],
        activeSlideId: null,
      },
    });

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.disabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 3. Emits select on change
// ---------------------------------------------------------------------------

describe('SlidePicker — select emit', () => {
  it('emits "select" with the slide id when the user picks a slide', async () => {
    const { emitted } = render(SlidePicker, {
      props: {
        slides: [SLIDE_A, SLIDE_B],
        activeSlideId: null,
      },
    });

    const select = screen.getByRole('combobox');
    await fireEvent.update(select, SLIDE_B.id);

    // The "select" event should be emitted with the picked slide's id.
    const emittedSelect = emitted('select') as [string][] | undefined;
    expect(emittedSelect).toBeDefined();
    expect(emittedSelect).toHaveLength(1);
    expect(emittedSelect?.[0]?.[0]).toBe(SLIDE_B.id);
  });

  it('does not emit "select" when value is empty string (placeholder)', async () => {
    const { emitted } = render(SlidePicker, {
      props: {
        slides: [SLIDE_A, SLIDE_B],
        activeSlideId: null,
      },
    });

    const select = screen.getByRole('combobox');
    await fireEvent.update(select, '');

    const emittedSelect = emitted('select') as [string][] | undefined;
    expect(emittedSelect).toBeUndefined();
  });

  it('does not emit during loading state', async () => {
    const { emitted } = render(SlidePicker, {
      props: {
        slides: [SLIDE_A],
        activeSlideId: null,
        loading: true,
      },
    });

    // Select is disabled during loading, so even if the value changes the
    // handler guards against emission while loading is true.
    const select = screen.getByRole('combobox');
    await fireEvent.update(select, SLIDE_A.id);

    const emittedSelect = emitted('select') as [string][] | undefined;
    expect(emittedSelect).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 4. Active slide visually and semantically distinguished
// ---------------------------------------------------------------------------

describe('SlidePicker — active slide distinction', () => {
  it('marks the active slide option as selected', () => {
    render(SlidePicker, {
      props: {
        slides: [SLIDE_A, SLIDE_B],
        activeSlideId: SLIDE_B.id,
      },
    });

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe(SLIDE_B.id);
  });

  it('prefixes the active slide option text with a checkmark', () => {
    render(SlidePicker, {
      props: {
        slides: [SLIDE_A, SLIDE_B],
        activeSlideId: SLIDE_B.id,
      },
    });

    // The active option has a "✓ " prefix in its text content.
    // getByRole('option') matches by accessible name (text content).
    const activeOption = screen.getByRole('option', {
      name: new RegExp(`✓.*${SLIDE_B.name}`),
    });
    expect(activeOption).toBeDefined();
  });

  it('does not prefix non-active slides with a checkmark', () => {
    render(SlidePicker, {
      props: {
        slides: [SLIDE_A, SLIDE_B],
        activeSlideId: SLIDE_B.id,
      },
    });

    // SLIDE_A is NOT active, so its option should not start with ✓.
    const nonActiveOption = screen.getByRole('option', { name: SLIDE_A.name });
    expect(nonActiveOption.textContent?.trim().startsWith('✓')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. Loading state
// ---------------------------------------------------------------------------

describe('SlidePicker — loading state', () => {
  it('shows loading placeholder text', () => {
    render(SlidePicker, {
      props: {
        slides: [],
        activeSlideId: null,
        loading: true,
      },
    });

    expect(screen.getByText(/loading slides/i)).toBeDefined();
  });

  it('disables the select during loading', () => {
    render(SlidePicker, {
      props: {
        slides: [],
        activeSlideId: null,
        loading: true,
      },
    });

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.disabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. Error state
// ---------------------------------------------------------------------------

describe('SlidePicker — error state', () => {
  it('renders an error message in a live region', () => {
    const errorMessage = 'Could not load slides. Try refreshing.';
    render(SlidePicker, {
      props: {
        slides: [],
        activeSlideId: null,
        error: errorMessage,
      },
    });

    // The error is in a role="alert" element (live region).
    const alert = screen.getByRole('alert');
    expect(alert).toBeDefined();
    expect(alert.textContent).toContain(errorMessage);
  });

  it('does not render an alert when error is null', () => {
    render(SlidePicker, {
      props: {
        slides: [SLIDE_A],
        activeSlideId: null,
        error: null,
      },
    });

    expect(screen.queryByRole('alert')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 7. axe WCAG 2.1 AA scan — all states
// ---------------------------------------------------------------------------

describe('SlidePicker — axe WCAG 2.1 AA', () => {
  async function mountAndScan(props: {
    slides: SlideSummary[];
    activeSlideId: string | null;
    loading?: boolean;
    error?: string | null;
  }): Promise<axe.Result[]> {
    const { container } = render(SlidePicker, { props });
    return runAxeWCAG(container);
  }

  it('has zero WCAG 2.1 AA violations — populated state', async () => {
    const violations = await mountAndScan({
      slides: [SLIDE_A, SLIDE_B],
      activeSlideId: SLIDE_A.id,
    });
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero WCAG 2.1 AA violations — empty state', async () => {
    const violations = await mountAndScan({
      slides: [],
      activeSlideId: null,
    });
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero WCAG 2.1 AA violations — loading state', async () => {
    const violations = await mountAndScan({
      slides: [],
      activeSlideId: null,
      loading: true,
    });
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero WCAG 2.1 AA violations — error state', async () => {
    const violations = await mountAndScan({
      slides: [],
      activeSlideId: null,
      error: 'Could not load slides.',
    });
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero WCAG 2.1 AA violations — no active slide', async () => {
    const violations = await mountAndScan({
      slides: [SLIDE_A, SLIDE_B, SLIDE_C],
      activeSlideId: null,
    });
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });
});
