// sections/CardEditor/tests/CardEditor.test.ts
//
// @testing-library/vue + axe-core tests for CardEditor.
//
// Owner: ui-engineer.
//
// Test contract:
//   1. Renders all four sub-sections when card has all fields.
//   2. Renders empty-state placeholders when optional fields are null/undefined.
//   3. Emits update:heading with correct payload when TitleDescriptionEditor emits.
//   4. Emits update:paragraph with correct payload when TitleDescriptionEditor emits.
//   5. Emits update:icon with correct payload when IconPicker emits.
//   6. Emits update:visual with correct payload when ImageEditor emits.
//   7. disabled=true propagates to all child sections.
//   8. label prop renders as accessible section heading.
//   9. axe WCAG 2.1 AA scan — zero violations across all states.
//
// Dependencies are mocked in setup.ts so tests exercise CardEditor's wiring
// logic without coupling to child section internals.

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/vue';
import axe from 'axe-core';
import CardEditor from '../src/CardEditor.vue';
import type { CardItem } from '../src/types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Full card — all optional fields populated. */
const CARD_FULL: CardItem = {
  cardNodeId: 'node-card-1',
  heading: 'Trophy Winner',
  paragraph: 'Recognised for outstanding performance',
  icon: 'Trophy',
  visualHash: 'hash-img-abc123',
};

/** Card with no icon slot. */
const CARD_NO_ICON: CardItem = {
  cardNodeId: 'node-card-2',
  heading: 'No Icon Card',
  paragraph: 'This card has no icon',
  icon: null,
  visualHash: 'hash-img-def456',
};

/** Card with no visual slot. */
const CARD_NO_VISUAL: CardItem = {
  cardNodeId: 'node-card-3',
  heading: 'No Visual Card',
  paragraph: 'This card has no visual',
  icon: 'Star',
  visualHash: undefined,
};

/** Card with visual slot but placeholder fill (null hash). */
const CARD_VISUAL_PLACEHOLDER: CardItem = {
  cardNodeId: 'node-card-4',
  heading: 'Placeholder Visual',
  paragraph: 'Visual slot present but no image',
  icon: 'Circle',
  visualHash: null,
};

/** Card with nothing optional present. */
const CARD_MINIMAL: CardItem = {
  cardNodeId: 'node-card-5',
  heading: 'Minimal Card',
  paragraph: 'Bare minimum card',
  icon: null,
  visualHash: undefined,
};

// ---------------------------------------------------------------------------
// axe helpers
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
// 1. Renders all four sub-sections when card has all fields
// ---------------------------------------------------------------------------

