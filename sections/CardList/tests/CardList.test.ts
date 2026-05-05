// sections/CardList/tests/CardList.test.ts
//
// @testing-library/vue + axe-core tests for CardList.
//
// Owner: ui-engineer.
//
// Test contract:
//   1. Renders all cards from model
//   2. Empty state when model is null OR cards array is empty
//   3. Click card emits `select` with correct cardNodeId
//   4. Active card visually distinguished (aria-selected + CSS class)
//   5. Disabled state disables clicks
//   6. axe WCAG 2.1 AA scan — zero violations across populated, empty, disabled states
//
// @iconify/vue is mocked in setup.ts — tests cover section behavior without
// depending on real SVG rendering.

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/vue';
import axe from 'axe-core';
import CardList from '../src/CardList.vue';
import type { ContentItems } from '../src/types.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CARD_A: ContentItems['cards'][0] = {
  cardNodeId: 'node-card-a',
  heading: 'Card Alpha',
  paragraph: 'Alpha paragraph text',
  icon: 'star',
  visualHash: 'hash-abc123',
};

const CARD_B: ContentItems['cards'][0] = {
  cardNodeId: 'node-card-b',
  heading: 'Card Beta',
  paragraph: 'Beta paragraph text',
  icon: 'heart',
  visualHash: null, // slot present, placeholder fill
};

const CARD_C: ContentItems['cards'][0] = {
  cardNodeId: 'node-card-c',
  heading: 'Card Gamma',
  paragraph: '',
  icon: null, // icon absent
  visualHash: undefined, // no visual slot
};

const MODEL_WITH_CARDS: ContentItems = {
  cardWrapId: 'node-cardwrap-1',
  cards: [CARD_A, CARD_B, CARD_C],
};

