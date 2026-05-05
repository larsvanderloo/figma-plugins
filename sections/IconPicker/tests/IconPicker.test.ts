// sections/IconPicker/tests/IconPicker.test.ts
//
// @testing-library/vue + axe-core tests for IconPicker.
//
// Owner: ui-engineer
//
// Test contract:
//   1. Renders search input + icon grid
//   2. Search filters icons by key match
//   3. Emits `update:modelValue` with icon key on click
//   4. Disabled state disables search + click
//   5. Loading state while manifest loads
//   6. Empty search result state
//   7. axe WCAG 2.1 AA scan — zero violations on all states
//
// @iconify/vue is mocked in setup.ts — tests cover the section's behavior
// (filtering, selection, disabled) without depending on real SVG rendering.
// The manifest is also mocked below: loadIconManifest resolves immediately
// so that `onMounted` finishes synchronously in jsdom.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/vue';
import axe from 'axe-core';
import IconPicker from '../src/IconPicker.vue';
import { ICON_KEYS } from '../src/icons.js';

// ---------------------------------------------------------------------------
// Mock loadIconManifest so it resolves immediately in tests.
// The actual dynamic import of lucide-subset.json is not needed here — we
// test behavior, not icon data integrity. The addCollection mock in setup.ts
// handles the @iconify/vue side.
// ---------------------------------------------------------------------------

vi.mock('../src/icons.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...(original as object),
    loadIconManifest: vi.fn().mockResolvedValue(undefined),
  };
});

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
// Helper: mount and wait for manifest (onMounted async)
// ---------------------------------------------------------------------------

async function mountPicker(
  props: Partial<{
    modelValue: string;
    disabled: boolean;
    placeholder: string;
  }> = {},
) {
  const result = render(IconPicker, {
    props: {
      modelValue: props.modelValue ?? '',
      disabled: props.disabled ?? false,
      placeholder: props.placeholder ?? 'Search icons...',
    },
  });
  // Wait for onMounted to resolve (loadIconManifest is mocked to resolve
  // immediately, but we still need to flush the microtask queue).
  await waitFor(() => {
    expect(screen.queryByText('Loading icons…')).toBeNull();
  });
  return result;
}

// ---------------------------------------------------------------------------
// 1. Renders search + grid
// ---------------------------------------------------------------------------