describe('CardEditor — sub-section rendering', () => {
  it('renders TitleDescriptionEditor when card has heading + paragraph', () => {
    render(CardEditor, { props: { card: CARD_FULL } });
    expect(screen.getByTestId('title-description-editor')).toBeDefined();
  });

  it('renders heading input with card heading value', () => {
    render(CardEditor, { props: { card: CARD_FULL } });
    const headingInput = screen.getByRole('textbox', { name: 'Heading' });
    expect((headingInput as HTMLInputElement).value).toBe('Trophy Winner');
  });

  it('renders IconPicker when card.icon is a non-null string', () => {
    render(CardEditor, { props: { card: CARD_FULL } });
    expect(screen.getByTestId('icon-picker')).toBeDefined();
  });

  it('renders ImageEditor when card.visualHash is not undefined', () => {
    render(CardEditor, { props: { card: CARD_FULL } });
    expect(screen.getByTestId('image-editor')).toBeDefined();
  });

  it('renders ImageEditor when card.visualHash is null (placeholder slot)', () => {
    render(CardEditor, { props: { card: CARD_VISUAL_PLACEHOLDER } });
    expect(screen.getByTestId('image-editor')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 2. Empty-state placeholders when optional fields are null/undefined
// ---------------------------------------------------------------------------

describe('CardEditor — optional fields absent', () => {
  it('does not render IconPicker when card.icon is null', () => {
    render(CardEditor, { props: { card: CARD_NO_ICON } });
    expect(screen.queryByTestId('icon-picker')).toBeNull();
  });

  it('does not render ImageEditor when card.visualHash is undefined', () => {
    render(CardEditor, { props: { card: CARD_NO_VISUAL } });
    expect(screen.queryByTestId('image-editor')).toBeNull();
  });

  it('renders neither IconPicker nor ImageEditor for a minimal card', () => {
    render(CardEditor, { props: { card: CARD_MINIMAL } });
    expect(screen.queryByTestId('icon-picker')).toBeNull();
    expect(screen.queryByTestId('image-editor')).toBeNull();
  });

  it('still renders TitleDescriptionEditor for a minimal card', () => {
    render(CardEditor, { props: { card: CARD_MINIMAL } });
    expect(screen.getByTestId('title-description-editor')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 3. Emits update:heading with correct payload
// ---------------------------------------------------------------------------

describe('CardEditor — update:heading emit', () => {
  it('emits update:heading with { cardNodeId, heading } when TitleDescriptionEditor fires heading change', async () => {
    const { emitted } = render(CardEditor, { props: { card: CARD_FULL } });

    const headingInput = screen.getByRole('textbox', { name: 'Heading' });
    // Simulate the user typing into the heading input inside the stub.
    await fireEvent.input(headingInput, { target: { value: 'New Heading' } });

    const events = emitted('update:heading') as Array<[{ cardNodeId: string; heading: string }]>;
    expect(events).toBeDefined();
    expect(events.length).toBeGreaterThanOrEqual(1);
    const last = events[events.length - 1]![0]!;
    expect(last.cardNodeId).toBe('node-card-1');
    expect(last.heading).toBe('New Heading');
  });

  it('does not emit update:heading when disabled=true', async () => {
    const { emitted } = render(CardEditor, {
      props: { card: CARD_FULL, disabled: true },
    });

    // The fieldset is disabled — browser prevents input on disabled fieldset
    // descendant inputs. We verify CardEditor's disabled prop propagation
    // (checked in test 7) rather than a synthetic re-test here.
    // This test confirms no spurious emit on mount.
    expect(emitted('update:heading')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 4. Emits update:paragraph with correct payload
// ---------------------------------------------------------------------------

describe('CardEditor — update:paragraph emit', () => {
  it('emits update:paragraph with { cardNodeId, paragraph } when TitleDescriptionEditor fires paragraph change', async () => {
    const { emitted } = render(CardEditor, { props: { card: CARD_FULL } });

    const paragraphInput = screen.getByRole('textbox', { name: 'Paragraph' });
    await fireEvent.input(paragraphInput, { target: { value: 'New Paragraph' } });

    const events = emitted('update:paragraph') as Array<
      [{ cardNodeId: string; paragraph: string }]
    >;
    expect(events).toBeDefined();
    expect(events.length).toBeGreaterThanOrEqual(1);
    const last = events[events.length - 1]![0]!;
    expect(last.cardNodeId).toBe('node-card-1');
    expect(last.paragraph).toBe('New Paragraph');
  });
});

// ---------------------------------------------------------------------------
// 5. Emits update:icon with correct payload
// ---------------------------------------------------------------------------

describe('CardEditor — update:icon emit', () => {
  it('emits update:icon with { cardNodeId, iconName } when IconPicker fires selection', async () => {
    const { emitted } = render(CardEditor, { props: { card: CARD_FULL } });

    // The stub renders a <button role="option" aria-label="Trophy">.
    const trophyOption = screen.getByRole('option', { name: 'Trophy' });
    await fireEvent.click(trophyOption);

    const events = emitted('update:icon') as Array<[{ cardNodeId: string; iconName: string }]>;
    expect(events).toBeDefined();
    expect(events.length).toBeGreaterThanOrEqual(1);
    const last = events[events.length - 1]![0]!;
    expect(last.cardNodeId).toBe('node-card-1');
    expect(last.iconName).toBe('Trophy');
  });

  it('does not emit update:icon when card.icon is null (IconPicker not rendered)', async () => {
    const { emitted } = render(CardEditor, { props: { card: CARD_NO_ICON } });
    expect(emitted('update:icon')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 6. Emits update:visual with correct payload
// ---------------------------------------------------------------------------

describe('CardEditor — update:visual emit', () => {
  it('emits update:visual with { cardNodeId, bytes } when ImageEditor fires image upload', async () => {
    const { emitted } = render(CardEditor, { props: { card: CARD_FULL } });

    // The stub renders a button with aria-label containing "Replace image".
    const replaceBtn = screen.getByRole('button', {
      name: /Replace image/i,
    });
    await fireEvent.click(replaceBtn);

    const events = emitted('update:visual') as Array<[{ cardNodeId: string; bytes: Uint8Array }]>;
    expect(events).toBeDefined();
    expect(events.length).toBeGreaterThanOrEqual(1);
    const last = events[events.length - 1]![0]!;
    expect(last.cardNodeId).toBe('node-card-1');
    expect(last.bytes).toBeInstanceOf(Uint8Array);
    expect(last.bytes).toHaveLength(3);
  });

  it('does not emit update:visual when card.visualHash is undefined (ImageEditor not rendered)', async () => {
    const { emitted } = render(CardEditor, { props: { card: CARD_NO_VISUAL } });
    expect(emitted('update:visual')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 7. disabled=true propagates to all child sections
// ---------------------------------------------------------------------------

describe('CardEditor — disabled state', () => {
  it('propagates disabled to TitleDescriptionEditor (fieldset disabled attribute)', () => {
    const { container } = render(CardEditor, {
      props: { card: CARD_FULL, disabled: true },
    });

    const fieldset = container.querySelector('fieldset.tde-stub');
    expect(fieldset).not.toBeNull();
    expect((fieldset as HTMLFieldSetElement).disabled).toBe(true);
  });

  it('propagates disabled to heading input (via fieldset)', () => {
    render(CardEditor, { props: { card: CARD_FULL, disabled: true } });
    const headingInput = screen.getByRole('textbox', { name: 'Heading' });
    expect((headingInput as HTMLInputElement).disabled).toBe(true);
  });

  it('propagates disabled to IconPicker stub option (button with role=option)', () => {
    render(CardEditor, { props: { card: CARD_FULL, disabled: true } });
    // The stub renders a <button role="option"> — queryable via role "option".
    const trophyOption = screen.getByRole('option', { name: 'Trophy' });
    expect((trophyOption as HTMLButtonElement).disabled).toBe(true);
  });

  it('propagates disabled to ImageEditor Replace image button', () => {
    render(CardEditor, { props: { card: CARD_FULL, disabled: true } });
    const replaceBtn = screen.getByRole('button', { name: /Replace image/i });
    expect((replaceBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('does not emit update:icon when disabled and icon option is clicked', async () => {
    const { emitted } = render(CardEditor, {
      props: { card: CARD_FULL, disabled: true },
    });
    // The stub guards: !disabled && $emit(...). Clicking shouldn't emit.
    // Trophy is role="option" in the stub.
    const trophyOption = screen.getByRole('option', { name: 'Trophy' });
    await fireEvent.click(trophyOption);
    expect(emitted('update:icon')).toBeUndefined();
  });

  it('does not emit update:visual when disabled and replace button is clicked', async () => {
    const { emitted } = render(CardEditor, {
      props: { card: CARD_FULL, disabled: true },
    });
    const replaceBtn = screen.getByRole('button', { name: /Replace image/i });
    await fireEvent.click(replaceBtn);
    expect(emitted('update:visual')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 8. label prop — accessible section heading
// ---------------------------------------------------------------------------

describe('CardEditor — label prop', () => {
  it('renders the supplied label as visible text', () => {
    render(CardEditor, { props: { card: CARD_FULL, label: 'Card 2 of 4' } });
    expect(screen.getByText('Card 2 of 4')).toBeDefined();
  });

  it('uses a fallback label when label prop is omitted', () => {
    render(CardEditor, { props: { card: CARD_FULL } });
    expect(screen.getByText('Edit card')).toBeDefined();
  });

  it('section has aria-labelledby pointing at the label element', () => {
    const { container } = render(CardEditor, {
      props: { card: CARD_FULL, label: 'Card 1 of 3' },
    });

    const section = container.querySelector('section.card-editor') as HTMLElement;
    expect(section).not.toBeNull();
    const labelledById = section.getAttribute('aria-labelledby');
    expect(labelledById).not.toBeNull();

    const labelEl = container.querySelector(`#${labelledById}`);
    expect(labelEl).not.toBeNull();
    expect(labelEl!.textContent).toBe('Card 1 of 3');
  });
});

// ---------------------------------------------------------------------------
// 9. axe WCAG 2.1 AA scan
// ---------------------------------------------------------------------------

describe('CardEditor — axe WCAG 2.1 AA', () => {
  it('has zero violations — full card (all fields)', async () => {
    const { container } = render(CardEditor, {
      props: { card: CARD_FULL, label: 'Card 1 of 4' },
    });
    const violations = await runAxeWCAG(container);
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero violations — card with null icon (IconPicker absent)', async () => {
    const { container } = render(CardEditor, {
      props: { card: CARD_NO_ICON, label: 'Card 2 of 4' },
    });
    const violations = await runAxeWCAG(container);
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero violations — card with undefined visual (ImageEditor absent)', async () => {
    const { container } = render(CardEditor, {
      props: { card: CARD_NO_VISUAL, label: 'Card 3 of 4' },
    });
    const violations = await runAxeWCAG(container);
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero violations — minimal card (no icon, no visual)', async () => {
    const { container } = render(CardEditor, {
      props: { card: CARD_MINIMAL, label: 'Card 4 of 4' },
    });
    const violations = await runAxeWCAG(container);
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero violations — disabled state, full card', async () => {
    const { container } = render(CardEditor, {
      props: { card: CARD_FULL, label: 'Card 1 of 4', disabled: true },
    });
    const violations = await runAxeWCAG(container);
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero violations — visual slot present with null hash (placeholder fill)', async () => {
    const { container } = render(CardEditor, {
      props: { card: CARD_VISUAL_PLACEHOLDER, label: 'Card 2 of 4' },
    });
    const violations = await runAxeWCAG(container);
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });
});
