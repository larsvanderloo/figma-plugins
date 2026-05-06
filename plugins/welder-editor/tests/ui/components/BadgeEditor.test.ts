// sections/BadgeEditor/tests/BadgeEditor.test.ts
//
// @testing-library/vue + axe-core tests for BadgeEditor.
//
// Owner: ui-engineer
//
// Test contract (ADR-0010 §section authoring template):
//   1. Renders label input and icon-picker slot
//   2. Emits update:model when label is edited (debounced 300 ms)
//   3. Emits update:model when slot's onChange is called with a new icon
//   4. Disabled state — label input is disabled, slot receives disabled=true
//   5. Does not emit when icon value is unchanged
//   6. Prop sync — external model replacement updates local state
//   7. axe WCAG 2.1 AA scan — zero violations on all states
//
// Mutation discipline: BadgeEditor is a pure render consumer; all writes
// flow through emits. It does not call any Pinia store directly.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/vue';
import { defineComponent, ref, h } from 'vue';
import axe from 'axe-core';
import BadgeEditor from '../../../ui/components/BadgeEditor.vue';
import type { BadgeModel } from '../../../ui/components/types.js';

// ---------------------------------------------------------------------------
// Fake timers — control debounce
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BADGE_A: BadgeModel = {
  badgeNodeId: 'badge-node-1',
  label: 'New Feature',
  icon: 'sparkles',
};

const BADGE_EMPTY: BadgeModel = {
  badgeNodeId: 'badge-node-2',
  label: '',
  icon: 'circle',
};

// ---------------------------------------------------------------------------
// axe helper
// ---------------------------------------------------------------------------

