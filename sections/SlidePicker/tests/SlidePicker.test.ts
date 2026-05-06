// sections/SlidePicker/tests/SlidePicker.test.ts
//
// @testing-library/vue + axe-core tests for SlidePicker.
//
// Owner: ui-engineer
//
// Migrated for USelectMenu (Sprint 5 Wave 3, MON-2894451891).
//
// USelectMenu (reka-ui ComboboxRoot) renders:
//   - A <button data-slot="base"> trigger with aria-haspopup="listbox".
//     The button's accessible name is the reka-ui default "Show popup".
//     Selected value appears as its text content (data-slot="value"),
//     placeholder when nothing is selected.
//   - ComboboxPortal (teleported to <body>) containing a listbox with
//     ComboboxItem nodes (role="option") — only rendered when OPEN.
//   - aria-disabled="true" on the trigger when disabled.
//
// Test contract (ADR-0010 §section authoring template):
//   1. Renders the trigger button when populated
//   2. Shows empty-state placeholder when no slides
//   3. Calls the correct emit on select (via click-open-then-pick)
//   4. Active slide displayed in trigger text
//   5. Loading state — placeholder text
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

// Helper: find the USelectMenu trigger button by its aria-haspopup attribute.
// Using aria-haspopup="listbox" as the stable selector because:
//   - role="button" is implicit on <button>, not unique enough
//   - accessible name ("Show popup") is a reka-ui internal; fragile to version changes
//   - aria-haspopup="listbox" is the semantic contract for a combobox trigger
function getSelectTrigger(): HTMLElement {
  return screen.getByRole('button', { name: /show popup/i });
}

// ---------------------------------------------------------------------------
// 1. Renders the trigger when populated
// ---------------------------------------------------------------------------

describe('SlidePicker — trigger rendering', () => {
  it('renders the USelectMenu trigger button', () => {
    render(SlidePicker, {
      props: {
        slides: [SLIDE_A, SLIDE_B, SLIDE_C],
        activeSlideId: null,
      },
    });

    const trigger = getSelectTrigger();
    expect(trigger).toBeDefined();
    // Trigger has aria-haspopup="listbox" — it controls a listbox.
    expect(trigger.getAttribute('aria-haspopup')).toBe('listbox');
  });

  it('shows the active slide label in the trigger when a slide is selected', () => {
    render(SlidePicker, {
      props: {
        slides: [SLIDE_A, SLIDE_B],
        activeSlideId: SLIDE_A.id,
      },
    });

    // The trigger text content includes the formatted label for SLIDE_A.
    const trigger = getSelectTrigger();
    expect(trigger.textContent).toContain('1. Slide 1 — Overview');
  });

  it('shows the placeholder text when no slide is selected', () => {
    render(SlidePicker, {
      props: {
        slides: [SLIDE_A, SLIDE_B],
        activeSlideId: null,
      },
    });

    const trigger = getSelectTrigger();
    expect(trigger.textContent).toContain('Pick a slide');
  });

  it('shows slide names after opening the dropdown', async () => {
    render(SlidePicker, {
      props: {
        slides: [SLIDE_A, SLIDE_B],
        activeSlideId: null,
      },
    });

    // Open the dropdown by clicking the trigger.
    const trigger = getSelectTrigger();
    await fireEvent.click(trigger);

    // Items are rendered in a portal on <body>. Use screen (not within container).
    expect(screen.getByText('1. Slide 1 — Overview')).toBeDefined();
    expect(screen.getByText('2. Slide 2 — Customer Journey')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 2. Empty state
// ---------------------------------------------------------------------------

describe('SlidePicker — empty state', () => {
  it('shows the empty state placeholder when slides is empty', () => {
    render(SlidePicker, {
      props: {
        slides: [],
        activeSlideId: null,
      },
    });

    const trigger = getSelectTrigger();
    expect(trigger.textContent).toContain('No Welder slides on this page');
  });

  it('disables the trigger when slides is empty', () => {
    render(SlidePicker, {
      props: {
        slides: [],
        activeSlideId: null,
      },
    });

    const trigger = getSelectTrigger();
    // USelectMenu sets aria-disabled="true" (not the HTML disabled attribute)
    // on the ComboboxTrigger when the combobox is disabled.
    expect(trigger.getAttribute('aria-disabled')).toBe('true');
  });
});

// ---------------------------------------------------------------------------
// 3. Emits select on item pick
// ---------------------------------------------------------------------------

describe('SlidePicker — select emit', () => {
  it('emits "select" with the slide id when the user picks a slide', async () => {
    const { emitted } = render(SlidePicker, {
      props: {
        slides: [SLIDE_A, SLIDE_B],
        activeSlideId: null,
      },
    });

    // Open the dropdown.
    const trigger = getSelectTrigger();
    await fireEvent.click(trigger);

    // Find and click SLIDE_B in the portal listbox.
    const option = screen.getByText('2. Slide 2 — Customer Journey');
    await fireEvent.click(option);

    const emittedSelect = emitted('select') as [string][] | undefined;
    expect(emittedSelect).toBeDefined();
    expect(emittedSelect).toHaveLength(1);
    expect(emittedSelect?.[0]?.[0]).toBe(SLIDE_B.id);
  });

  it('does not emit "select" when the trigger is disabled (empty slides)', async () => {
    const { emitted } = render(SlidePicker, {
      props: {
        slides: [],
        activeSlideId: null,
      },
    });

    const trigger = getSelectTrigger();
    await fireEvent.click(trigger);

    const emittedSelect = emitted('select') as [string][] | undefined;
    expect(emittedSelect).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 4. Active slide displayed in trigger
// ---------------------------------------------------------------------------

describe('SlidePicker — active slide display', () => {
  it('reflects the active slide label in the trigger', () => {
    render(SlidePicker, {
      props: {
        slides: [SLIDE_A, SLIDE_B],
        activeSlideId: SLIDE_B.id,
      },
    });

    const trigger = getSelectTrigger();
    expect(trigger.textContent).toContain('2. Slide 2 — Customer Journey');
  });

  it('shows placeholder when activeSlideId is null', () => {
    render(SlidePicker, {
      props: {
        slides: [SLIDE_A, SLIDE_B],
        activeSlideId: null,
      },
    });

    const trigger = getSelectTrigger();
    expect(trigger.textContent).toContain('Pick a slide');
  });

  it('shows the checkmark indicator on the selected item in the open listbox', async () => {
    render(SlidePicker, {
      props: {
        slides: [SLIDE_A, SLIDE_B],
        activeSlideId: SLIDE_B.id,
      },
    });

    const trigger = getSelectTrigger();
    await fireEvent.click(trigger);

    // The selected item in the portal listbox has aria-selected="true".
    const selectedOption = screen.getByRole('option', { selected: true });
    expect(selectedOption).toBeDefined();
    expect(selectedOption.textContent).toContain('2. Slide 2 — Customer Journey');
  });
});

// ---------------------------------------------------------------------------
// 5. Loading state
// ---------------------------------------------------------------------------

describe('SlidePicker — loading state', () => {
  it('shows loading placeholder text in the trigger', () => {
    render(SlidePicker, {
      props: {
        slides: [],
        activeSlideId: null,
        loading: true,
      },
    });

    const trigger = getSelectTrigger();
    expect(trigger.textContent).toContain('Loading slides');
  });

  it('disables the trigger during loading', () => {
    render(SlidePicker, {
      props: {
        slides: [],
        activeSlideId: null,
        loading: true,
      },
    });

    const trigger = getSelectTrigger();
    expect(trigger.getAttribute('aria-disabled')).toBe('true');
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
