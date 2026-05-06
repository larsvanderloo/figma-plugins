// plugins/welder-editor/tests/ui/components/CardList.test.ts
//
// @testing-library/vue + axe-core tests for CardList.
//
// ADR-0015: Rewritten for PR#57 CardList which uses <ol><li><button> pattern
// instead of listbox/option. The component no longer uses role="listbox" or
// role="option" — it uses an <ol aria-label="Slide cards"> + <button> rows
// with aria-current="true" on the active card.
//
// Owner: ui-engineer (test updated by figma-api-engineer per ADR-0015).

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/vue';
import axe from 'axe-core';
import CardList from '../../../ui/components/CardList.vue';
import type { ContentItems } from '../../../ui/components/types.js';

// Stub UIcon — renders a <span data-icon="…"> so tests can query by data attribute.
vi.mock('@nuxt/ui/components/Icon.vue', () => ({
  default: {
    name: 'UIcon',
    props: { name: { type: String, required: true } },
    template: `<span :data-icon="name" aria-hidden="true" />`,
  },
}));

// Stub StatusMessage
vi.mock('../../../ui/components/StatusMessage.vue', () => ({
  default: {
    name: 'StatusMessage',
    props: { message: String, variant: String },
    template: `<p role="status" aria-live="polite" aria-atomic="true">{{ message }}</p>`,
  },
}));

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
  visualHash: null,
};

const CARD_C: ContentItems['cards'][0] = {
  cardNodeId: 'node-card-c',
  heading: 'Card Gamma',
  paragraph: '',
  icon: null,
  visualHash: undefined,
};

const MODEL_WITH_CARDS: ContentItems = {
  cardWrapId: 'node-cardwrap-1',
  cards: [CARD_A, CARD_B, CARD_C],
  timelineItems: [],
};

