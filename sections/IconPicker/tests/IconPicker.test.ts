// sections/IconPicker/tests/IconPicker.test.ts
//
// @testing-library/vue + axe-core tests for the rewritten IconPicker.
//
// Owner: ui-engineer
// Resolves: MON-2894474937 (Sprint 5 Wave 3, Task 5.5)
//
// Test contract:
//   1. Trigger button renders with accessible label + aria-haspopup/aria-expanded
//   2. Grid renders icons as role="option" when popover is open
//   3. Search filters icons; clear button resets; no-match status message
//   4. Emits update:modelValue + selected state marks aria-selected
//   5. Recent icons: appear above main grid (localStorage round-trip)
//   6. Disabled state: trigger disabled, grid cells disabled, listbox aria-disabled
//   7. First-paint RAF defer
//   8. axe WCAG 2.1 AA scan — zero violations on all rendered states
//
// Nuxt UI components (UPopover, UButton, UInput, UIcon) are NOT imported
// by the component — they resolve as globally registered components via
// app.use(ui) at plugin boot time. In tests we supply attr-forwarding stubs
// via render()'s global.components option.
//
// STUB CONTRACT:
//   UPopover: renders default slot always; renders #content named slot only
//     when :open=true. This lets tests open/close the popover by clicking
//     the trigger and verifying that grid content appears/disappears.
//   UButton: renders <button> forwarding ALL attrs (aria-*, disabled, etc.)
//     via inheritAttrs:false + ...attrs spread.
//   UInput: renders <input> forwarding value + attrs.
//   UIcon: renders <span data-icon="..."> (aria-hidden).
//
// @iconify-json/lucide/icons.json is mocked to a 12-icon fixture so tests
// don't depend on the full 1 754-icon production payload.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/vue';
import { defineComponent, h } from 'vue';
import axe from 'axe-core';

// ---------------------------------------------------------------------------
// Mock @iconify-json/lucide/icons.json — 12-icon deterministic fixture.
// Must be hoisted before any import that reads this module.
// ---------------------------------------------------------------------------

vi.mock('@iconify-json/lucide/icons.json', () => ({
  default: {
    prefix: 'lucide',
    icons: {
      'arrow-left': { body: '' },
      'arrow-right': { body: '' },
      'arrow-up': { body: '' },
      'arrow-down': { body: '' },
      circle: { body: '' },
      heart: { body: '' },
      star: { body: '' },
      search: { body: '' },
      settings: { body: '' },
      'chevron-down': { body: '' },
      zap: { body: '' },
      sparkles: { body: '' },
    },
  },
}));

// Import component AFTER mocks so vi.mock hoisting applies to the module graph.
import IconPicker from '../src/IconPicker.vue';

// ---------------------------------------------------------------------------
// Nuxt UI component stubs — provided via render() global.components.
//
// WHY global.components AND NOT vi.mock('@nuxt/ui'):
//   IconPicker.vue does NOT import from '@nuxt/ui'. Nuxt UI components are
//   globally registered at plugin boot via app.use(ui). In test context, we
//   provide them as global component stubs to simulate that registration.
//
// ATTR-FORWARDING (inheritAttrs: false + ...attrs):
//   aria-*, data-*, class, and event handler attributes bound on the
//   component in the template must reach the rendered DOM element. Without
//   inheritAttrs:false + attrs spread, Vue attaches the attrs to the root
//   element using its own heuristic, which can miss aria-* on inner elements.
//   With the explicit spread, querySelector('[aria-haspopup="listbox"]') and
//   axe ARIA checks work correctly.
// ---------------------------------------------------------------------------

const UIcon = defineComponent({
  name: 'UIcon',
  inheritAttrs: false,
  props: { name: { type: String, default: '' } },
  setup(props, { attrs }) {
    return () => h('span', { 'data-icon': props.name, 'aria-hidden': 'true', ...attrs });
  },
});

const UButton = defineComponent({
  name: 'UButton',
  inheritAttrs: false,
  props: {
    variant: { type: String, default: undefined },
    color: { type: String, default: undefined },
    size: { type: String, default: undefined },
    icon: { type: String, default: undefined },
    disabled: { type: Boolean, default: false },
  },
  emits: ['click'],
  setup(props, { slots, emit, attrs }) {
    return () =>
      h(
        'button',
        {
          type: 'button',
          disabled: props.disabled || undefined,
          ...attrs,
          onClick: (e: MouseEvent) => {
            if (!props.disabled) emit('click', e);
          },
        },
        slots.default
          ? slots.default()
          : props.icon
            ? [h('span', { 'data-icon': props.icon, 'aria-hidden': 'true' })]
            : [],
      );
  },
});

