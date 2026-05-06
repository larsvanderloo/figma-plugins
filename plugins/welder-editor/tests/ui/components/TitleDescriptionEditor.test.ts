// sections/TitleDescriptionEditor/tests/TitleDescriptionEditor.test.ts
//
// @testing-library/vue + axe-core tests for TitleDescriptionEditor.
//
// Owner: ui-engineer
//
// Test contract (ADR-0010 §section-authoring-template):
//   1. Renders heading input + paragraph textarea when paragraph !== null
//   2. Hides paragraph textarea when paragraph === null
//   3. Emits `update:model` on input (debounced 200 ms)
//   4. Disabled state disables both inputs
//   5. Labels properly associated (explicit <label for="…">)
//   6. Model prop change syncs local state (slide switch)
//   7. axe WCAG 2.1 AA scan — zero violations on all states
//
// Mutation discipline: TitleDescriptionEditor never dispatches messages
// directly. It is a pure emit consumer; all writes flow through
// `update:model` to the parent. This matches SlidePicker's emit discipline
// (ADR-0010).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/vue';
import axe from 'axe-core';
import TitleDescriptionEditor from '../../../ui/components/TitleDescriptionEditor.vue';
import type { TitleDescriptionModel } from '../../../ui/components/types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MODEL_WITH_PARAGRAPH: TitleDescriptionModel = {
  copyWrapId: 'node-copywrap-1',
  heading: 'Customer Journey',
  paragraph: 'A description of the customer journey across three touchpoints.',
};

