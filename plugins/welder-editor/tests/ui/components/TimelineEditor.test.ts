// plugins/welder-editor/tests/ui/components/TimelineEditor.test.ts
//
// Sprint 5 — TimelineEditor component tests.
//
// Owner: ui-engineer. Sprint 5 Task 5.9.

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/vue';
import { createPinia, setActivePinia } from 'pinia';
import TimelineEditor from '@/components/TimelineEditor.vue';
import type { TimelineItem } from '@shared/messages.js';

const ITEMS: TimelineItem[] = [
  { copyWrapNodeId: 'step-1', heading: 'Step 1 Heading', paragraph: 'Step 1 para.' },
  { copyWrapNodeId: 'step-2', heading: 'Step 2 Heading', paragraph: 'Step 2 para.' },
];

beforeEach(() => {
  setActivePinia(createPinia());
});

describe('TimelineEditor', () => {
  it('renders ordered list with timeline steps', () => {
    render(TimelineEditor, { props: { items: ITEMS } });
    expect(screen.getByRole('list', { name: /timeline steps/i })).toBeDefined();
  });

  it('renders correct number of step labels', () => {
    const { container } = render(TimelineEditor, { props: { items: ITEMS } });
    const steps = container.querySelectorAll('.timeline-editor__step-label');
    expect(steps.length).toBe(2);
  });

  it('renders heading inputs for each step', () => {
    render(TimelineEditor, { props: { items: ITEMS } });
    const headingInputs = screen.getAllByRole('textbox', { name: /heading/i });
    expect(headingInputs.length).toBe(2);
  });

  it('shows empty state when items array is empty', () => {
    render(TimelineEditor, { props: { items: [] } });
    expect(screen.getByText(/no timeline steps/i)).toBeDefined();
    expect(screen.queryByRole('list', { name: /timeline steps/i })).toBeNull();
  });

  it('emits update:itemHeading when step heading input changes', async () => {
    const { emitted } = render(TimelineEditor, { props: { items: ITEMS } });
    const headingInputs = screen.getAllByRole('textbox', { name: /heading/i });
    await fireEvent.update(headingInputs[0]!, 'Updated Step 1');
    await waitFor(
      () => {
        expect(emitted()['update:itemHeading']).toBeDefined();
      },
      { timeout: 400 },
    );
    const payload = (emitted()['update:itemHeading']?.[0] as [unknown])[0] as {
      itemId: string;
      value: string;
    };
    expect(payload.itemId).toBe('step-1');
    expect(payload.value).toBe('Updated Step 1');
  });

  it('disables all inputs when disabled=true', () => {
    render(TimelineEditor, { props: { items: ITEMS, disabled: true } });
    const headingInputs = screen.getAllByRole('textbox', { name: /heading/i });
    for (const input of headingInputs) {
      expect((input as HTMLInputElement).disabled).toBe(true);
    }
  });
});
