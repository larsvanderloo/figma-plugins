// plugins/welder-editor/tests/ui/components/CardEditor.test.ts
//
// Sprint 5 — CardEditor component tests.
//
// Owner: ui-engineer. Sprint 5 Task 5.9.

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/vue';
import { createPinia, setActivePinia } from 'pinia';
import CardEditor from '@/components/CardEditor.vue';
import type { CardItem } from '@shared/messages.js';

const CARD: CardItem = {
  cardNodeId: 'card-1',
  heading: 'Card Heading',
  paragraph: 'Card paragraph.',
  icon: 'sparkles',
  visualHash: undefined,
};

beforeEach(() => {
  setActivePinia(createPinia());
});

describe('CardEditor', () => {
  it('renders section with label', () => {
    render(CardEditor, { props: { card: CARD, label: 'Card 1 of 3' } });
    expect(screen.getByText('Card 1 of 3')).toBeDefined();
  });

  it('renders TitleDescriptionEditor heading input', () => {
    render(CardEditor, { props: { card: CARD } });
    expect(screen.getByRole('textbox', { name: /heading/i })).toBeDefined();
  });

  it('renders TitleDescriptionEditor paragraph textarea', () => {
    render(CardEditor, { props: { card: CARD } });
    expect(screen.getByRole('textbox', { name: /paragraph/i })).toBeDefined();
  });

  it('renders IconPicker when card.icon is non-null', () => {
    render(CardEditor, { props: { card: CARD } });
    // IconPicker renders a search input — UInput with type="search" maps to
    // ARIA role "searchbox", not "textbox".
    expect(screen.getByRole('searchbox', { name: /search icons/i })).toBeDefined();
  });

  it('does not render IconPicker when card.icon is null', () => {
    render(CardEditor, { props: { card: { ...CARD, icon: null } } });
    // Same: query searchbox role for the IconPicker search input.
    expect(screen.queryByRole('searchbox', { name: /search icons/i })).toBeNull();
  });

  it('does not render ImageEditor when card.visualHash is undefined', () => {
    render(CardEditor, { props: { card: { ...CARD, visualHash: undefined } } });
    expect(screen.queryByRole('button', { name: /replace image/i })).toBeNull();
  });

  it('renders ImageEditor when card.visualHash is set', () => {
    render(CardEditor, {
      props: { card: { ...CARD, visualHash: 'hash-abc' } },
    });
    expect(screen.getByRole('button', { name: /replace image/i })).toBeDefined();
  });

  it('emits update:heading when heading input changes', async () => {
    const { emitted } = render(CardEditor, { props: { card: CARD } });
    const headingInput = screen.getByRole('textbox', { name: /heading/i });
    await fireEvent.update(headingInput, 'Updated Heading');
    await waitFor(
      () => {
        expect(emitted()['update:heading']).toBeDefined();
      },
      { timeout: 400 },
    );
    const payload = (emitted()['update:heading']?.[0] as [unknown])[0] as {
      cardNodeId: string;
      heading: string;
    };
    expect(payload.cardNodeId).toBe('card-1');
    expect(payload.heading).toBe('Updated Heading');
  });
});
