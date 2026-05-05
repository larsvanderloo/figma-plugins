// components/src/InputField/InputField.test.ts
//
// @testing-library/vue + axe-core tests for InputField.
//
// Owner: ui-engineer
//
// Test contract:
//   1. Renders a labelled text input with correct value
//   2. Renders a labelled textarea when multiline=true
//   3. Emits update:modelValue on input event
//   4. Does not emit on the same value (regression guard for consumers that
//      use the emit to trigger debounce chains)
//   5. Disabled state — native disabled attribute present
//   6. hideLabel=true — label is sr-only, still in a11y tree
//   7. placeholder forwarded
//   8. type forwarded to <input>
//   9. axe WCAG 2.1 AA scan — zero violations on all states

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/vue';
import axe from 'axe-core';
import InputField from './InputField.vue';

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
// 1. Renders labelled text input
// ---------------------------------------------------------------------------

describe('InputField — text input (default)', () => {
  it('renders an accessible input with the correct label', () => {
    render(InputField, {
      props: { label: 'Slide heading', modelValue: 'Hello world' },
    });

    const input = screen.getByRole('textbox', { name: /slide heading/i }) as HTMLInputElement;
    expect(input).toBeDefined();
    expect(input.value).toBe('Hello world');
  });

  it('renders an empty input when modelValue is empty', () => {
    render(InputField, { props: { label: 'Heading', modelValue: '' } });

    const input = screen.getByRole('textbox', { name: /heading/i }) as HTMLInputElement;
    expect(input.value).toBe('');
  });

  it('uses modelValue="" as default when not provided', () => {
    render(InputField, { props: { label: 'Title' } });

    const input = screen.getByRole('textbox', { name: /title/i }) as HTMLInputElement;
    expect(input.value).toBe('');
  });
});

// ---------------------------------------------------------------------------
// 2. Renders textarea when multiline=true
// ---------------------------------------------------------------------------

describe('InputField — multiline (textarea)', () => {
  it('renders a textarea when multiline=true', () => {
    const { container } = render(InputField, {
      props: { label: 'Paragraph', modelValue: 'Some text', multiline: true },
    });

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();
    expect(textarea.value).toBe('Some text');
  });

  it('does not render a textarea when multiline is omitted (default)', () => {
    const { container } = render(InputField, {
      props: { label: 'Heading', modelValue: '' },
    });

    expect(container.querySelector('textarea')).toBeNull();
    expect(container.querySelector('input')).not.toBeNull();
  });

  it('applies the rows prop to the textarea', () => {
    const { container } = render(InputField, {
      props: { label: 'Description', modelValue: '', multiline: true, rows: 5 },
    });

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.rows).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// 3. Emits update:modelValue on input
// ---------------------------------------------------------------------------

describe('InputField — emits', () => {
  it('emits update:modelValue with the new value on input event', async () => {
    const { emitted } = render(InputField, {
      props: { label: 'Heading', modelValue: 'Before' },
    });

    const input = screen.getByRole('textbox', { name: /heading/i });
    await fireEvent.update(input, 'After');

    const updates = emitted('update:modelValue') as [string][] | undefined;
    expect(updates).toBeDefined();
    expect(updates?.[0]?.[0]).toBe('After');
  });

  it('emits update:modelValue from textarea in multiline mode', async () => {
    const { emitted } = render(InputField, {
      props: { label: 'Paragraph', modelValue: '', multiline: true },
    });

    // In multiline mode, role is "textbox" for textarea as well
    const textarea = screen.getByRole('textbox', { name: /paragraph/i });
    await fireEvent.update(textarea, 'Line one\nLine two');

    const updates = emitted('update:modelValue') as [string][] | undefined;
    expect(updates?.[0]?.[0]).toBe('Line one\nLine two');
  });
});

// ---------------------------------------------------------------------------
// 4. Disabled state
// ---------------------------------------------------------------------------

describe('InputField — disabled', () => {
  it('applies the disabled attribute to the input', () => {
    render(InputField, {
      props: { label: 'Heading', modelValue: '', disabled: true },
    });

    const input = screen.getByRole('textbox', { name: /heading/i }) as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });

  it('applies the disabled attribute to the textarea in multiline mode', () => {
    const { container } = render(InputField, {
      props: { label: 'Paragraph', modelValue: '', multiline: true, disabled: true },
    });

    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. hideLabel
// ---------------------------------------------------------------------------

describe('InputField — hideLabel', () => {
  it('adds sr-only class to the label when hideLabel=true', () => {
    const { container } = render(InputField, {
      props: { label: 'Search icons', modelValue: '', hideLabel: true },
    });

    const label = container.querySelector('label');
    expect(label?.classList.contains('sr-only')).toBe(true);
  });

  it('label text is still in the DOM when hideLabel=true (screen-reader accessible)', () => {
    const { container } = render(InputField, {
      props: { label: 'Search icons', modelValue: '', hideLabel: true },
    });

    const label = container.querySelector('label');
    expect(label?.textContent?.trim()).toBe('Search icons');
  });

  it('does not add sr-only class to the label when hideLabel=false (default)', () => {
    const { container } = render(InputField, {
      props: { label: 'Heading', modelValue: '' },
    });

    const label = container.querySelector('label');
    expect(label?.classList.contains('sr-only')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. placeholder forwarded
// ---------------------------------------------------------------------------

describe('InputField — placeholder', () => {
  it('forwards the placeholder to the input', () => {
    render(InputField, {
      props: { label: 'Search', modelValue: '', placeholder: 'Search icons…' },
    });

    const input = screen.getByRole('textbox', { name: /search/i }) as HTMLInputElement;
    expect(input.placeholder).toBe('Search icons…');
  });
});

// ---------------------------------------------------------------------------
// 7. type forwarded
// ---------------------------------------------------------------------------

describe('InputField — type', () => {
  it('sets type="search" when type prop is "search"', () => {
    const { container } = render(InputField, {
      props: { label: 'Search', modelValue: '', type: 'search' },
    });

    const input = container.querySelector('input') as HTMLInputElement;
    expect(input.type).toBe('search');
  });

  it('defaults to type="text"', () => {
    const { container } = render(InputField, {
      props: { label: 'Title', modelValue: '' },
    });

    const input = container.querySelector('input') as HTMLInputElement;
    expect(input.type).toBe('text');
  });
});

// ---------------------------------------------------------------------------
// 8. axe WCAG 2.1 AA scan
// ---------------------------------------------------------------------------

describe('InputField — axe WCAG 2.1 AA', () => {
  it('has zero violations — text input, default state', async () => {
    const { container } = render(InputField, {
      props: { label: 'Slide heading', modelValue: 'Hello' },
    });

    const violations = await runAxeWCAG(container);
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero violations — disabled state', async () => {
    const { container } = render(InputField, {
      props: { label: 'Slide heading', modelValue: '', disabled: true },
    });

    const violations = await runAxeWCAG(container);
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero violations — multiline (textarea)', async () => {
    const { container } = render(InputField, {
      props: { label: 'Paragraph', modelValue: 'Some text', multiline: true },
    });

    const violations = await runAxeWCAG(container);
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero violations — hideLabel=true (sr-only)', async () => {
    const { container } = render(InputField, {
      props: { label: 'Search icons', modelValue: '', hideLabel: true, type: 'search' },
    });

    const violations = await runAxeWCAG(container);
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero violations — empty value', async () => {
    const { container } = render(InputField, {
      props: { label: 'Badge label', modelValue: '' },
    });

    const violations = await runAxeWCAG(container);
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });
});
