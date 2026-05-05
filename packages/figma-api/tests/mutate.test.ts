// packages/figma-api/tests/mutate.test.ts
//
// Tests for mutate.ts helpers.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setCharactersSafe, swapInstanceComponent, withAtomic } from '../src/mutate';

// ---------------------------------------------------------------------------
// figma stub
// ---------------------------------------------------------------------------

function makeFigmaStub(opts: {
  loadFontAsyncFn?: (font: FontName) => Promise<void>;
  importComponentFn?: (key: string) => Promise<ComponentNode>;
  commitUndoSpy?: () => void;
}) {
  return {
    mixed: Symbol('mixed'),
    loadFontAsync: opts.loadFontAsyncFn ?? (async (_f: FontName) => undefined),
    importComponentByKeyAsync:
      opts.importComponentFn ??
      (async (_key: string) => {
        throw new Error('importComponentByKeyAsync not stubbed');
      }),
    commitUndo: opts.commitUndoSpy ?? vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// setCharactersSafe
// ---------------------------------------------------------------------------

describe('setCharactersSafe', () => {
  it('happy path: loads font and writes characters', async () => {
    const loadFontSpy = vi.fn(async (_f: FontName) => undefined);
    (globalThis as Record<string, unknown>)['figma'] = makeFigmaStub({
      loadFontAsyncFn: loadFontSpy,
    });

    let characters = '';
    const node = {
      type: 'TEXT',
      fontName: { family: 'Inter', style: 'Regular' } as FontName,
      get characters() {
        return characters;
      },
      set characters(v: string) {
        characters = v;
      },
      getStyledTextSegments: (_props: string[]) => [],
    } as unknown as TextNode;

    await setCharactersSafe(node, 'Hello world');

    expect(loadFontSpy).toHaveBeenCalledWith({ family: 'Inter', style: 'Regular' });
    expect(characters).toBe('Hello world');
  });

  it('error path: propagates loadFontAsync rejection', async () => {
    (globalThis as Record<string, unknown>)['figma'] = makeFigmaStub({
      loadFontAsyncFn: async (_f: FontName) => {
        throw new Error('font load failed');
      },
    });

    const node = {
      type: 'TEXT',
      fontName: { family: 'Inter', style: 'Regular' } as FontName,
      characters: '',
      getStyledTextSegments: (_props: string[]) => [],
    } as unknown as TextNode;

    await expect(setCharactersSafe(node, 'test')).rejects.toThrow('font load failed');
  });
});

// ---------------------------------------------------------------------------
// swapInstanceComponent
// ---------------------------------------------------------------------------

describe('swapInstanceComponent', () => {
  beforeEach(() => {
    (globalThis as Record<string, unknown>)['figma'] = makeFigmaStub({});
  });

  it('happy path (Strategy B): imports component and calls swapComponent', async () => {
    const comp = { type: 'COMPONENT', id: 'c-1' } as unknown as ComponentNode;
    const swapSpy = vi.fn();
    (globalThis as Record<string, unknown>)['figma'] = makeFigmaStub({
      importComponentFn: async (_key: string) => comp,
    });

    const instance = { swapComponent: swapSpy } as unknown as InstanceNode;
    const result = await swapInstanceComponent(instance, 'some-key');

    expect(result).toBe(true);
    expect(swapSpy).toHaveBeenCalledWith(comp);
  });

  it('error path: returns false when importComponentByKeyAsync throws', async () => {
    (globalThis as Record<string, unknown>)['figma'] = makeFigmaStub({
      importComponentFn: async (_key: string) => {
        throw new Error('library unavailable');
      },
    });

    const instance = {} as unknown as InstanceNode;
    const result = await swapInstanceComponent(instance, 'bad-key');

    expect(result).toBe(false);
  });

  it('falls through to Strategy C when swapComponent throws', async () => {
    const comp = { type: 'COMPONENT', id: 'c-2' } as unknown as ComponentNode;
    const setPropertiesSpy = vi.fn();

    (globalThis as Record<string, unknown>)['figma'] = makeFigmaStub({
      importComponentFn: async (_key: string) => comp,
    });

    const mainComp = {
      type: 'COMPONENT',
      parent: null,
      key: 'main-key',
      componentPropertyDefinitions: {
        'Icon#1:0': { type: 'INSTANCE_SWAP', preferredValues: [] },
      },
    } as unknown as ComponentNode;

    // importComponentByKeyAsync is called twice: once for the original key,
    // once for the fresh import in Strategy C.  Return comp for both.
    let callCount = 0;
    (globalThis as Record<string, unknown>)['figma'] = {
      ...makeFigmaStub({}),
      importComponentByKeyAsync: async (_key: string) => {
        callCount++;
        if (callCount === 1) return comp;
        return mainComp;
      },
    };

    const instance = {
      swapComponent: () => {
        throw new Error('swapComponent not allowed');
      },
      getMainComponentAsync: async () => mainComp,
      setProperties: setPropertiesSpy,
    } as unknown as InstanceNode;

    const result = await swapInstanceComponent(instance, 'icon-key');

    expect(result).toBe(true);
    expect(setPropertiesSpy).toHaveBeenCalledWith({ 'Icon#1:0': comp.id });
  });
});

// ---------------------------------------------------------------------------
// withAtomic
// ---------------------------------------------------------------------------

describe('withAtomic', () => {
  it('happy path: calls commitUndo before and after fn', async () => {
    const commitSpy = vi.fn();
    (globalThis as Record<string, unknown>)['figma'] = { commitUndo: commitSpy };

    const result = await withAtomic('test-op', async () => 42);

    expect(result).toBe(42);
    expect(commitSpy).toHaveBeenCalledTimes(2);
  });

  it('error path: calls commitUndo even when fn throws, then rethrows', async () => {
    const commitSpy = vi.fn();
    (globalThis as Record<string, unknown>)['figma'] = { commitUndo: commitSpy };

    await expect(
      withAtomic('failing-op', async () => {
        throw new Error('renderer failed');
      }),
    ).rejects.toThrow('renderer failed');

    // commitUndo must still be called twice (before + after)
    expect(commitSpy).toHaveBeenCalledTimes(2);
  });
});
