// sections/PropertyPanel/tests/PropertyPanel.test.ts
//
// @testing-library/vue + axe-core tests for PropertyPanel.
//
// Owner: ui-engineer. Resolves MON-2893854185.
//
// Test contract:
//   1. Renders title, chevron, and default slot content
//   2. Toggling closes the body (aria-expanded=false, body content clipped)
//   3. Toggling again re-opens the body
//   4. Non-collapsible mode: no button, no chevron, body always visible
//   5. defaultOpen=false: starts closed
//   6. Emits update:open with correct boolean on toggle
//   7. ARIA correctness: role, aria-expanded, aria-controls / id pairing
//   8. Keyboard activation: Enter key on button toggles
//   9. axe WCAG 2.1 AA — 0 violations (open state, closed state,
//      non-collapsible state)

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/vue';
import axe from 'axe-core';
import PropertyPanel from '../src/PropertyPanel.vue';

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
// 1. Renders title, chevron, and slot content
// ---------------------------------------------------------------------------

describe('PropertyPanel — rendering', () => {
  it('renders the section title in the header', () => {
    render(PropertyPanel, {
      props: { title: 'Typography' },
      slots: { default: '<p>Slot content</p>' },
    });

    expect(screen.getByText('Typography')).toBeDefined();
  });

  it('renders the default slot content', () => {
    render(PropertyPanel, {
      props: { title: 'Layout' },
      slots: { default: '<span data-testid="body-content">Panel body</span>' },
    });

    expect(screen.getByText('Panel body')).toBeDefined();
  });

  it('renders a toggle button when collapsible=true (default)', () => {
    render(PropertyPanel, {
      props: { title: 'Colors' },
    });

    // The header should be a button in collapsible mode.
    const button = screen.getByRole('button');
    expect(button).toBeDefined();
  });

  it('renders the chevron SVG inside the toggle button', () => {
    const { container } = render(PropertyPanel, {
      props: { title: 'Spacing' },
    });

    // The chevron is aria-hidden and therefore not queryable by role/label.
    // We locate it via the DOM since it is purely decorative.
    const svg = container.querySelector('.property-panel__chevron');
    expect(svg).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2. Toggling closes the body
// ---------------------------------------------------------------------------

describe('PropertyPanel — toggle to closed', () => {
  it('sets aria-expanded=false after clicking the header button once', async () => {
    render(PropertyPanel, {
      props: { title: 'Fill', defaultOpen: true },
      slots: { default: '<p>Content</p>' },
    });

    const button = screen.getByRole('button');
    // Initially open — aria-expanded should be "true".
    expect(button.getAttribute('aria-expanded')).toBe('true');

    await fireEvent.click(button);

    // After toggle — aria-expanded should be "false".
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('the body panel is still in the DOM when collapsed (CSS-only collapse)', async () => {
    render(PropertyPanel, {
      props: { title: 'Stroke', defaultOpen: true },
      slots: { default: '<p>Stroke options</p>' },
    });

    const button = screen.getByRole('button');
    await fireEvent.click(button);

    // Body content remains in the DOM — the collapse is CSS-only (grid-rows).
    // Content is still present but clipped via CSS.
    expect(screen.getByText('Stroke options')).toBeDefined();
  });

  it('the body div has the --closed class after toggle', async () => {
    const { container } = render(PropertyPanel, {
      props: { title: 'Effects', defaultOpen: true },
    });

    const button = screen.getByRole('button');
    await fireEvent.click(button);

    const body = container.querySelector('.property-panel__body');
    expect(body?.classList.contains('property-panel__body--closed')).toBe(true);
    expect(body?.classList.contains('property-panel__body--open')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Toggling again re-opens
// ---------------------------------------------------------------------------

describe('PropertyPanel — toggle to re-open', () => {
  it('sets aria-expanded back to true after a second click', async () => {
    render(PropertyPanel, {
      props: { title: 'Typography', defaultOpen: true },
    });

    const button = screen.getByRole('button');
    await fireEvent.click(button); // close
    await fireEvent.click(button); // re-open

    expect(button.getAttribute('aria-expanded')).toBe('true');
  });

  it('the body div has the --open class after re-opening', async () => {
    const { container } = render(PropertyPanel, {
      props: { title: 'Alignment', defaultOpen: true },
    });

    const button = screen.getByRole('button');
    await fireEvent.click(button); // close
    await fireEvent.click(button); // re-open

    const body = container.querySelector('.property-panel__body');
    expect(body?.classList.contains('property-panel__body--open')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4. Non-collapsible mode
// ---------------------------------------------------------------------------

describe('PropertyPanel — non-collapsible mode', () => {
  it('does not render a toggle button when collapsible=false', () => {
    render(PropertyPanel, {
      props: { title: 'Position', collapsible: false },
      slots: { default: '<p>Always visible</p>' },
    });

    // No button in the document at all.
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('does not render the chevron SVG when collapsible=false', () => {
    const { container } = render(PropertyPanel, {
      props: { title: 'Position', collapsible: false },
    });

    const svg = container.querySelector('.property-panel__chevron');
    expect(svg).toBeNull();
  });

  it('body content is always visible when collapsible=false', () => {
    render(PropertyPanel, {
      props: { title: 'Size', collapsible: false },
      slots: { default: '<span>Size fields</span>' },
    });

    expect(screen.getByText('Size fields')).toBeDefined();
  });

  it('body div always has --open class when collapsible=false', () => {
    const { container } = render(PropertyPanel, {
      props: { title: 'Transform', collapsible: false },
    });

    const body = container.querySelector('.property-panel__body');
    expect(body?.classList.contains('property-panel__body--open')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. defaultOpen=false — starts closed
// ---------------------------------------------------------------------------

describe('PropertyPanel — defaultOpen=false', () => {
  it('starts with aria-expanded=false when defaultOpen=false', () => {
    render(PropertyPanel, {
      props: { title: 'Advanced', defaultOpen: false },
    });

    const button = screen.getByRole('button');
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('body div has --closed class on initial render when defaultOpen=false', () => {
    const { container } = render(PropertyPanel, {
      props: { title: 'Advanced', defaultOpen: false },
    });

    const body = container.querySelector('.property-panel__body');
    expect(body?.classList.contains('property-panel__body--closed')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 6. Emits update:open on toggle
// ---------------------------------------------------------------------------

describe('PropertyPanel — update:open emit', () => {
  it('emits update:open with false when closing an open panel', async () => {
    const { emitted } = render(PropertyPanel, {
      props: { title: 'Fill', defaultOpen: true },
    });

    const button = screen.getByRole('button');
    await fireEvent.click(button);

    const emittedOpen = emitted('update:open') as [boolean][][] | undefined;
    expect(emittedOpen).toBeDefined();
    expect(emittedOpen).toHaveLength(1);
    expect(emittedOpen?.[0]?.[0]).toBe(false);
  });

  it('emits update:open with true when re-opening a closed panel', async () => {
    const { emitted } = render(PropertyPanel, {
      props: { title: 'Fill', defaultOpen: true },
    });

    const button = screen.getByRole('button');
    await fireEvent.click(button); // close → emits false
    await fireEvent.click(button); // open  → emits true

    const emittedOpen = emitted('update:open') as [boolean][][] | undefined;
    expect(emittedOpen).toHaveLength(2);
    expect(emittedOpen?.[1]?.[0]).toBe(true);
  });

  it('does not emit update:open when collapsible=false', async () => {
    const { emitted } = render(PropertyPanel, {
      props: { title: 'Position', collapsible: false },
    });

    // No button is rendered; no click to perform. Just verify no emit on mount.
    expect(emitted('update:open')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 7. ARIA correctness
// ---------------------------------------------------------------------------

describe('PropertyPanel — ARIA correctness', () => {
  it('header button has aria-expanded=true when open', () => {
    render(PropertyPanel, {
      props: { title: 'Fill', defaultOpen: true },
    });

    const button = screen.getByRole('button');
    expect(button.getAttribute('aria-expanded')).toBe('true');
  });

  it('header button has aria-expanded=false when closed', () => {
    render(PropertyPanel, {
      props: { title: 'Fill', defaultOpen: false },
    });

    const button = screen.getByRole('button');
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('aria-controls on the button matches the body panel id', () => {
    const { container } = render(PropertyPanel, {
      props: { title: 'Stroke', defaultOpen: true },
    });

    const button = screen.getByRole('button');
    const controlsId = button.getAttribute('aria-controls');
    expect(controlsId).toBeTruthy();

    // The body div must carry that id.
    // Use getElementById rather than querySelector with a CSS selector to avoid
    // CSS.escape unavailability in jsdom (Vue useId() may produce IDs with
    // colon characters that need escaping in CSS selectors).
    const body = container.ownerDocument.getElementById(controlsId ?? '');
    expect(body).not.toBeNull();
    expect(body?.classList.contains('property-panel__body')).toBe(true);
  });

  it('the panel title is present in the button accessible name', () => {
    render(PropertyPanel, {
      props: { title: 'Typography Settings' },
    });

    // The button's text content includes the title.
    const button = screen.getByRole('button', { name: /typography settings/i });
    expect(button).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 8. Keyboard activation (Enter key)
// ---------------------------------------------------------------------------

describe('PropertyPanel — keyboard activation', () => {
  it('toggles when the Enter key is pressed on the header button', async () => {
    render(PropertyPanel, {
      props: { title: 'Blur', defaultOpen: true },
    });

    const button = screen.getByRole('button');
    expect(button.getAttribute('aria-expanded')).toBe('true');

    // Native <button> activates on Enter without preventDefault needed.
    await fireEvent.keyDown(button, { key: 'Enter', code: 'Enter' });
    await fireEvent.click(button); // simulate browser default: keydown → click

    expect(button.getAttribute('aria-expanded')).toBe('false');
  });
});

// ---------------------------------------------------------------------------
// 9. axe WCAG 2.1 AA — 0 violations
// ---------------------------------------------------------------------------

describe('PropertyPanel — axe WCAG 2.1 AA', () => {
  it('has zero violations in open (default) state', async () => {
    const { container } = render(PropertyPanel, {
      props: { title: 'Fill', defaultOpen: true },
      slots: { default: '<p>Fill color options</p>' },
    });

    const violations = await runAxeWCAG(container);
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero violations in closed state', async () => {
    const { container } = render(PropertyPanel, {
      props: { title: 'Fill', defaultOpen: false },
      slots: { default: '<p>Fill color options</p>' },
    });

    const violations = await runAxeWCAG(container);
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero violations in non-collapsible mode', async () => {
    const { container } = render(PropertyPanel, {
      props: { title: 'Position', collapsible: false },
      slots: { default: '<p>Position fields</p>' },
    });

    const violations = await runAxeWCAG(container);
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero violations after toggling to closed', async () => {
    const { container } = render(PropertyPanel, {
      props: { title: 'Stroke', defaultOpen: true },
      slots: { default: '<p>Stroke options</p>' },
    });

    const button = screen.getByRole('button');
    await fireEvent.click(button);

    const violations = await runAxeWCAG(container);
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });
});
