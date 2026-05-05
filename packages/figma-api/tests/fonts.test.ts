// packages/figma-api/tests/fonts.test.ts
//
// Tests for fonts.ts canonical font-loading helpers.

import { describe, it, expect, vi } from 'vitest';
import { loadAllFontsForNode, setTextCharactersSafe } from '../src/fonts';

// ---------------------------------------------------------------------------
// figma stub helpers
// ---------------------------------------------------------------------------

function makeFigmaStub(loadFontSpy: (font: FontName) => Promise<void>) {
  return {
    mixed: Symbol('mixed'),
    loadFontAsync: loadFontSpy,
  };
}

function makeTextNode(opts: {
  fontName: FontName | symbol;
  segments?: Array<{ fontName: FontName }>;
}): TextNode {
  let characters = '';
  return {
    type: 'TEXT',
    fontName: opts.fontName,
    get characters() {
      return characters;
    },
    set characters(v: string) {
      characters = v;
    },
    getStyledTextSegments: (_props: string[]) => opts.segments ?? [],
  } as unknown as TextNode;
}

// ---------------------------------------------------------------------------
// loadAllFontsForNode — TextNode
// ---------------------------------------------------------------------------

describe('loadAllFontsForNode (TextNode)', () => {
  it('happy path: single font — calls loadFontAsync once', async () => {
    const loadSpy = vi.fn(async (_f: FontName) => undefined);
    (globalThis as Record<string, unknown>)['figma'] = makeFigmaStub(loadSpy);

    const font: FontName = { family: 'Inter', style: 'Regular' };
    const node = makeTextNode({ fontName: font });

    await loadAllFontsForNode(node);

    expect(loadSpy).toHaveBeenCalledOnce();
    expect(loadSpy).toHaveBeenCalledWith(font);
  });

  it('happy path: mixed fonts — loads each unique font once', async () => {
    const loadSpy = vi.fn(async (_f: FontName) => undefined);
    const mixedSymbol = Symbol('mixed');
    (globalThis as Record<string, unknown>)['figma'] = {
      mixed: mixedSymbol,
      loadFontAsync: loadSpy,
    };

    const font1: FontName = { family: 'Inter', style: 'Regular' };
    const font2: FontName = { family: 'Instrument Sans', style: 'Bold' };

    const node = makeTextNode({
      fontName: mixedSymbol,
      segments: [{ fontName: font1 }, { fontName: font2 }, { fontName: font1 }],
    });

    await loadAllFontsForNode(node);

    expect(loadSpy).toHaveBeenCalledTimes(2);
    expect(loadSpy).toHaveBeenCalledWith(font1);
    expect(loadSpy).toHaveBeenCalledWith(font2);
  });

  it('error path: propagates loadFontAsync rejection', async () => {
    (globalThis as Record<string, unknown>)['figma'] = {
      mixed: Symbol('mixed'),
      loadFontAsync: async (_f: FontName) => {
        throw new Error('font not available');
      },
    };

    const node = makeTextNode({ fontName: { family: 'Missing', style: 'Regular' } });

    await expect(loadAllFontsForNode(node)).rejects.toThrow('font not available');
  });
});

// ---------------------------------------------------------------------------
// loadAllFontsForNode — SceneNode (recursive)
// ---------------------------------------------------------------------------

describe('loadAllFontsForNode (SceneNode with children)', () => {
  it('loads fonts for all TEXT descendants', async () => {
    const loadSpy = vi.fn(async (_f: FontName) => undefined);
    (globalThis as Record<string, unknown>)['figma'] = makeFigmaStub(loadSpy);

    const font1: FontName = { family: 'Inter', style: 'Regular' };
    const font2: FontName = { family: 'Inter', style: 'Bold' };

    const textNode1 = makeTextNode({ fontName: font1 });
    const textNode2 = makeTextNode({ fontName: font2 });

    const frameNode = {
      type: 'FRAME',
      findAll: (pred: (n: BaseNode) => boolean) => {
        return [textNode1, textNode2].filter(pred);
      },
    } as unknown as SceneNode;

    await loadAllFontsForNode(frameNode);

    expect(loadSpy).toHaveBeenCalledWith(font1);
    expect(loadSpy).toHaveBeenCalledWith(font2);
  });
});

// ---------------------------------------------------------------------------
// setTextCharactersSafe
// ---------------------------------------------------------------------------

describe('setTextCharactersSafe', () => {
  it('happy path: loads fonts then writes characters', async () => {
    const loadSpy = vi.fn(async (_f: FontName) => undefined);
    (globalThis as Record<string, unknown>)['figma'] = makeFigmaStub(loadSpy);

    const font: FontName = { family: 'Inter', style: 'Regular' };
    const node = makeTextNode({ fontName: font });

    await setTextCharactersSafe(node, 'New text');

    expect(loadSpy).toHaveBeenCalledWith(font);
    expect(node.characters).toBe('New text');
  });

  it('error path: does not write characters when font load fails', async () => {
    (globalThis as Record<string, unknown>)['figma'] = {
      mixed: Symbol('mixed'),
      loadFontAsync: async (_f: FontName) => {
        throw new Error('font unavailable');
      },
    };

    const node = makeTextNode({ fontName: { family: 'Missing', style: 'Regular' } });

    await expect(setTextCharactersSafe(node, 'text')).rejects.toThrow('font unavailable');
    // characters should not have been written
    expect(node.characters).toBe('');
  });
});
