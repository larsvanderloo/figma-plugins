// plugins/welder-editor/tests/ui/components/CardList.test.ts
//
// Sprint 5 — CardList component tests.
//
// Owner: ui-engineer. Sprint 5 Task 5.9.

import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/vue';
import CardList from '@/components/CardList.vue';
import type { ContentItems } from '@shared/messages.js';

const CONTENT_WITH_CARDS: ContentItems = {
  cardWrapId: 'cw-1',
  cards: [
    {
      cardNodeId: 'card-a',
      heading: 'Card A',
      paragraph: 'Para A',
      icon: 'sparkles',
      visualHash: undefined,
    },
    {
      cardNodeId: 'card-b',
      heading: 'Card B',
      paragraph: 'Para B',
      icon: null,
      visualHash: undefined,
    },
  ],
  timelineItems: [],
  journeyModel: null,
};

describe('CardList', () => {
  it('renders a listbox when cards exist', () => {
    render(CardList, { props: { model: CONTENT_WITH_CARDS } });
    expect(screen.getByRole('listbox', { name: /slide cards/i })).toBeDefined();
  });

  it('renders card options', () => {
    render(CardList, { props: { model: CONTENT_WITH_CARDS } });
    const options = screen.getAllByRole('option');
    expect(options.length).toBe(2);
  });

  it('shows empty state when model is null', () => {
    render(CardList, { props: { model: null } });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(screen.getByText(/no cards/i)).toBeDefined();
  });

  it('emits select when card option is clicked', async () => {
    const { emitted } = render(CardList, { props: { model: CONTENT_WITH_CARDS } });
    const cardAOption = screen.getByRole('option', { name: /card a/i });
    await fireEvent.click(cardAOption);
    expect(emitted()['select']?.[0]?.[0]).toBe('card-a');
  });

  it('sets aria-selected on active card', () => {
    render(CardList, {
      props: { model: CONTENT_WITH_CARDS, activeCardNodeId: 'card-a' },
    });
    const options = screen.getAllByRole('option');
    expect(options[0]!.getAttribute('aria-selected')).toBe('true');
    expect(options[1]!.getAttribute('aria-selected')).toBe('false');
  });

  it('sets aria-disabled on listbox when disabled=true', () => {
    render(CardList, { props: { model: CONTENT_WITH_CARDS, disabled: true } });
    const listbox = screen.getByRole('listbox');
    expect(listbox.getAttribute('aria-disabled')).toBe('true');
  });
});
