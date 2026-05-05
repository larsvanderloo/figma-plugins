// components/src/StatusMessage/StatusMessage.test.ts
//
// @testing-library/vue + axe-core tests for StatusMessage.
//
// Owner: ui-engineer
//
// Test contract:
//   1. Renders the message text when message is provided
//   2. Renders empty content (no visible text) when message is null
//   3. Uses role="status" and aria-live="polite" in default (status) variant
//   4. Uses role="alert" and aria-live="assertive" in alert variant
//   5. aria-atomic="true" is always set
//   6. Element is always in the DOM (never unmounted) — live region permanence
//   7. visuallyHidden=true applies sr-only class
//   8. axe WCAG 2.1 AA scan — zero violations on all variants/states

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/vue';
import axe from 'axe-core';
import StatusMessage from './StatusMessage.vue';

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
// 1. Renders message text
// ---------------------------------------------------------------------------

describe('StatusMessage — message rendering', () => {
  it('renders the message text', () => {
    render(StatusMessage, { props: { message: 'Loading icons…' } });
    expect(screen.getByText('Loading icons…')).toBeDefined();
  });

  it('renders empty text content when message is null', () => {
    const { container } = render(StatusMessage, { props: { message: null } });
    const el = container.querySelector('[role="status"]');
    expect(el).not.toBeNull();
    // Empty string content — no text node
    expect(el?.textContent).toBe('');
  });

  it('renders empty text content when message is undefined (default)', () => {
    const { container } = render(StatusMessage);
    const el =
      container.querySelector('[role="status"]') ?? container.querySelector('[role="alert"]');
    expect(el?.textContent).toBe('');
  });

  it('renders the error message in alert variant', () => {
    render(StatusMessage, {
      props: { message: 'Failed to load slides', variant: 'alert' },
    });
    expect(screen.getByText('Failed to load slides')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 2. ARIA roles and live region attributes
// ---------------------------------------------------------------------------

describe('StatusMessage — ARIA attributes', () => {
  it('uses role="status" in the default (status) variant', () => {
    const { container } = render(StatusMessage, {
      props: { message: 'Loading…' },
    });

    const el = container.querySelector('[role="status"]');
    expect(el).not.toBeNull();
  });

  it('uses aria-live="polite" in the status variant', () => {
    const { container } = render(StatusMessage, {
      props: { message: 'Loading…' },
    });

    const el = container.querySelector('[role="status"]') as HTMLElement;
    expect(el?.getAttribute('aria-live')).toBe('polite');
  });

  it('uses role="alert" in the alert variant', () => {
    const { container } = render(StatusMessage, {
      props: { message: 'Error loading', variant: 'alert' },
    });

    const el = container.querySelector('[role="alert"]');
    expect(el).not.toBeNull();
  });

  it('uses aria-live="assertive" in the alert variant', () => {
    const { container } = render(StatusMessage, {
      props: { message: 'Error loading', variant: 'alert' },
    });

    const el = container.querySelector('[role="alert"]') as HTMLElement;
    expect(el?.getAttribute('aria-live')).toBe('assertive');
  });

  it('sets aria-atomic="true" in the status variant', () => {
    const { container } = render(StatusMessage, {
      props: { message: 'Loading…' },
    });

    const el = container.querySelector('[role="status"]') as HTMLElement;
    expect(el?.getAttribute('aria-atomic')).toBe('true');
  });

  it('sets aria-atomic="true" in the alert variant', () => {
    const { container } = render(StatusMessage, {
      props: { message: 'Error', variant: 'alert' },
    });

    const el = container.querySelector('[role="alert"]') as HTMLElement;
    expect(el?.getAttribute('aria-atomic')).toBe('true');
  });
});

// ---------------------------------------------------------------------------
// 3. Element always in the DOM
// ---------------------------------------------------------------------------

describe('StatusMessage — live region permanence', () => {
  it('the element is in the DOM even when message is null', () => {
    const { container } = render(StatusMessage, { props: { message: null } });
    // Either role is acceptable; the important thing is the element exists.
    const el =
      container.querySelector('[role="status"]') ?? container.querySelector('[role="alert"]');
    expect(el).not.toBeNull();
  });

  it('the element remains in the DOM when message changes from null to a value', async () => {
    const { container, rerender } = render(StatusMessage, {
      props: { message: null },
    });

    const elBefore =
      container.querySelector('[role="status"]') ?? container.querySelector('[role="alert"]');
    expect(elBefore).not.toBeNull();

    await rerender({ message: 'Now I have content' });

    const elAfter =
      container.querySelector('[role="status"]') ?? container.querySelector('[role="alert"]');
    expect(elAfter).not.toBeNull();
    // Same element reference — not v-if'd
    expect(elBefore).toBe(elAfter);
  });
});

// ---------------------------------------------------------------------------
// 4. visuallyHidden
// ---------------------------------------------------------------------------

describe('StatusMessage — visuallyHidden', () => {
  it('adds sr-only class when visuallyHidden=true', () => {
    const { container } = render(StatusMessage, {
      props: { message: 'Background loading…', visuallyHidden: true },
    });

    const el =
      container.querySelector('[role="status"]') ?? container.querySelector('[role="alert"]');
    expect(el?.classList.contains('sr-only')).toBe(true);
  });

  it('does not add sr-only class when visuallyHidden is false (default)', () => {
    const { container } = render(StatusMessage, {
      props: { message: 'Loading…' },
    });

    const el = container.querySelector('[role="status"]') as HTMLElement;
    expect(el.classList.contains('sr-only')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. axe WCAG 2.1 AA scan
// ---------------------------------------------------------------------------

describe('StatusMessage — axe WCAG 2.1 AA', () => {
  it('has zero violations — status variant with message', async () => {
    const { container } = render(StatusMessage, {
      props: { message: 'Loading icons…' },
    });

    const violations = await runAxeWCAG(container);
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero violations — status variant, no message (null)', async () => {
    const { container } = render(StatusMessage, {
      props: { message: null },
    });

    const violations = await runAxeWCAG(container);
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero violations — alert variant with error message', async () => {
    const { container } = render(StatusMessage, {
      props: { message: 'Failed to load slide list', variant: 'alert' },
    });

    const violations = await runAxeWCAG(container);
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero violations — visuallyHidden=true', async () => {
    const { container } = render(StatusMessage, {
      props: { message: 'Loading in background', visuallyHidden: true },
    });

    const violations = await runAxeWCAG(container);
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });
});