describe('IconPicker — renders search + grid', () => {
  it('renders a search input', async () => {
    await mountPicker();
    const input = screen.getByRole('searchbox');
    expect(input).toBeDefined();
  });

  it('renders the listbox grid', async () => {
    await mountPicker();
    const grid = screen.getByRole('listbox');
    expect(grid).toBeDefined();
  });

  it('renders an option for every icon key after manifest loads', async () => {
    await mountPicker();
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(ICON_KEYS.length);
  });

  it('uses the placeholder prop on the search input', async () => {
    await mountPicker({ placeholder: 'Find an icon…' });
    const input = screen.getByPlaceholderText('Find an icon…');
    expect(input).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 2. Search filters icons by key match
// ---------------------------------------------------------------------------

describe('IconPicker — search filtering', () => {
  it('shows only matching icons when a search query is typed', async () => {
    await mountPicker();
    const input = screen.getByRole('searchbox');
    await fireEvent.update(input, 'arrow');

    const options = screen.getAllByRole('option');
    // arrow-left, arrow-right, arrow-up, arrow-down should all match.
    expect(options.length).toBeGreaterThanOrEqual(4);
    // Every visible option label should contain "arrow".
    options.forEach((opt) => {
      expect(opt.getAttribute('aria-label')).toMatch(/arrow/);
    });
  });

  it('shows a no-match message when no icons match the query', async () => {
    await mountPicker();
    const input = screen.getByRole('searchbox');
    await fireEvent.update(input, 'zzznomatch');

    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText(/no icons match/i)).toBeDefined();
  });

  it('restores all icons when the query is cleared', async () => {
    await mountPicker();
    const input = screen.getByRole('searchbox');
    await fireEvent.update(input, 'arrow');
    await fireEvent.update(input, '');

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(ICON_KEYS.length);
  });
});

// ---------------------------------------------------------------------------
// 3. Emits update:modelValue on click
// ---------------------------------------------------------------------------

describe('IconPicker — selection emit', () => {
  it('emits update:modelValue with the icon key when an icon is clicked', async () => {
    const { emitted } = await mountPicker({ modelValue: '' });

    const starOption = screen.getByRole('option', { name: 'star' });
    await fireEvent.click(starOption);

    const emittedEvents = emitted('update:modelValue') as [string][][] | undefined;
    expect(emittedEvents).toBeDefined();
    expect(emittedEvents).toHaveLength(1);
    expect(emittedEvents?.[0]?.[0]).toBe('star');
  });

  it('marks the current modelValue option as aria-selected', async () => {
    await mountPicker({ modelValue: 'heart' });

    const heartOption = screen.getByRole('option', { name: 'heart' });
    expect(heartOption.getAttribute('aria-selected')).toBe('true');
  });

  it('marks non-selected options as aria-selected=false', async () => {
    await mountPicker({ modelValue: 'heart' });

    const starOption = screen.getByRole('option', { name: 'star' });
    expect(starOption.getAttribute('aria-selected')).toBe('false');
  });

  it('emits the clicked icon key even if a different icon is already selected', async () => {
    const { emitted } = await mountPicker({ modelValue: 'heart' });

    const starOption = screen.getByRole('option', { name: 'star' });
    await fireEvent.click(starOption);

    const emittedEvents = emitted('update:modelValue') as [string][][] | undefined;
    expect(emittedEvents?.[0]?.[0]).toBe('star');
  });
});

// ---------------------------------------------------------------------------
// 4. Disabled state
// ---------------------------------------------------------------------------

describe('IconPicker — disabled state', () => {
  it('disables the search input when disabled=true', async () => {
    await mountPicker({ disabled: true });
    const input = screen.getByRole('searchbox') as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });

  it('disables all icon buttons when disabled=true', async () => {
    await mountPicker({ disabled: true });
    const options = screen.getAllByRole('option') as HTMLButtonElement[];
    options.forEach((opt) => {
      expect(opt.disabled).toBe(true);
    });
  });

  it('does not emit update:modelValue when a disabled icon is clicked', async () => {
    const { emitted } = await mountPicker({ disabled: true, modelValue: '' });

    const starOption = screen.getByRole('option', { name: 'star' });
    // The button is disabled so fireEvent.click should still dispatch, but
    // the handler guards against emission when disabled.
    await fireEvent.click(starOption);

    expect(emitted('update:modelValue')).toBeUndefined();
  });

  it('sets aria-disabled on the listbox when disabled=true', async () => {
    // When disabled=true and the manifest is loaded, the listbox renders with
    // aria-disabled="true". Icon buttons are also individually disabled.
    await mountPicker({ disabled: true });
    const grid = screen.getByRole('listbox');
    expect(grid.getAttribute('aria-disabled')).toBe('true');
  });
});

// ---------------------------------------------------------------------------
// 5. Loading state (before manifest resolves)
// ---------------------------------------------------------------------------

describe('IconPicker — loading state', () => {
  it('shows the loading message before manifest resolves', () => {
    // Render without awaiting — catch the loading state before onMounted runs.
    render(IconPicker, {
      props: { modelValue: '' },
    });
    // The loading message should be visible synchronously before onMounted.
    expect(screen.getByText('Loading icons…')).toBeDefined();
  });

  it('does not render a listbox while loading (no options to show)', () => {
    // During loading, role="listbox" is not rendered — a listbox with no
    // role="option" children would violate aria-required-children.
    render(IconPicker, {
      props: { modelValue: '' },
    });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('renders a status live region with the loading message', () => {
    render(IconPicker, {
      props: { modelValue: '' },
    });
    const status = screen.getByRole('status');
    expect(status.textContent).toContain('Loading icons…');
  });
});

// ---------------------------------------------------------------------------
// 6. Empty search result state
// ---------------------------------------------------------------------------

describe('IconPicker — empty search state', () => {
  it('shows a helpful message when no icons match the query', async () => {
    await mountPicker();
    const input = screen.getByRole('searchbox');
    await fireEvent.update(input, 'zzznomatch');

    const message = screen.getByText(/no icons match "zzznomatch"/i);
    expect(message).toBeDefined();
  });

  it('removes the listbox when no icons match (prevents aria-required-children violation)', async () => {
    await mountPicker();
    const input = screen.getByRole('searchbox');
    await fireEvent.update(input, 'zzznomatch');

    // role="listbox" must not appear when there are no role="option" children.
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 7. axe WCAG 2.1 AA scan
// ---------------------------------------------------------------------------

describe('IconPicker — axe WCAG 2.1 AA', () => {
  it('has zero violations — loaded state, no selection', async () => {
    const { container } = await mountPicker({ modelValue: '' });
    const violations = await runAxeWCAG(container);
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero violations — loaded state, with selection', async () => {
    const { container } = await mountPicker({ modelValue: 'star' });
    const violations = await runAxeWCAG(container);
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero violations — disabled state', async () => {
    const { container } = await mountPicker({ disabled: true, modelValue: '' });
    const violations = await runAxeWCAG(container);
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero violations — filtered results', async () => {
    const { container } = await mountPicker({ modelValue: '' });
    const input = screen.getByRole('searchbox');
    await fireEvent.update(input, 'arrow');
    const violations = await runAxeWCAG(container);
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero violations — no-match state', async () => {
    const { container } = await mountPicker({ modelValue: '' });
    const input = screen.getByRole('searchbox');
    await fireEvent.update(input, 'zzznomatch');
    const violations = await runAxeWCAG(container);
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero violations — loading state (no listbox rendered)', async () => {
    // In loading state, role="listbox" is absent — avoids aria-required-children
    // violation. The status live region announces the loading message.
    const { container } = render(IconPicker, {
      props: { modelValue: '' },
    });
    // Scan in loading state, before manifest resolves.
    const violations = await runAxeWCAG(container);
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Bonus: ICON_KEYS contract
// ---------------------------------------------------------------------------

describe('ICON_KEYS', () => {
  it('is a non-empty readonly array of strings', () => {
    expect(Array.isArray(ICON_KEYS)).toBe(true);
    expect(ICON_KEYS.length).toBeGreaterThan(0);
  });

  it('contains expected common icons', () => {
    expect(ICON_KEYS).toContain('star');
    expect(ICON_KEYS).toContain('search');
    expect(ICON_KEYS).toContain('settings');
    expect(ICON_KEYS).toContain('arrow-left');
  });
});