const MODEL_EMPTY_CARDS: ContentItems = {
  cardWrapId: 'node-cardwrap-2',
  cards: [],
  timelineItems: [],
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
// 1. Renders all cards from model (ol/li/button pattern)
// ---------------------------------------------------------------------------

describe('CardList — renders cards', () => {
  it('renders all cards as buttons (ol/li/button pattern)', () => {
    render(CardList, { props: { model: MODEL_WITH_CARDS } });
    // Cards are <button> rows inside <ol><li> — not listbox/option
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(3);
  });

  it('renders the ordered list with aria-label "Slide cards"', () => {
    const { container } = render(CardList, { props: { model: MODEL_WITH_CARDS } });
    const ol = container.querySelector('ol[aria-label="Slide cards"]');
    expect(ol).not.toBeNull();
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
    const { container } = render(CardList, { props: { model: MODEL_WITH_CARDS } });
    // CARD_C has paragraph = '' — .card-list__paragraph span not rendered
    const paragraphs = container.querySelectorAll('.card-list__paragraph');
    expect(paragraphs).toHaveLength(2); // CARD_A + CARD_B only
  });

  it('renders the icon thumbnail when card.icon is a string', () => {
    const { container } = render(CardList, { props: { model: MODEL_WITH_CARDS } });
    // CardList calls uIconName(key) = 'i-lucide-{key}'. UIcon stub renders data-icon="i-lucide-star".
    const starIcon = container.querySelector('[data-icon="i-lucide-star"]');
    expect(starIcon).not.toBeNull();
  });

  it('does not render an icon element when card.icon is null', () => {
    const { container } = render(CardList, { props: { model: MODEL_WITH_CARDS } });
    // CARD_C has icon=null — no icon-wrap span.
    // CARD_A: i-lucide-star, CARD_B: i-lucide-heart — only 2 icon spans.
    const iconSpans = container.querySelectorAll('[data-icon]');
    expect(iconSpans).toHaveLength(2);
  });

  it('renders a "visual" badge when visualHash is defined (string or null)', () => {
    render(CardList, { props: { model: MODEL_WITH_CARDS } });
    // CARD_A: visualHash = 'hash-abc123' → badge
    // CARD_B: visualHash = null (slot present) → badge
    const badges = screen.getAllByText('visual');
    expect(badges).toHaveLength(2);
  });

  it('does not render a "visual" badge when visualHash is undefined', () => {
    render(CardList, { props: { model: MODEL_WITH_CARDS } });
    // 2 badges: CARD_A + CARD_B (CARD_C has undefined → no badge)
    const badges = screen.getAllByText('visual');
    expect(badges).toHaveLength(2);
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

  it('does not render the ol list when model is null', () => {
    const { container } = render(CardList, { props: { model: null } });
    expect(container.querySelector('ol')).toBeNull();
  });

  it('does not render the ol list when cards array is empty', () => {
    const { container } = render(CardList, { props: { model: MODEL_EMPTY_CARDS } });
    expect(container.querySelector('ol')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 3. Click card emits `select` with correct cardNodeId
// ---------------------------------------------------------------------------

describe('CardList — select emit', () => {
  it('emits `select` with cardNodeId when the first card button is clicked', () => {
    const { emitted } = render(CardList, { props: { model: MODEL_WITH_CARDS } });
    // All card rows are <button> elements inside <ol><li>
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(buttons[0]!);
    const selectEvents = emitted('select') as [string][][] | undefined;
    expect(selectEvents).toBeDefined();
    expect(selectEvents![0]![0]).toBe('node-card-a');
  });

  it('emits `select` with the second card nodeId when the second card is clicked', () => {
    const { emitted } = render(CardList, { props: { model: MODEL_WITH_CARDS } });
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(buttons[1]!);
    const selectEvents = emitted('select') as [string][][] | undefined;
    expect(selectEvents![0]![0]).toBe('node-card-b');
  });
});

// ---------------------------------------------------------------------------
// 4. Active card distinguished (aria-current)
// ---------------------------------------------------------------------------

describe('CardList — active card', () => {
  it('sets aria-current="true" on the active card button (first button)', () => {
    render(CardList, {
      props: { model: MODEL_WITH_CARDS, activeCardNodeId: 'node-card-a' },
    });
    const buttons = screen.getAllByRole('button');
    expect(buttons[0]!.getAttribute('aria-current')).toBe('true');
  });

  it('does not set aria-current on inactive cards (second button)', () => {
    render(CardList, {
      props: { model: MODEL_WITH_CARDS, activeCardNodeId: 'node-card-a' },
    });
    const buttons = screen.getAllByRole('button');
    expect(buttons[1]!.getAttribute('aria-current')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. Disabled state
// ---------------------------------------------------------------------------

describe('CardList — disabled state', () => {
  it('does not emit select when disabled=true and a card is clicked', () => {
    const { emitted } = render(CardList, {
      props: { model: MODEL_WITH_CARDS, disabled: true },
    });
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]!);
    expect(emitted('select')).toBeUndefined();
  });

  it('sets tabindex=-1 on all buttons when disabled=true', () => {
    render(CardList, {
      props: { model: MODEL_WITH_CARDS, disabled: true },
    });
    const buttons = screen.getAllByRole('button') as HTMLButtonElement[];
    buttons.forEach((btn) => {
      expect(btn.getAttribute('tabindex')).toBe('-1');
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
    expect(screen.getByText('Card Alpha')).toBeDefined();
    expect(screen.getByText('Card Beta')).toBeDefined();
    expect(screen.getByText('Card Gamma')).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 6. axe WCAG 2.1 AA
// ---------------------------------------------------------------------------

describe('CardList — axe WCAG 2.1 AA', () => {
  it('has zero violations — populated state, no active card', async () => {
    const { container } = render(CardList, { props: { model: MODEL_WITH_CARDS } });
    const violations = await runAxeWCAG(container);
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero violations — populated state, card A active', async () => {
    const { container } = render(CardList, {
      props: { model: MODEL_WITH_CARDS, activeCardNodeId: 'node-card-a' },
    });
    const violations = await runAxeWCAG(container);
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });

  it('has zero violations — empty state (model is null)', async () => {
    const { container } = render(CardList, { props: { model: null } });
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

  it('has zero violations — card with null icon and undefined visualHash', async () => {
    const { container } = render(CardList, {
      props: {
        model: {
          cardWrapId: 'cwrap-x',
          cards: [CARD_C],
          timelineItems: [],
        },
      },
    });
    const violations = await runAxeWCAG(container);
    expect(violations, `axe violations:\n${formatViolations(violations)}`).toHaveLength(0);
  });
});