const MODEL_NO_PARAGRAPH: TitleDescriptionModel = {
  copyWrapId: 'node-copywrap-2',
  heading: 'Key Metrics',
  paragraph: null,
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
// 1. Renders heading input + paragraph textarea when paragraph !== null
// ---------------------------------------------------------------------------

describe('TitleDescriptionEditor — renders with paragraph', () => {
  it('renders a labelled heading input', () => {
    render(TitleDescriptionEditor, { props: { model: MODEL_WITH_PARAGRAPH } });

    // Label text "Heading" must be present.
    expect(screen.getByLabelText('Heading')).toBeDefined();
    // The input should be a text input.
    const input = screen.getByLabelText('Heading') as HTMLInputElement;
    expect(input.tagName.toLowerCase()).toBe('input');
    expect(input.type).toBe('text');
  });

  it('pre-fills the heading input with model.heading', () => {
    render(TitleDescriptionEditor, { props: { model: MODEL_WITH_PARAGRAPH } });

    const input = screen.getByLabelText('Heading') as HTMLInputElement;
    expect(input.value).toBe(MODEL_WITH_PARAGRAPH.heading);
  });

  it('renders a labelled paragraph textarea when paragraph !== null', () => {
    render(TitleDescriptionEditor, { props: { model: MODEL_WITH_PARAGRAPH } });

    expect(screen.getByLabelText('Paragraph')).toBeDefined();
    const textarea = screen.getByLabelText('Paragraph') as HTMLTextAreaElement;
    expect(textarea.tagName.toLowerCase()).toBe('textarea');
  });

  it('pre-fills the paragraph textarea with model.paragraph', () => {
    render(TitleDescriptionEditor, { props: { model: MODEL_WITH_PARAGRAPH } });

    const textarea = screen.getByLabelText('Paragraph') as HTMLTextAreaElement;
    expect(textarea.value).toBe(MODEL_WITH_PARAGRAPH.paragraph);
  });
});

// ---------------------------------------------------------------------------
// 2. Hides paragraph textarea when paragraph === null
// ---------------------------------------------------------------------------

describe('TitleDescriptionEditor — paragraph === null', () => {
  it('still renders the heading input', () => {
    render(TitleDescriptionEditor, { props: { model: MODEL_NO_PARAGRAPH } });

    expect(screen.getByLabelText('Heading')).toBeDefined();
  });

  it('does NOT render a paragraph textarea when paragraph is null', () => {
    render(TitleDescriptionEditor, { props: { model: MODEL_NO_PARAGRAPH } });

    // queryByLabelText returns null when the element is absent.
    expect(screen.queryByLabelText('Paragraph')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. Emits `update:model` on input — debounced 200 ms
// ---------------------------------------------------------------------------

describe('TitleDescriptionEditor — update:model emit (debounced)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does NOT emit immediately after heading input', async () => {
    const { emitted } = render(TitleDescriptionEditor, {
      props: { model: MODEL_WITH_PARAGRAPH },
    });

    const input = screen.getByLabelText('Heading');
    await fireEvent.input(input, { target: { value: 'New Title' } });

    // No emit yet — debounce is pending.
    expect(emitted('update:model')).toBeUndefined();
  });

  it('emits update:model with updated heading after 200 ms', async () => {
    const { emitted } = render(TitleDescriptionEditor, {
      props: { model: MODEL_WITH_PARAGRAPH },
    });

    const input = screen.getByLabelText('Heading');
    await fireEvent.input(input, { target: { value: 'New Title' } });

    vi.advanceTimersByTime(200);

    const events = emitted('update:model') as [{ heading: string; paragraph: string | null }][];
    expect(events).toHaveLength(1);
    expect(events[0]?.[0]?.heading).toBe('New Title');
    // Paragraph should be passed through unchanged.
    expect(events[0]?.[0]?.paragraph).toBe(MODEL_WITH_PARAGRAPH.paragraph);
  });

  it('debounces — only one emit for rapid consecutive heading inputs', async () => {
    const { emitted } = render(TitleDescriptionEditor, {
      props: { model: MODEL_WITH_PARAGRAPH },
    });

    const input = screen.getByLabelText('Heading');
    await fireEvent.input(input, { target: { value: 'A' } });
    vi.advanceTimersByTime(80);
    await fireEvent.input(input, { target: { value: 'Ab' } });
    vi.advanceTimersByTime(80);
    await fireEvent.input(input, { target: { value: 'Abc' } });
    vi.advanceTimersByTime(200);

    const events = emitted('update:model') as unknown[] | undefined;
    // Only one emit despite three inputs.
    expect(events).toHaveLength(1);
  });

  it('emits with updated paragraph after 200 ms', async () => {
    const { emitted } = render(TitleDescriptionEditor, {
      props: { model: MODEL_WITH_PARAGRAPH },
    });

    const textarea = screen.getByLabelText('Paragraph');
    await fireEvent.input(textarea, { target: { value: 'Updated paragraph text.' } });

    vi.advanceTimersByTime(200);

    const events = emitted('update:model') as [{ heading: string; paragraph: string | null }][];
    expect(events).toHaveLength(1);
    expect(events[0]?.[0]?.paragraph).toBe('Updated paragraph text.');
    // Heading should be passed through unchanged.
    expect(events[0]?.[0]?.heading).toBe(MODEL_WITH_PARAGRAPH.heading);
  });

  it('does NOT emit for paragraph when paragraph is null (no textarea)', async () => {
    const { emitted } = render(TitleDescriptionEditor, {
      props: { model: MODEL_NO_PARAGRAPH },
    });

    // No paragraph textarea rendered — only heading interaction possible.
    const input = screen.getByLabelText('Heading');
    await fireEvent.input(input, { target: { value: 'Metrics Title' } });

    vi.advanceTimersByTime(200);

    const events = emitted('update:model') as [{ heading: string; paragraph: string | null }][];
    expect(events).toHaveLength(1);
    // paragraph should still be null in the emit.
    expect(events[0]?.[0]?.paragraph).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 4. Disabled state
// ---------------------------------------------------------------------------

describe('TitleDescriptionEditor — disabled state', () => {
  it('disables the heading input when disabled=true', () => {
    render(TitleDescriptionEditor, {
      props: { model: MODEL_WITH_PARAGRAPH, disabled: true },
    });

    const input = screen.getByLabelText('Heading') as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });

  it('disables the paragraph textarea when disabled=true', () => {
    render(TitleDescriptionEditor, {
      props: { model: MODEL_WITH_PARAGRAPH, disabled: true },
    });

    const textarea = screen.getByLabelText('Paragraph') as HTMLTextAreaElement;
    expect(textarea.disabled).toBe(true);
  });

  it('does not disable inputs when disabled is not set (default false)', () => {
    render(TitleDescriptionEditor, {
      props: { model: MODEL_WITH_PARAGRAPH },
    });

    const input = screen.getByLabelText('Heading') as HTMLInputElement;
    expect(input.disabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5. Label association
// ---------------------------------------------------------------------------

describe('TitleDescriptionEditor — label association', () => {
  it('heading label is associated with the heading input via for/id', () => {
    render(TitleDescriptionEditor, { props: { model: MODEL_WITH_PARAGRAPH } });

    // getByLabelText throws if no association exists — passing means it works.
    const input = screen.getByLabelText('Heading');
    expect(input).toBeDefined();
  });

  it('paragraph label is associated with the textarea via for/id', () => {
    render(TitleDescriptionEditor, { props: { model: MODEL_WITH_PARAGRAPH } });

    const textarea = screen.getByLabelText('Paragraph');
    expect(textarea).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 6. Model prop change syncs local state (slide switch)
// ---------------------------------------------------------------------------

describe('TitleDescriptionEditor — model prop sync on slide change', () => {
  it('updates the heading input value when model prop changes', async () => {
    const { rerender } = render(TitleDescriptionEditor, {
      props: { model: MODEL_WITH_PARAGRAPH },
    });

    const newModel: TitleDescriptionModel = {
      copyWrapId: 'node-copywrap-99',
      heading: 'Completely Different Slide',
      paragraph: null,
    };

    await rerender({ model: newModel });

    const input = screen.getByLabelText('Heading') as HTMLInputElement;
    expect(input.value).toBe('Completely Different Slide');
  });

  it('hides paragraph after model prop change to paragraph=null', async () => {
    const { rerender } = render(TitleDescriptionEditor, {
      props: { model: MODEL_WITH_PARAGRAPH },
    });

    // Initially paragraph textarea is visible.
    expect(screen.getByLabelText('Paragraph')).toBeDefined();

    await rerender({ model: MODEL_NO_PARAGRAPH });

    // After rerender with null paragraph, textarea should be gone.
    expect(screen.queryByLabelText('Paragraph')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 7. axe WCAG 2.1 AA scan — all states
// ---------------------------------------------------------------------------

describe('TitleDescriptionEditor — axe WCAG 2.1 AA', () => {
  async function mountAndScan(props: {
    model: TitleDescriptionModel;
    disabled?: boolean;
  }): Promise<axe.Result[]> {
    const { container } = render(TitleDescriptionEditor, { props });
    return runAxeWCAG(container);
  }

  it('has zero WCAG 2.1 AA violations — with paragraph', async () => {
    const violations = await mountAndScan({ model: MODEL_WITH_PARAGRAPH });
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero WCAG 2.1 AA violations — paragraph null', async () => {
    const violations = await mountAndScan({ model: MODEL_NO_PARAGRAPH });
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero WCAG 2.1 AA violations — disabled with paragraph', async () => {
    const violations = await mountAndScan({ model: MODEL_WITH_PARAGRAPH, disabled: true });
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero WCAG 2.1 AA violations — disabled without paragraph', async () => {
    const violations = await mountAndScan({ model: MODEL_NO_PARAGRAPH, disabled: true });
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });
});
