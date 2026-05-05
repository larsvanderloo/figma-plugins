// packages/figma-api/tests/variables.test.ts
//
// Tests for variables.ts library variable helpers.

import { describe, it, expect, vi } from 'vitest';
import {
  resolveVariableForConsumer,
  setBoundVariableForPaintSafe,
  loadNamedVariables,
} from '../src/variables';

// ---------------------------------------------------------------------------
// resolveVariableForConsumer
// ---------------------------------------------------------------------------

describe('resolveVariableForConsumer', () => {
  it('happy path: returns resolved VariableValue from resolveForConsumer', () => {
    const expectedValue: RGB = { r: 1, g: 0.467, b: 0 };
    const variable = {
      resolveForConsumer: vi.fn(() => ({
        value: expectedValue,
        resolvedType: 'COLOR' as const,
      })),
    } as unknown as Variable;

    const node = {} as SceneNode;
    const result = resolveVariableForConsumer(variable, node);

    expect(variable.resolveForConsumer).toHaveBeenCalledWith(node);
    expect(result).toBe(expectedValue);
  });

  it('error path: propagates when resolveForConsumer throws', () => {
    const variable = {
      resolveForConsumer: () => {
        throw new Error('mode resolution failed');
      },
    } as unknown as Variable;

    expect(() => resolveVariableForConsumer(variable, {} as SceneNode)).toThrow(
      'mode resolution failed',
    );
  });
});

// ---------------------------------------------------------------------------
// setBoundVariableForPaintSafe (T28.2 canonical pattern)
// ---------------------------------------------------------------------------

describe('setBoundVariableForPaintSafe', () => {
  it('happy path: applies bound variable to the correct paint index', () => {
    const variable = { id: 'var-1' } as unknown as Variable;
    const fallback: RGB = { r: 1, g: 0.467, b: 0 };

    const boundPaint: SolidPaint = {
      type: 'SOLID',
      color: fallback,
      opacity: 1,
      visible: true,
      blendMode: 'NORMAL',
    };

    (globalThis as Record<string, unknown>)['figma'] = {
      variables: {
        setBoundVariableForPaint: vi.fn(() => boundPaint),
      },
    };

    let assignedFills: Paint[] | undefined;
    const node = {
      get fills() {
        return [
          {
            type: 'SOLID',
            color: { r: 0, g: 0, b: 0 },
            opacity: 1,
            visible: true,
            blendMode: 'NORMAL',
          } as SolidPaint,
        ] as Paint[];
      },
      set fills(v: Paint[]) {
        assignedFills = v;
      },
    } as unknown as MinimalFillsMixin & BaseNode;

    setBoundVariableForPaintSafe(node, 0, variable, fallback);

    expect(figma.variables.setBoundVariableForPaint).toHaveBeenCalled();
    expect(assignedFills).toBeDefined();
    expect(assignedFills?.[0]).toBe(boundPaint);
  });

  it('error path: no-op when paintIndex is out of range', () => {
    const variable = {} as Variable;
    const setBoundSpy = vi.fn();

    (globalThis as Record<string, unknown>)['figma'] = {
      variables: { setBoundVariableForPaint: setBoundSpy },
    };

    const node = {
      fills: [] as Paint[],
    } as unknown as MinimalFillsMixin & BaseNode;

    setBoundVariableForPaintSafe(node, 0, variable, { r: 0, g: 0, b: 0 });

    expect(setBoundSpy).not.toHaveBeenCalled();
  });

  it('no-op when fills is not an array', () => {
    const variable = {} as Variable;
    const setBoundSpy = vi.fn();

    (globalThis as Record<string, unknown>)['figma'] = {
      variables: { setBoundVariableForPaint: setBoundSpy },
    };

    const node = {
      fills: 'not-an-array',
    } as unknown as MinimalFillsMixin & BaseNode;

    setBoundVariableForPaintSafe(node, 0, variable, { r: 0, g: 0, b: 0 });
    expect(setBoundSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// loadNamedVariables
// ---------------------------------------------------------------------------

describe('loadNamedVariables', () => {
  it('happy path: imports all variables by key and returns a named record', async () => {
    const textVar = { id: 'text-var', key: 'text-key' } as unknown as Variable;
    const dimmerVar = { id: 'dimmer-var', key: 'dimmer-key' } as unknown as Variable;

    (globalThis as Record<string, unknown>)['figma'] = {
      variables: {
        importVariableByKeyAsync: vi.fn(async (key: string) => {
          if (key === 'text-key') return textVar;
          if (key === 'dimmer-key') return dimmerVar;
          throw new Error('unknown key');
        }),
      },
    };

    const result = await loadNamedVariables({
      text: 'text-key',
      dimmer: 'dimmer-key',
    });

    expect(result['text']).toBe(textVar);
    expect(result['dimmer']).toBe(dimmerVar);
  });

  it('error path: returns null for keys that fail to import', async () => {
    (globalThis as Record<string, unknown>)['figma'] = {
      variables: {
        importVariableByKeyAsync: vi.fn(async (_key: string) => {
          throw new Error('library unreachable');
        }),
      },
    };

    const result = await loadNamedVariables({ accent: 'bad-key' });

    expect(result['accent']).toBeNull();
  });

  it('returns partial result when some keys succeed and some fail', async () => {
    const goodVar = { id: 'good-var' } as unknown as Variable;

    (globalThis as Record<string, unknown>)['figma'] = {
      variables: {
        importVariableByKeyAsync: vi.fn(async (key: string) => {
          if (key === 'good-key') return goodVar;
          throw new Error('bad key');
        }),
      },
    };

    const result = await loadNamedVariables({
      good: 'good-key',
      bad: 'bad-key',
    });

    expect(result['good']).toBe(goodVar);
    expect(result['bad']).toBeNull();
  });
});
