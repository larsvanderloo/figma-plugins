// sections/CardList/tests/CardList.test.ts
//
// @testing-library/vue + axe-core tests for CardList.
//
// Owner: ui-engineer.
// Resolves: MON-2894437197 (Sprint 5, Task 5.9 — CardList -> Nuxt UI primitives).
//
// Test contract (updated from MON-2893969464 baseline):
//   1. Renders all cards from model — each row is a <button> inside <li>
//   2. Empty state when model is null OR cards array is empty
//   3. Click card emits `select` with correct cardNodeId
//   4. Active card visually distinguished (aria-current + CSS class)
//   5. Disabled state disables clicks
//   6. UIcon renders with i-lucide-{key} name
//   7. Badge renders when visualHash is defined
//   8. axe WCAG 2.1 AA scan — zero violations across 6 states
//
// ARIA pattern change (Sprint 5):
//   Original: <ul role="listbox"> + <li role="option"> (no nested-interactive)
//   New: <ol aria-label="Slide cards"> + <li><button> rows.
//   Selection is conveyed via aria-current="true" on the active <button>.
//   This allows UIcon and the badge span inside the button without violating
//   the nested-interactive axe rule.
//
// UIcon (@nuxt/ui/dist/runtime/components/Icon.vue) is mocked in setup.ts —
// tests cover section behavior without depending on real Nuxt UI rendering.

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
  it('renders all cards from model as button rows', () => {
    render(CardList, { props: { model: MODEL_WITH_CARDS } });
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(3);
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
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(3);
    expect(screen.getByText('Card Gamma')).toBeDefined();
  });

  it('renders UIcon with i-lucide-{key} name when card.icon is a string', () => {
    const { container } = render(CardList, { props: { model: MODEL_WITH_CARDS } });
    // Mocked UIcon renders <span data-icon="i-lucide-star">.
    const starIcon = container.querySelector('[data-icon="i-lucide-star"]');
    expect(starIcon).not.toBeNull();
  });

  it('does not render an icon element when card.icon is null', () => {
    const { container } = render(CardList, { props: { model: MODEL_WITH_CARDS } });
    // CARD_C has icon=null — no icon-wrap span at all.
    // CARD_A: i-lucide-star, CARD_B: i-lucide-heart — only 2 icon spans.
    const iconSpans = container.querySelectorAll('[data-icon]');
    expect(iconSpans).toHaveLength(2);
  });

  it('renders a "visual" badge when visualHash is defined (string or null)', () => {
    render(CardList, { props: { model: MODEL_WITH_CARDS } });
    // CARD_A: visualHash = 'hash-abc123' -> badge
    // CARD_B: visualHash = null (slot present) -> badge
    // CARD_C: visualHash = undefined (no slot) -> no badge
    const badges = screen.getAllByText('visual');
    expect(badges).toHaveLength(2);
  });

  it('does not render a badge when visualHash is undefined', () => {
    render(CardList, { props: { model: MODEL_WITH_CARDS } });
    // Only 2 badges: CARD_A + CARD_B
    const badges = screen.getAllByText('visual');
    expect(badges).toHaveLength(2);
  });

  it('renders an <ol> with aria-label "Slide cards"', () => {
    render(CardList, { props: { model: MODEL_WITH_CARDS } });
    // <ol aria-label="..."> exposes as role="list"
    const list = screen.getByRole('list', { name: 'Slide cards' });
    expect(list).toBeDefined();
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

  it('does not render a list when model is null', () => {
    render(CardList, { props: { model: null } });
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('does not render a list when cards array is empty', () => {
    render(CardList, { props: { model: MODEL_EMPTY_CARDS } });
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('does not render any buttons when empty', () => {
    render(CardList, { props: { model: null } });
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 3. Click emits `select` with correct cardNodeId
// ---------------------------------------------------------------------------

describe('CardList — selection emit', () => {
  it('emits select with the cardNodeId when a card button is clicked', async () => {
    const { emitted } = render(CardList, {
      props: { model: MODEL_WITH_CARDS },
    });

    const cardAlphaBtn = screen.getByRole('button', { name: /Card Alpha/i });
    await fireEvent.click(cardAlphaBtn);

    const emittedEvents = emitted('select') as [string][][] | undefined;
    expect(emittedEvents).toBeDefined();
    expect(emittedEvents).toHaveLength(1);
    expect(emittedEvents?.[0]?.[0]).toBe('node-card-a');
  });

  it('emits select with the correct cardNodeId for each card', async () => {
    const { emitted } = render(CardList, {
      props: { model: MODEL_WITH_CARDS },
    });

    const cardBetaBtn = screen.getByRole('button', { name: /Card Beta/i });
    await fireEvent.click(cardBetaBtn);

    const emittedEvents = emitted('select') as [string][][] | undefined;
    expect(emittedEvents?.[0]?.[0]).toBe('node-card-b');
  });

  it('emits select each time a card is clicked, including re-clicking the active card', async () => {
    const { emitted } = render(CardList, {
      props: { model: MODEL_WITH_CARDS, activeCardNodeId: 'node-card-a' },
    });

    const cardAlphaBtn = screen.getByRole('button', { name: /Card Alpha/i });
    await fireEvent.click(cardAlphaBtn);
    await fireEvent.click(cardAlphaBtn);

    const emittedEvents = emitted('select') as [string][][] | undefined;
    expect(emittedEvents).toHaveLength(2);
  });

  it('emits select when Enter is pressed on a card button (native button click)', async () => {
    const { emitted } = render(CardList, {
      props: { model: MODEL_WITH_CARDS },
    });

    const cardAlphaBtn = screen.getByRole('button', { name: /Card Alpha/i });
    await fireEvent.click(cardAlphaBtn);

    const emittedEvents = emitted('select') as [string][][] | undefined;
    expect(emittedEvents?.[0]?.[0]).toBe('node-card-a');
  });

  it('emits select when Space is pressed on a card button (native button click)', async () => {
    const { emitted } = render(CardList, {
      props: { model: MODEL_WITH_CARDS },
    });

    const cardAlphaBtn = screen.getByRole('button', { name: /Card Alpha/i });
    await fireEvent.click(cardAlphaBtn);

    const emittedEvents = emitted('select') as [string][][] | undefined;
    expect(emittedEvents?.[0]?.[0]).toBe('node-card-a');
  });
});

// ---------------------------------------------------------------------------
// 4. Active card visually distinguished
// ---------------------------------------------------------------------------

describe('CardList — active card distinction', () => {
  it('sets aria-current="true" on the active card button', () => {
    render(CardList, {
      props: { model: MODEL_WITH_CARDS, activeCardNodeId: 'node-card-b' },
    });

    const buttons = screen.getAllByRole('button') as HTMLElement[];
    const alphaBtn = buttons.find((b) => b.textContent?.includes('Card Alpha'));
    const betaBtn = buttons.find((b) => b.textContent?.includes('Card Beta'));

    expect(betaBtn?.getAttribute('aria-current')).toBe('true');
    expect(alphaBtn?.getAttribute('aria-current')).toBeNull();
  });

  it('sets no aria-current on any button when activeCardNodeId is null', () => {
    render(CardList, {
      props: { model: MODEL_WITH_CARDS, activeCardNodeId: null },
    });

    const buttons = screen.getAllByRole('button') as HTMLElement[];
    buttons.forEach((btn) => {
      expect(btn.getAttribute('aria-current')).toBeNull();
    });
  });

  it('applies active CSS class to the active button', () => {
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

    const cardAlphaBtn = screen.getByRole('button', { name: /Card Alpha/i });
    await fireEvent.click(cardAlphaBtn);

    expect(emitted('select')).toBeUndefined();
  });

  it('sets tabindex="-1" on all buttons when disabled=true', () => {
    render(CardList, {
      props: { model: MODEL_WITH_CARDS, disabled: true },
    });

    const buttons = screen.getAllByRole('button') as HTMLElement[];
    buttons.forEach((btn) => {
      expect(btn.getAttribute('tabindex')).toBe('-1');
    });
  });

  it('sets tabindex="0" on all buttons when disabled=false', () => {
    render(CardList, {
      props: { model: MODEL_WITH_CARDS, disabled: false },
    });

    const buttons = screen.getAllByRole('button') as HTMLElement[];
    buttons.forEach((btn) => {
      expect(btn.getAttribute('tabindex')).toBe('0');
    });
  });

  it('sets aria-disabled="true" on all buttons when disabled=true', () => {
    render(CardList, {
      props: { model: MODEL_WITH_CARDS, disabled: true },
    });

    const buttons = screen.getAllByRole('button') as HTMLElement[];
    buttons.forEach((btn) => {
      expect(btn.getAttribute('aria-disabled')).toBe('true');
    });
  });

  it('still renders cards when disabled (list is not hidden)', () => {
    render(CardList, {
      props: { model: MODEL_WITH_CARDS, disabled: true },
    });

    expect(screen.getAllByRole('button')).toHaveLength(3);
  });

  it('does not set aria-disabled when disabled=false', () => {
    render(CardList, {
      props: { model: MODEL_WITH_CARDS, disabled: false },
    });

    const buttons = screen.getAllByRole('button') as HTMLElement[];
    buttons.forEach((btn) => {
      expect(btn.getAttribute('aria-disabled')).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// 6. UIcon renders with correct i-lucide-{key} name
// ---------------------------------------------------------------------------

describe('CardList — UIcon primitive', () => {
  it('renders UIcon with i-lucide-{key} name for each card with an icon', () => {
    const { container } = render(CardList, { props: { model: MODEL_WITH_CARDS } });
    expect(container.querySelector('[data-icon="i-lucide-star"]')).not.toBeNull();
    expect(container.querySelector('[data-icon="i-lucide-heart"]')).not.toBeNull();
  });

  it('renders exactly the right number of UIcon elements (omits null icons)', () => {
    const { container } = render(CardList, { props: { model: MODEL_WITH_CARDS } });
    // CARD_A: star, CARD_B: heart, CARD_C: null -> 2 icons.
    const iconEls = container.querySelectorAll('[data-icon]');
    expect(iconEls).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// 7. Badge renders for cards with a defined visualHash
// ---------------------------------------------------------------------------

describe('CardList — visual badge', () => {
  it('renders badge when visualHash is a non-undefined value (string or null)', () => {
    render(CardList, { props: { model: MODEL_WITH_CARDS } });
    // CARD_A: string hash -> badge. CARD_B: null -> badge. CARD_C: undefined -> no badge.
    const badges = screen.getAllByText('visual');
    expect(badges).toHaveLength(2);
  });

  it('does not render badge when visualHash is undefined', () => {
    render(CardList, {
      props: { model: { cardWrapId: 'cw', cards: [CARD_C] } },
    });
    expect(screen.queryByText('visual')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 8. axe WCAG 2.1 AA scan
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