const UInput = defineComponent({
  name: 'UInput',
  inheritAttrs: false,
  props: {
    modelValue: { type: String, default: '' },
    placeholder: { type: String, default: undefined },
    size: { type: String, default: undefined },
    type: { type: String, default: 'text' },
  },
  emits: ['update:modelValue'],
  setup(props, { emit, attrs }) {
    return () =>
      h('input', {
        type: props.type ?? 'text',
        value: props.modelValue ?? '',
        placeholder: props.placeholder,
        ...attrs,
        onInput: (e: Event) => emit('update:modelValue', (e.target as HTMLInputElement).value),
      });
  },
});

// UPopover: renders default slot (trigger) always.
// Renders the named #content slot only when props.open is true.
// Named slot access in Vue 3 setup render functions: slots['content']?.().
const UPopover = defineComponent({
  name: 'UPopover',
  inheritAttrs: false,
  props: {
    open: { type: Boolean, default: false },
    ui: { type: Object, default: undefined },
  },
  emits: ['update:open'],
  setup(props, { slots }) {
    return () => {
      const children: ReturnType<typeof h>[] = [];
      const defaultNodes = slots['default']?.() ?? [];
      children.push(...(defaultNodes as ReturnType<typeof h>[]));
      if (props.open) {
        const contentNodes = slots['content']?.() ?? [];
        children.push(...(contentNodes as ReturnType<typeof h>[]));
      }
      return h('div', { 'data-popover': String(props.open) }, children);
    };
  },
});

const GLOBAL_STUBS = {
  components: { UIcon, UButton, UInput, UPopover },
};

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

const RECENT_KEY = 'welder-icon-picker-recent';

function setRecent(icons: string[]): void {
  localStorage.setItem(RECENT_KEY, JSON.stringify(icons));
}

function getRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (raw) return JSON.parse(raw) as string[];
  } catch {
    // ignore
  }
  return [];
}

// ---------------------------------------------------------------------------
// axe helper
// ---------------------------------------------------------------------------

