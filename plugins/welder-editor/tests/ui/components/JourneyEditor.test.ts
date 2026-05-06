// plugins/welder-editor/tests/ui/components/JourneyEditor.test.ts
//
// Sprint 5 — JourneyEditor component tests (flat ui/components/ layout).
//
// Owner: ui-engineer. Sprint 5 Task 5.8.

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/vue';
import JourneyEditor from '@/components/JourneyEditor.vue';
import { createPinia, setActivePinia } from 'pinia';
import type { JourneyWrapModel } from '@shared/messages.js';

const JOURNEY_MODEL: JourneyWrapModel = {
  slotId: 'slot-j1',
  columns: [{ header: 'Phase 1', subheader: 'Discovery' }],
  items: [{ itemNodeId: 'item-1', icon: 'sparkles', label: 'Research', startPct: 0, endPct: 40 }],
};

describe('JourneyEditor', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('renders "Journey" section label', () => {
    render(JourneyEditor, { props: { model: JOURNEY_MODEL } });
    expect(screen.getByText('Journey')).toBeDefined();
  });

  it('renders column header TitleDescriptionEditor with heading input', () => {
    render(JourneyEditor, { props: { model: JOURNEY_MODEL } });
    const headingInput = screen.getByRole('textbox', { name: /heading/i });
    expect(headingInput).toBeDefined();
  });

  it('renders step 1 label input', () => {
    render(JourneyEditor, { props: { model: JOURNEY_MODEL } });
    expect(screen.getByRole('textbox', { name: /step 1 label/i })).toBeDefined();
  });

  it('renders start/end % inputs', () => {
    render(JourneyEditor, { props: { model: JOURNEY_MODEL } });
    expect(screen.getByRole('spinbutton', { name: /step 1 start %/i })).toBeDefined();
    expect(screen.getByRole('spinbutton', { name: /step 1 end %/i })).toBeDefined();
  });

  it('shows empty state when items array is empty', () => {
    render(JourneyEditor, {
      props: { model: { ...JOURNEY_MODEL, items: [] } },
    });
    expect(screen.getByText(/no journey steps/i)).toBeDefined();
  });

  it('emits update:itemLabel when step label input changes', async () => {
    const { emitted } = render(JourneyEditor, { props: { model: JOURNEY_MODEL } });
    const labelInput = screen.getByRole('textbox', { name: /step 1 label/i });
    await fireEvent.input(labelInput, { target: { value: 'Research Updated' } });
    await waitFor(
      () => {
        expect(emitted()['update:itemLabel']).toBeDefined();
      },
      { timeout: 400 },
    );
    const payload = (emitted()['update:itemLabel']?.[0] as [unknown])[0] as {
      itemId: string;
      label: string;
    };
    expect(payload.label).toBe('Research Updated');
    expect(payload.itemId).toBe('item-1');
  });

  it('emits update:itemRange when start % input changes', async () => {
    const { emitted } = render(JourneyEditor, { props: { model: JOURNEY_MODEL } });
    const startInput = screen.getByRole('spinbutton', { name: /step 1 start %/i });
    await fireEvent.input(startInput, { target: { value: '10' } });
    await waitFor(
      () => {
        expect(emitted()['update:itemRange']).toBeDefined();
      },
      { timeout: 400 },
    );
    const payload = (emitted()['update:itemRange']?.[0] as [unknown])[0] as {
      startPct: number;
    };
    expect(payload.startPct).toBe(10);
  });
});
