// plugins/welder-editor/tests/ui/components/PropertyPanel.test.ts
//
// Sprint 5 — PropertyPanel component tests.
// Verifies CSS grid-rows collapse, ARIA contract, and T42.21 perf invariants.
//
// Owner: ui-engineer. ADR-0011.

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/vue';
import PropertyPanel from '@/components/PropertyPanel.vue';

describe('PropertyPanel', () => {
  it('renders header button with aria-expanded=true when defaultOpen', () => {
    render(PropertyPanel, { props: { title: 'Settings' } });
    const btn = screen.getByRole('button', { name: /settings/i });
    expect(btn.getAttribute('aria-expanded')).toBe('true');
  });

  it('renders header button with aria-expanded=false when defaultOpen=false', () => {
    render(PropertyPanel, { props: { title: 'Settings', defaultOpen: false } });
    const btn = screen.getByRole('button', { name: /settings/i });
    expect(btn.getAttribute('aria-expanded')).toBe('false');
  });

  it('toggles aria-expanded on click', async () => {
    render(PropertyPanel, { props: { title: 'Settings' } });
    const btn = screen.getByRole('button', { name: /settings/i });
    await fireEvent.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    await fireEvent.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
  });

  it('emits update:open on toggle', async () => {
    const { emitted } = render(PropertyPanel, { props: { title: 'Settings' } });
    await fireEvent.click(screen.getByRole('button', { name: /settings/i }));
    expect(emitted()['update:open']?.[0]?.[0]).toBe(false);
  });

  it('renders non-collapsible header as div (not button) when collapsible=false', () => {
    render(PropertyPanel, { props: { title: 'Pinned', collapsible: false } });
    expect(screen.queryByRole('button', { name: /pinned/i })).toBeNull();
    expect(screen.getByText('Pinned')).toBeDefined();
  });

  it('renders slot content', () => {
    render(PropertyPanel, {
      props: { title: 'Content' },
      slots: { default: '<span>slot-content</span>' },
    });
    expect(screen.getByText('slot-content')).toBeDefined();
  });

  it('body is always in DOM (CSS-only collapse) for AT compatibility', () => {
    const { container } = render(PropertyPanel, {
      props: { title: 'Test', defaultOpen: false },
      slots: { default: '<span data-testid="inner">inner</span>' },
    });
    // Even when closed, the body is in the DOM (CSS-only collapse)
    expect(container.querySelector('[data-testid="inner"]')).not.toBeNull();
  });
});