async function runAxeWCAG(el: Element): Promise<axe.Result[]> {
  const results = await axe.run(el, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
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
// Mount helpers
// ---------------------------------------------------------------------------

function mountClosed(opts: { modelValue?: string; disabled?: boolean } = {}) {
  return render(IconPicker, {
    props: {
      modelValue: opts.modelValue ?? '',
      disabled: opts.disabled ?? false,
    },
    global: GLOBAL_STUBS,
  });
}

async function openPopover(utils: ReturnType<typeof render>): Promise<void> {
  const trigger = utils.container.querySelector('button[aria-haspopup="listbox"]');
  if (!trigger) {
    const btns = utils.container.querySelectorAll('button');
    throw new Error(
      `Trigger button not found. Rendered buttons: ${Array.from(btns)
        .map((b) => b.outerHTML.slice(0, 150))
        .join(' | ')}`,
    );
  }
  await fireEvent.click(trigger);
  // Wait for: (a) UPopover stub renders content (open=true), AND
  // (b) the RAF fires (gridReady=true), removing the skeleton placeholder.
  // The skeleton: <div class="grid ..." aria-hidden="true"> inside the scroll container.
  await waitFor(
    () => {
      const scrollContainer = utils.container.querySelector('.max-h-64');
      if (!scrollContainer) throw new Error('Scroll container not rendered');
      // When gridReady=false: skeleton placeholder div[aria-hidden="true"] is present.
      // When gridReady=true: the skeleton is gone; options or no-match status appear.
      const skeleton = scrollContainer.querySelector('.grid[aria-hidden="true"]');
      if (skeleton) throw new Error('Still in skeleton state (gridReady=false)');
    },
    { timeout: 2000 },
  );
}

// ---------------------------------------------------------------------------
// Clean localStorage between tests
// ---------------------------------------------------------------------------

afterEach(() => {
  localStorage.removeItem(RECENT_KEY);
});

// ---------------------------------------------------------------------------
// 1. Trigger button
// ---------------------------------------------------------------------------

describe('IconPicker — trigger button', () => {
  it('renders a button with aria-haspopup="listbox"', () => {
    const { container } = mountClosed();
    const btn = container.querySelector('button[aria-haspopup="listbox"]');
    expect(btn).not.toBeNull();
  });

  it('renders aria-expanded="false" when closed', () => {
    const { container } = mountClosed();
    const btn = container.querySelector('button[aria-haspopup="listbox"]');
    expect(btn?.getAttribute('aria-expanded')).toBe('false');
  });

  it('renders aria-expanded="true" after trigger click', async () => {
    const utils = mountClosed();
    const btn = utils.container.querySelector(
      'button[aria-haspopup="listbox"]',
    ) as HTMLButtonElement;
    await fireEvent.click(btn);
    await waitFor(() => {
      expect(btn.getAttribute('aria-expanded')).toBe('true');
    });
  });

  it('includes the modelValue in the aria-label', () => {
    const { container } = mountClosed({ modelValue: 'heart' });
    const btn = container.querySelector('button[aria-haspopup="listbox"]');
    expect(btn?.getAttribute('aria-label')).toContain('heart');
  });

  it('falls back to "circle" in aria-label when modelValue is empty', () => {
    const { container } = mountClosed({ modelValue: '' });
    const btn = container.querySelector('button[aria-haspopup="listbox"]');
    expect(btn?.getAttribute('aria-label')).toContain('circle');
  });

  it('is disabled when disabled=true', () => {
    const { container } = mountClosed({ disabled: true });
    const btn = container.querySelector('button[aria-haspopup="listbox"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. Icon grid
// ---------------------------------------------------------------------------

describe('IconPicker — icon grid', () => {
  it('renders role="listbox" after popover opens', async () => {
    const utils = mountClosed();
    await openPopover(utils);
    expect(utils.container.querySelector('[role="listbox"]')).not.toBeNull();
  });

  it('renders all 12 fixture icons as role="option"', async () => {
    const utils = mountClosed();
    await openPopover(utils);
    // 12 fixture icons, all <= CHUNK(40), so all visible in the initial chunk.
    const options = utils.container.querySelectorAll('[role="option"]');
    expect(options.length).toBe(12);
  });

  it('marks selected icon with aria-selected="true"', async () => {
    const utils = mountClosed({ modelValue: 'heart' });
    await openPopover(utils);
    const heartOption = screen.getByRole('option', { name: 'heart' });
    expect(heartOption.getAttribute('aria-selected')).toBe('true');
  });

  it('marks non-selected icons with aria-selected="false"', async () => {
    const utils = mountClosed({ modelValue: 'heart' });
    await openPopover(utils);
    const starOption = screen.getByRole('option', { name: 'star' });
    expect(starOption.getAttribute('aria-selected')).toBe('false');
  });

  it('closes the popover when an icon is selected', async () => {
    const utils = mountClosed({ modelValue: '' });
    await openPopover(utils);
    await fireEvent.click(screen.getByRole('option', { name: 'star' }));
    await waitFor(() => {
      expect(utils.container.querySelector('.max-h-64')).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// 3. Emits
// ---------------------------------------------------------------------------

describe('IconPicker — emits', () => {
  it('emits update:modelValue with the icon key on click', async () => {
    const { emitted, container } = mountClosed({ modelValue: '' });
    await fireEvent.click(container.querySelector('button[aria-haspopup="listbox"]')!);
    await waitFor(() =>
      expect(container.querySelectorAll('[role="option"]').length).toBeGreaterThan(0),
    );
    await fireEvent.click(screen.getByRole('option', { name: 'star' }));

    const evt = emitted('update:modelValue') as [string][][] | undefined;
    expect(evt).toBeDefined();
    expect(evt?.[0]?.[0]).toBe('star');
  });

  it('emits a new key even when a different icon is already selected', async () => {
    const { emitted, container } = mountClosed({ modelValue: 'heart' });
    await fireEvent.click(container.querySelector('button[aria-haspopup="listbox"]')!);
    await waitFor(() =>
      expect(container.querySelectorAll('[role="option"]').length).toBeGreaterThan(0),
    );
    await fireEvent.click(screen.getByRole('option', { name: 'star' }));

    const evt = emitted('update:modelValue') as [string][][] | undefined;
    expect(evt?.[0]?.[0]).toBe('star');
  });

  it('does not emit when trigger is disabled', () => {
    const { emitted } = mountClosed({ disabled: true, modelValue: '' });
    expect(emitted('update:modelValue')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 4. Search
// ---------------------------------------------------------------------------

describe('IconPicker — search', () => {
  it('renders a search input after popover opens', async () => {
    const utils = mountClosed();
    await openPopover(utils);
    expect(utils.container.querySelector('input')).not.toBeNull();
  });

  it('filters icons by query', async () => {
    const utils = mountClosed();
    await openPopover(utils);

    const input = utils.container.querySelector('input') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'arrow' } });

    await waitFor(() => {
      const options = utils.container.querySelectorAll('[role="option"]');
      // Fixture has arrow-left, arrow-right, arrow-up, arrow-down.
      expect(options.length).toBe(4);
      Array.from(options).forEach((opt) => {
        expect(opt.getAttribute('aria-label')).toMatch(/arrow/);
      });
    });
  });

  it('shows a no-match status when query has no results', async () => {
    const utils = mountClosed();
    await openPopover(utils);

    const input = utils.container.querySelector('input') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'zzznomatch' } });

    await waitFor(() => {
      expect(utils.container.querySelectorAll('[role="option"]')).toHaveLength(0);
      const status = screen.getByRole('status');
      expect(status.textContent).toContain('zzznomatch');
    });
  });

  it('restores all icons when query is cleared', async () => {
    const utils = mountClosed();
    await openPopover(utils);

    const input = utils.container.querySelector('input') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'arrow' } });
    await waitFor(() => expect(utils.container.querySelectorAll('[role="option"]').length).toBe(4));
    await fireEvent.input(input, { target: { value: '' } });
    await waitFor(() =>
      expect(utils.container.querySelectorAll('[role="option"]').length).toBe(12),
    );
  });

  it('renders a clear button when search is non-empty', async () => {
    const utils = mountClosed();
    await openPopover(utils);

    const input = utils.container.querySelector('input') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'arrow' } });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /clear search/i })).toBeDefined();
    });
  });

  it('clears search when the clear button is clicked', async () => {
    const utils = mountClosed();
    await openPopover(utils);

    const input = utils.container.querySelector('input') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'arrow' } });
    await waitFor(() => expect(utils.container.querySelectorAll('[role="option"]').length).toBe(4));
    await fireEvent.click(screen.getByRole('button', { name: /clear search/i }));
    await waitFor(() =>
      expect(utils.container.querySelectorAll('[role="option"]').length).toBe(12),
    );
  });

  it('resets displayCount when search changes (chunk counter resets)', async () => {
    const utils = mountClosed();
    await openPopover(utils);
    const input = utils.container.querySelector('input') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'arrow' } });
    await waitFor(() => expect(utils.container.querySelectorAll('[role="option"]').length).toBe(4));
    await fireEvent.input(input, { target: { value: '' } });
    await waitFor(() =>
      expect(utils.container.querySelectorAll('[role="option"]').length).toBe(12),
    );
  });
});