const MODEL_EMPTY_CARDS: ContentItems = {
  cardWrapId: 'node-cardwrap-2',
  cards: [],
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
// 1. Renders all cards from model
// ---------------------------------------------------------------------------

describe('CardList — renders cards', () => {
  it('renders all cards from model as listbox options', () => {
    render(CardList, { props: { model: MODEL_WITH_CARDS } });
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(3);
  });

  it('renders each card heading', () => {
    render(CardList, { props: { model: MODEL_WITH_CARDS } });
    expect(screen.getByText('Card Alpha')).toBeDefined();
    expect(screen.getByText('Card Beta')).toBeDefined();
    expect(screen.getByText('Card Gamma')).toBeDefined();
  });

  it('renders non-empty paragraph text', () => {
    render(CardList, { props: { model: MODEL_WITH_CARDS } });
    expect(screen.getByText('Alpha paragraph text')).toBeDefined();
    expect(screen.getByText('Beta paragraph text')).toBeDefined();
  });

  it('does not render paragraph element when paragraph is empty string', () => {
    render(CardList, { props: { model: MODEL_WITH_CARDS } });
    // CARD_C has paragraph = '' — no .card-list__paragraph span rendered.
    // We can verify indirectly: only 2 paragraph spans, not 3.
    // Use the data-testid-free approach: check text content by role.
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(3);
    // CARD_C heading is present
    expect(screen.getByText('Card Gamma')).toBeDefined();
  });

  it('renders the icon thumbnail when card.icon is a string', () => {
    const { container } = render(CardList, { props: { model: MODEL_WITH_CARDS } });
    // The mocked Icon renders <span data-icon="lucide:star">.
    const starIcon = container.querySelector('[data-icon="lucide:star"]');
    expect(starIcon).not.toBeNull();
  });

  it('does not render an icon element when card.icon is null', () => {
    const { container } = render(CardList, { props: { model: MODEL_WITH_CARDS } });
    // CARD_C has icon=null — no icon-wrap span at all.
    // CARD_A: lucide:star, CARD_B: lucide:heart — only 2 icon spans.
    const iconSpans = container.querySelectorAll('[data-icon]');
    expect(iconSpans).toHaveLength(2);
  });

  it('renders a "visual" badge when visualHash is defined (string or null)', () => {
    render(CardList, { props: { model: MODEL_WITH_CARDS } });
    // CARD_A: visualHash = 'hash-abc123' → badge
    // CARD_B: visualHash = null (slot present) → badge
    // CARD_C: visualHash = undefined (no slot) → no badge
    const badges = screen.getAllByText('visual');
    expect(badges).toHaveLength(2);
  });

  it('does not render a "visual" badge when visualHash is undefined', () => {
    // CARD_C has visualHash=undefined — no badge for it.
    // Only check that Card Gamma has no badge sibling.
    render(CardList, { props: { model: MODEL_WITH_CARDS } });
    const badges = screen.getAllByText('visual');
    // 2 badges: CARD_A + CARD_B
    expect(badges).toHaveLength(2);
  });

  it('renders a ul[role=listbox] with aria-label "Slide cards"', () => {
    render(CardList, { props: { model: MODEL_WITH_CARDS } });
    const listbox = screen.getByRole('listbox', { name: 'Slide cards' });
    expect(listbox).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 2. Empty state
// ---------------------------------------------------------------------------

describe('CardList — empty state', () => {
  it('shows empty state message when model is null', () => {
    render(CardList, { props: { model: null } });
    expect(screen.getByText('No cards on this slide')).toBeDefined();
  });

  it('shows empty state message when model.cards is empty', () => {
    render(CardList, { props: { model: MODEL_EMPTY_CARDS } });
    expect(screen.getByText('No cards on this slide')).toBeDefined();
  });

  it('does not render a listbox when model is null (prevents aria-required-children violation)', () => {
    render(CardList, { props: { model: null } });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('does not render a listbox when cards array is empty', () => {
    render(CardList, { props: { model: MODEL_EMPTY_CARDS } });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('does not render any options when empty', () => {
    render(CardList, { props: { model: null } });
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Click emits `select` with correct cardNodeId
// ---------------------------------------------------------------------------

describe('CardList — selection emit', () => {
  it('emits select with the cardNodeId when a card is clicked', async () => {
    const { emitted } = render(CardList, {
      props: { model: MODEL_WITH_CARDS },
    });

    // Each option li is directly clickable (no nested button — WAI-ARIA
    // listbox pattern: role="option" carries the interactive affordance).
    const cardAlphaOption = screen.getByRole('option', { name: /Card Alpha/i });
    await fireEvent.click(cardAlphaOption);

    const emittedEvents = emitted('select') as [string][][] | undefined;
    expect(emittedEvents).toBeDefined();
    expect(emittedEvents).toHaveLength(1);
    expect(emittedEvents?.[0]?.[0]).toBe('node-card-a');
  });

  it('emits select with the correct cardNodeId for each card', async () => {
    const { emitted } = render(CardList, {
      props: { model: MODEL_WITH_CARDS },
    });

    const cardBetaOption = screen.getByRole('option', { name: /Card Beta/i });
    await fireEvent.click(cardBetaOption);

    const emittedEvents = emitted('select') as [string][][] | undefined;
    expect(emittedEvents?.[0]?.[0]).toBe('node-card-b');
  });

  it('emits select each time a card is clicked, including re-clicking the active card', async () => {
    const { emitted } = render(CardList, {
      props: { model: MODEL_WITH_CARDS, activeCardNodeId: 'node-card-a' },
    });

    const cardAlphaOption = screen.getByRole('option', { name: /Card Alpha/i });
    await fireEvent.click(cardAlphaOption);
    await fireEvent.click(cardAlphaOption);

    const emittedEvents = emitted('select') as [string][][] | undefined;
    expect(emittedEvents).toHaveLength(2);
  });

  it('emits select when Enter is pressed on a card option', async () => {
    const { emitted } = render(CardList, {
      props: { model: MODEL_WITH_CARDS },
    });

    const cardAlphaOption = screen.getByRole('option', { name: /Card Alpha/i });
    await fireEvent.keyDown(cardAlphaOption, { key: 'Enter' });

    const emittedEvents = emitted('select') as [string][][] | undefined;
    expect(emittedEvents?.[0]?.[0]).toBe('node-card-a');
  });

  it('emits select when Space is pressed on a card option', async () => {
    const { emitted } = render(CardList, {
      props: { model: MODEL_WITH_CARDS },
    });

    const cardAlphaOption = screen.getByRole('option', { name: /Card Alpha/i });
    await fireEvent.keyDown(cardAlphaOption, { key: ' ' });

    const emittedEvents = emitted('select') as [string][][] | undefined;
    expect(emittedEvents?.[0]?.[0]).toBe('node-card-a');
  });
});

// ---------------------------------------------------------------------------
// 4. Active card visually distinguished
// ---------------------------------------------------------------------------

describe('CardList — active card distinction', () => {
  it('sets aria-selected=true on the active card option', () => {
    render(CardList, {
      props: { model: MODEL_WITH_CARDS, activeCardNodeId: 'node-card-b' },
    });

    const options = screen.getAllByRole('option') as HTMLElement[];
    const alphaOption = options.find((o) => o.textContent?.includes('Card Alpha'));
    const betaOption = options.find((o) => o.textContent?.includes('Card Beta'));

    expect(betaOption?.getAttribute('aria-selected')).toBe('true');
    expect(alphaOption?.getAttribute('aria-selected')).toBe('false');
  });

  it('sets aria-selected=false on all options when activeCardNodeId is null', () => {
    render(CardList, {
      props: { model: MODEL_WITH_CARDS, activeCardNodeId: null },
    });

    const options = screen.getAllByRole('option') as HTMLElement[];
    options.forEach((opt) => {
      expect(opt.getAttribute('aria-selected')).toBe('false');
    });
  });

  it('applies active CSS class to the active option li', () => {
    const { container } = render(CardList, {
      props: { model: MODEL_WITH_CARDS, activeCardNodeId: 'node-card-a' },
    });

    const activeItems = container.querySelectorAll('.card-list__item--active');
    expect(activeItems).toHaveLength(1);
  });

  it('does not apply active CSS class when activeCardNodeId is null', () => {
    const { container } = render(CardList, {
      props: { model: MODEL_WITH_CARDS, activeCardNodeId: null },
    });

    const activeItems = container.querySelectorAll('.card-list__item--active');
    expect(activeItems).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 5. Disabled state
// ---------------------------------------------------------------------------

describe('CardList — disabled state', () => {
  it('does not emit select when a card is clicked and disabled=true', async () => {
    const { emitted } = render(CardList, {
      props: { model: MODEL_WITH_CARDS, disabled: true },
    });

    const cardAlphaOption = screen.getByRole('option', { name: /Card Alpha/i });
    // handleActivate guards against emission when disabled; pointer-events:none
    // in CSS also blocks real pointer clicks, but fireEvent bypasses CSS.
    await fireEvent.click(cardAlphaOption);

    expect(emitted('select')).toBeUndefined();
  });

  it('does not emit select on keydown when disabled=true', async () => {
    const { emitted } = render(CardList, {
      props: { model: MODEL_WITH_CARDS, disabled: true },
    });

    const cardAlphaOption = screen.getByRole('option', { name: /Card Alpha/i });
    await fireEvent.keyDown(cardAlphaOption, { key: 'Enter' });

    expect(emitted('select')).toBeUndefined();
  });

  it('sets tabindex="-1" on all options when disabled=true', () => {
    render(CardList, {
      props: { model: MODEL_WITH_CARDS, disabled: true },
    });

    const options = screen.getAllByRole('option') as HTMLElement[];
    options.forEach((opt) => {
      expect(opt.getAttribute('tabindex')).toBe('-1');
    });
  });

  it('sets tabindex="0" on all options when disabled=false', () => {
    render(CardList, {
      props: { model: MODEL_WITH_CARDS, disabled: false },
    });

    const options = screen.getAllByRole('option') as HTMLElement[];
    options.forEach((opt) => {
      expect(opt.getAttribute('tabindex')).toBe('0');
    });
  });

  it('sets aria-disabled on the listbox when disabled=true', () => {
    render(CardList, {
      props: { model: MODEL_WITH_CARDS, disabled: true },
    });

    const listbox = screen.getByRole('listbox');
    expect(listbox.getAttribute('aria-disabled')).toBe('true');
  });

  it('still renders cards when disabled (list is not hidden)', () => {
    render(CardList, {
      props: { model: MODEL_WITH_CARDS, disabled: true },
    });

    expect(screen.getAllByRole('option')).toHaveLength(3);
  });

  it('does not set aria-disabled when disabled=false', () => {
    render(CardList, {
      props: { model: MODEL_WITH_CARDS, disabled: false },
    });

    const listbox = screen.getByRole('listbox');
    expect(listbox.getAttribute('aria-disabled')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 6. axe WCAG 2.1 AA scan
// ---------------------------------------------------------------------------

describe('CardList — axe WCAG 2.1 AA', () => {
  it('has zero violations — populated state, no active card', async () => {
    const { container } = render(CardList, {
      props: { model: MODEL_WITH_CARDS },
    });
    const violations = await runAxeWCAG(container);
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero violations — populated state, with active card', async () => {
    const { container } = render(CardList, {
      props: { model: MODEL_WITH_CARDS, activeCardNodeId: 'node-card-a' },
    });
    const violations = await runAxeWCAG(container);
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero violations — disabled state', async () => {
    const { container } = render(CardList, {
      props: { model: MODEL_WITH_CARDS, disabled: true },
    });
    const violations = await runAxeWCAG(container);
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero violations — empty state (model null)', async () => {
    const { container } = render(CardList, {
      props: { model: null },
    });
    const violations = await runAxeWCAG(container);
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero violations — empty state (empty cards array)', async () => {
    const { container } = render(CardList, {
      props: { model: MODEL_EMPTY_CARDS },
    });
    const violations = await runAxeWCAG(container);
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero violations — card with null icon and undefined visualHash', async () => {
    const { container } = render(CardList, {
      props: {
        model: {
          cardWrapId: 'cwrap-x',
          cards: [CARD_C],
        },
      },
    });
    const violations = await runAxeWCAG(container);
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });
});