async function runAxeWCAG(el: Element): Promise<axe.Result[]> {
  // axe-core needs real timers when running async scans
  vi.useRealTimers();
  const results = await axe.run(el, {
    runOnly: {
      type: 'tag',
      values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'],
    },
  });
  vi.useFakeTimers();
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
// 1. Renders label input and icon-picker slot
// ---------------------------------------------------------------------------

describe('BadgeEditor — rendering', () => {
  it('renders a label input with the current label value', () => {
    render(BadgeEditor, { props: { model: BADGE_A } });

    const input = screen.getByRole('textbox', { name: /badge label/i }) as HTMLInputElement;
    expect(input).toBeDefined();
    expect(input.value).toBe(BADGE_A.label);
  });

  it('renders the icon-picker slot when provided', () => {
    const { container } = render(BadgeEditor, {
      props: { model: BADGE_A },
      slots: {
        'icon-picker': '<div data-testid="icon-picker-stub">icon picker stub</div>',
      },
    });

    const stub = container.querySelector('[data-testid="icon-picker-stub"]');
    expect(stub).not.toBeNull();
  });

  it('renders nothing in the icon-picker slot area when no slot is provided', () => {
    const { container } = render(BadgeEditor, { props: { model: BADGE_A } });
    // slot area is present but empty
    const stub = container.querySelector('[data-testid="icon-picker-stub"]');
    expect(stub).toBeNull();
  });

  it('passes the current icon key to the slot via the icon binding', () => {
    let slotIcon: string | undefined;

    const Consumer = defineComponent({
      setup() {
        return () =>
          h(
            BadgeEditor,
            { model: BADGE_A },
            {
              'icon-picker': ({ icon }: { icon: string }) => {
                slotIcon = icon;
                return h('span', { 'data-testid': 'slot-icon' }, icon);
              },
            },
          );
      },
    });

    render(Consumer);
    expect(slotIcon).toBe(BADGE_A.icon);
  });
});

// ---------------------------------------------------------------------------
// 2. Emits update:model on label edit (debounced 300 ms)
// ---------------------------------------------------------------------------

describe('BadgeEditor — label emit', () => {
  it('emits update:model after 300 ms debounce on label input', async () => {
    const { emitted } = render(BadgeEditor, { props: { model: BADGE_A } });

    const input = screen.getByRole('textbox', { name: /badge label/i });
    // fireEvent.update sets .value and fires input + change, which is what
    // @testing-library/vue recommends for controlled form elements.
    await fireEvent.update(input, 'Updated Label');

    // Not emitted yet — still within debounce window
    expect(emitted('update:model')).toBeUndefined();

    vi.advanceTimersByTime(300);

    const updates = emitted('update:model') as [Pick<BadgeModel, 'label' | 'icon'>][] | undefined;
    expect(updates).toHaveLength(1);
    expect(updates?.[0]?.[0]).toEqual({ label: 'Updated Label', icon: BADGE_A.icon });
  });

  it('resets the debounce on rapid keystrokes, emitting only once after silence', async () => {
    const { emitted } = render(BadgeEditor, { props: { model: BADGE_A } });

    const input = screen.getByRole('textbox', { name: /badge label/i });

    // Three rapid inputs within the debounce window
    await fireEvent.update(input, 'A');
    vi.advanceTimersByTime(100);
    await fireEvent.update(input, 'AB');
    vi.advanceTimersByTime(100);
    await fireEvent.update(input, 'ABC');
    vi.advanceTimersByTime(300);

    const updates = emitted('update:model') as [Pick<BadgeModel, 'label' | 'icon'>][] | undefined;
    expect(updates).toHaveLength(1);
    expect(updates?.[0]?.[0]?.label).toBe('ABC');
  });

  it('emits with an empty label when cleared', async () => {
    const { emitted } = render(BadgeEditor, { props: { model: BADGE_A } });

    const input = screen.getByRole('textbox', { name: /badge label/i });
    await fireEvent.update(input, '');
    vi.advanceTimersByTime(300);

    const updates = emitted('update:model') as [Pick<BadgeModel, 'label' | 'icon'>][] | undefined;
    expect(updates?.[0]?.[0]?.label).toBe('');
  });
});

// ---------------------------------------------------------------------------
// 3. Emits update:model when slot's onChange is called
// ---------------------------------------------------------------------------

describe('BadgeEditor — icon-picker slot onChange', () => {
  it('emits update:model after slot calls onChange with a new icon', async () => {
    let slotOnChange: ((icon: string) => void) | undefined;

    const Consumer = defineComponent({
      emits: ['update:model'],
      setup(_, { emit }) {
        return () =>
          h(
            BadgeEditor,
            {
              model: BADGE_A,
              'onUpdate:model': (m: Pick<BadgeModel, 'label' | 'icon'>) => emit('update:model', m),
            },
            {
              'icon-picker': ({ onChange }: { onChange: (icon: string) => void }) => {
                slotOnChange = onChange;
                return h('button', { 'data-testid': 'icon-btn' }, 'pick icon');
              },
            },
          );
      },
    });

    const { emitted } = render(Consumer);

    expect(slotOnChange).toBeDefined();
    slotOnChange!('heart');
    vi.advanceTimersByTime(300);

    const updates = emitted('update:model') as [Pick<BadgeModel, 'label' | 'icon'>][] | undefined;
    expect(updates).toHaveLength(1);
    expect(updates?.[0]?.[0]).toEqual({ label: BADGE_A.label, icon: 'heart' });
  });

  it('does not emit when onChange is called with the same icon value', async () => {
    let slotOnChange: ((icon: string) => void) | undefined;

    const Consumer = defineComponent({
      emits: ['update:model'],
      setup(_, { emit }) {
        return () =>
          h(
            BadgeEditor,
            {
              model: BADGE_A,
              'onUpdate:model': (m: Pick<BadgeModel, 'label' | 'icon'>) => emit('update:model', m),
            },
            {
              'icon-picker': ({ onChange }: { onChange: (icon: string) => void }) => {
                slotOnChange = onChange;
                return h('span');
              },
            },
          );
      },
    });

    const { emitted } = render(Consumer);

    // Same icon as BADGE_A.icon — no change, no emit
    slotOnChange!(BADGE_A.icon);
    vi.advanceTimersByTime(300);

    expect(emitted('update:model')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 4. Disabled state
// ---------------------------------------------------------------------------

describe('BadgeEditor — disabled state', () => {
  it('disables the label input when disabled=true', () => {
    render(BadgeEditor, { props: { model: BADGE_A, disabled: true } });

    const input = screen.getByRole('textbox', { name: /badge label/i }) as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });

  it('passes disabled=true to the slot when disabled prop is true', () => {
    let slotDisabled: boolean | undefined;

    const Consumer = defineComponent({
      setup() {
        return () =>
          h(
            BadgeEditor,
            { model: BADGE_A, disabled: true },
            {
              'icon-picker': ({ disabled }: { disabled: boolean }) => {
                slotDisabled = disabled;
                return h('span');
              },
            },
          );
      },
    });

    render(Consumer);
    expect(slotDisabled).toBe(true);
  });

  it('passes disabled=false to the slot when disabled prop is false', () => {
    let slotDisabled: boolean | undefined;

    const Consumer = defineComponent({
      setup() {
        return () =>
          h(
            BadgeEditor,
            { model: BADGE_A, disabled: false },
            {
              'icon-picker': ({ disabled }: { disabled: boolean }) => {
                slotDisabled = disabled;
                return h('span');
              },
            },
          );
      },
    });

    render(Consumer);
    expect(slotDisabled).toBe(false);
  });

  it('confirms the label input carries the disabled attribute when disabled=true', () => {
    // The browser's native disabled behavior prevents user interaction at
    // the UA level. We verify the attribute is present — that is the
    // contract. Programmatic event dispatch in jsdom bypasses this guard,
    // so we do not simulate editing a disabled input here.
    render(BadgeEditor, { props: { model: BADGE_A, disabled: true } });

    const input = screen.getByRole('textbox', { name: /badge label/i }) as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. Prop sync — external model replacement
// ---------------------------------------------------------------------------

describe('BadgeEditor — prop sync', () => {
  it('updates the label input when model prop is replaced externally', async () => {
    const model = ref<BadgeModel>(BADGE_A);

    const Consumer = defineComponent({
      setup() {
        return () => h(BadgeEditor, { model: model.value });
      },
    });

    render(Consumer);

    const input = screen.getByRole('textbox', { name: /badge label/i }) as HTMLInputElement;
    expect(input.value).toBe(BADGE_A.label);

    model.value = { ...BADGE_A, label: 'Replaced Label' };

    // Flush Vue reactivity
    await vi.runAllTimersAsync();

    // The input should reflect the new prop value
    expect(input.value).toBe('Replaced Label');
  });
});

// ---------------------------------------------------------------------------
// 6. axe WCAG 2.1 AA scan — all states
// ---------------------------------------------------------------------------

describe('BadgeEditor — axe WCAG 2.1 AA', () => {
  async function mountAndScan(
    props: { model: BadgeModel; disabled?: boolean },
    slots?: Record<string, string>,
  ): Promise<axe.Result[]> {
    const { container } = render(BadgeEditor, { props, slots });
    return runAxeWCAG(container);
  }

  it('has zero WCAG 2.1 AA violations — default state (no slot)', async () => {
    const violations = await mountAndScan({ model: BADGE_A });
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero WCAG 2.1 AA violations — with icon-picker slot content', async () => {
    const violations = await mountAndScan(
      { model: BADGE_A },
      {
        'icon-picker': '<button type="button" aria-label="Choose icon: sparkles">sparkles</button>',
      },
    );
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero WCAG 2.1 AA violations — disabled state', async () => {
    const violations = await mountAndScan({ model: BADGE_A, disabled: true });
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero WCAG 2.1 AA violations — empty label', async () => {
    const violations = await mountAndScan({ model: BADGE_EMPTY });
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });
});