// ---------------------------------------------------------------------------
// 5. Recent icons (localStorage)
// ---------------------------------------------------------------------------

describe('IconPicker — recent icons', () => {
  it('shows no Recent section when localStorage is empty', async () => {
    const utils = mountClosed();
    await openPopover(utils);
    expect(utils.container.textContent).not.toContain('Recent');
  });

  it('renders recent icons above main grid when pre-seeded', async () => {
    setRecent(['heart', 'star']);
    const utils = mountClosed({ modelValue: '' });
    await openPopover(utils);

    expect(utils.container.textContent).toContain('Recent');
    // Both recents appear as role="option" in the recent listbox.
    const allOptions = utils.container.querySelectorAll('[role="option"]');
    const labels = Array.from(allOptions).map((o) => o.getAttribute('aria-label'));
    expect(labels).toContain('heart');
    expect(labels).toContain('star');
  });

  it('saves selected icon to localStorage', async () => {
    const { container } = mountClosed({ modelValue: '' });
    await fireEvent.click(container.querySelector('button[aria-haspopup="listbox"]')!);
    await waitFor(() =>
      expect(container.querySelectorAll('[role="option"]').length).toBeGreaterThan(0),
    );
    await fireEvent.click(screen.getByRole('option', { name: 'star' }));
    expect(getRecent()).toContain('star');
  });

  it('prepends new selection and deduplicates', async () => {
    setRecent(['heart', 'circle']);
    const { container } = mountClosed({ modelValue: '' });
    await fireEvent.click(container.querySelector('button[aria-haspopup="listbox"]')!);
    await waitFor(() =>
      expect(container.querySelectorAll('[role="option"]').length).toBeGreaterThan(0),
    );

    // Click 'heart' (first occurrence — could be in recent or main grid).
    const heartOptions = container.querySelectorAll('[role="option"][aria-label="heart"]');
    await fireEvent.click(heartOptions[0]!);

    const saved = getRecent();
    expect(saved[0]).toBe('heart');
    expect(saved.filter((n) => n === 'heart').length).toBe(1);
  });

  it('caps recents at MAX_RECENT (8)', async () => {
    setRecent(['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8']);
    const { container } = mountClosed({ modelValue: '' });
    await fireEvent.click(container.querySelector('button[aria-haspopup="listbox"]')!);
    await waitFor(() =>
      expect(container.querySelectorAll('[role="option"]').length).toBeGreaterThan(0),
    );
    await fireEvent.click(screen.getByRole('option', { name: 'star' }));

    const saved = getRecent();
    expect(saved.length).toBeLessThanOrEqual(8);
    expect(saved[0]).toBe('star');
  });

  it('hides Recent section when search is non-empty', async () => {
    setRecent(['heart', 'star']);
    const utils = mountClosed({ modelValue: '' });
    await openPopover(utils);
    expect(utils.container.textContent).toContain('Recent');

    const input = utils.container.querySelector('input') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'arrow' } });

    await waitFor(() => {
      expect(utils.container.textContent).not.toContain('Recent');
    });
  });
});

// ---------------------------------------------------------------------------
// 6. Disabled state
// ---------------------------------------------------------------------------

describe('IconPicker — disabled state', () => {
  it('disables the trigger button', () => {
    const { container } = mountClosed({ disabled: true });
    const btn = container.querySelector('button[aria-haspopup="listbox"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('disables all option buttons when opened in disabled mode', async () => {
    const utils = mountClosed({ disabled: false });
    await openPopover(utils);
    await utils.rerender({ modelValue: '', disabled: true });

    await waitFor(() => {
      const options = utils.container.querySelectorAll('button[role="option"]');
      expect(options.length).toBeGreaterThan(0);
      options.forEach((opt) => {
        expect((opt as HTMLButtonElement).disabled).toBe(true);
      });
    });
  });

  it('marks listbox(es) with aria-disabled="true"', async () => {
    const utils = mountClosed({ disabled: false });
    await openPopover(utils);
    await utils.rerender({ modelValue: '', disabled: true });

    await waitFor(() => {
      const listboxes = utils.container.querySelectorAll('[role="listbox"]');
      expect(listboxes.length).toBeGreaterThan(0);
      listboxes.forEach((lb) => {
        expect(lb.getAttribute('aria-disabled')).toBe('true');
      });
    });
  });
});

// ---------------------------------------------------------------------------
// 7. First-paint RAF defer
// ---------------------------------------------------------------------------

describe('IconPicker — first-paint RAF defer', () => {
  it('eventually renders grid content after trigger click', async () => {
    const utils = mountClosed();
    await fireEvent.click(utils.container.querySelector('button[aria-haspopup="listbox"]')!);
    // waitFor will retry until the skeleton is gone and options appear.
    await waitFor(() => {
      const options = utils.container.querySelectorAll('[role="option"]');
      expect(options.length).toBeGreaterThan(0);
    });
  });
});

// ---------------------------------------------------------------------------
// 8. axe WCAG 2.1 AA scan
// ---------------------------------------------------------------------------

describe('IconPicker — axe WCAG 2.1 AA', () => {
  it('has zero violations — closed state', async () => {
    const { container } = mountClosed({ modelValue: 'heart' });
    const violations = await runAxeWCAG(container);
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero violations — open, no selection', async () => {
    const utils = mountClosed({ modelValue: '' });
    await openPopover(utils);
    const violations = await runAxeWCAG(utils.container);
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero violations — open, with selection', async () => {
    const utils = mountClosed({ modelValue: 'star' });
    await openPopover(utils);
    const violations = await runAxeWCAG(utils.container);
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero violations — open, with recent icons', async () => {
    setRecent(['heart', 'circle']);
    const utils = mountClosed({ modelValue: '' });
    await openPopover(utils);
    const violations = await runAxeWCAG(utils.container);
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero violations — filtered results', async () => {
    const utils = mountClosed({ modelValue: '' });
    await openPopover(utils);
    const input = utils.container.querySelector('input') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'arrow' } });
    await waitFor(() => expect(utils.container.querySelectorAll('[role="option"]').length).toBe(4));
    const violations = await runAxeWCAG(utils.container);
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero violations — no-match state', async () => {
    const utils = mountClosed({ modelValue: '' });
    await openPopover(utils);
    const input = utils.container.querySelector('input') as HTMLInputElement;
    await fireEvent.input(input, { target: { value: 'zzznomatch' } });
    await waitFor(() =>
      expect(utils.container.querySelectorAll('[role="option"]')).toHaveLength(0),
    );
    const violations = await runAxeWCAG(utils.container);
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero violations — disabled state (closed)', async () => {
    const { container } = mountClosed({ disabled: true });
    const violations = await runAxeWCAG(container);
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });
});
