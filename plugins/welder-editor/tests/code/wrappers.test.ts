// tests/code/wrappers.test.ts
//
// Happy-path and failure-path tests for wrapper detector and extractor functions.
// Covers: CopyWrap, Badge, ImageWrap, CardWrap, TimelineWrap, TableWrap, JourneyWrap.
// No ChartWrap — ADR-0007.
//
// Shared fixtures from validation/fixtures/figma-mock/ replace the inline
// helpers that previously lived in this file (refactored in Sprint 1, task 1.14).
// figma.mixed is installed by tests/setup.code.ts before any import runs.
//
// Owner: figma-api-engineer

import { describe, it, expect, vi } from 'vitest';
import {
  makeTextNode,
  makeInstanceNode,
  makeFrameNode,
} from '../../../../validation/fixtures/figma-mock';

import { extractCopyWrap } from '../../code/wrappers/CopyWrap';
import { extractBadge } from '../../code/wrappers/Badge';
import { extractImageWrap } from '../../code/wrappers/ImageWrap';
import { extractCardsFromScope } from '../../code/wrappers/CardWrap';
import { extractCopyWrapItems } from '../../code/wrappers/TimelineWrap';
import { scanTableSlotNode } from '../../code/wrappers/TableWrap';
import { scanJourneySlotNode } from '../../code/wrappers/JourneyWrap';

// ---------------------------------------------------------------------------
// CopyWrap extractor
// ---------------------------------------------------------------------------

describe('extractCopyWrap', function () {
  it('returns heading and paragraph from visible text nodes', function () {
    const headingText = makeTextNode({ name: 'Heading', characters: 'My Title', visible: true });
    const paragraphText = makeTextNode({
      name: 'Paragraph',
      characters: 'Body text',
      visible: true,
    });

    const slide = makeInstanceNode({ id: 'slide-1', name: 'Slide', width: 1920, height: 1080 });
    (headingText as unknown as Record<string, unknown>).parent = slide;
    (paragraphText as unknown as Record<string, unknown>).parent = slide;

    const copyWrap = makeInstanceNode({
      id: 'cw-1',
      name: 'CopyWrap',
      findAll: vi.fn().mockImplementation(function (pred: (n: SceneNode) => boolean) {
        return [headingText, paragraphText].filter(pred);
      }),
    });

    const result = extractCopyWrap(copyWrap, slide);
    expect(result.copyWrapId).toBe('cw-1');
    expect(result.heading).toBe('My Title');
    expect(result.paragraph).toBe('Body text');
    // ADR-0008: headingDim always null in v0.1.0
    expect(result.headingDim).toBe(null);
  });

  it('returns empty heading when Heading node is absent', function () {
    const slide = makeInstanceNode({ id: 'slide-1' });
    const copyWrap = makeInstanceNode({
      findAll: vi.fn().mockReturnValue([]),
    });
    const result = extractCopyWrap(copyWrap, slide);
    expect(result.heading).toBe('');
  });

  it('returns null paragraph when Paragraph node is absent', function () {
    const slide = makeInstanceNode({ id: 'slide-1' });
    const headingText = makeTextNode({
      name: 'Heading',
      characters: 'Title',
      visible: true,
      parent: slide as unknown as Record<string, unknown>,
    });

    const copyWrap = makeInstanceNode({
      findAll: vi.fn().mockImplementation(function (pred: (n: SceneNode) => boolean) {
        return [headingText].filter(pred);
      }),
    });
    const result = extractCopyWrap(copyWrap, slide);
    expect(result.paragraph).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// Badge extractor
// ---------------------------------------------------------------------------

describe('extractBadge', function () {
  it('reads label and returns default icon when icon_wrapper is absent', function () {
    const labelText = makeTextNode({ name: 'Label', characters: 'Early Access' });
    const badge = makeInstanceNode({
      id: 'badge-1',
      name: 'Badge',
      findOne: vi.fn().mockImplementation(function (pred: (n: SceneNode) => boolean) {
        if (pred(labelText)) return labelText;
        return null;
      }),
      findChild: vi.fn().mockReturnValue(null),
    });
    const result = extractBadge(badge);
    expect(result.badgeNodeId).toBe('badge-1');
    expect(result.label).toBe('Early Access');
    expect(typeof result.icon).toBe('string');
  });

  it('falls back to badge name when no Label text node', function () {
    const badge = makeInstanceNode({
      id: 'badge-2',
      name: 'Badge',
      findOne: vi.fn().mockReturnValue(null),
      findChild: vi.fn().mockReturnValue(null),
    });
    const result = extractBadge(badge);
    expect(result.label).toBe('Badge');
  });
});

// ---------------------------------------------------------------------------
// ImageWrap extractor
// ---------------------------------------------------------------------------

describe('extractImageWrap', function () {
  it('returns imageHash from IMAGE fill on named slot', function () {
    const imageNode = {
      type: 'FRAME',
      id: 'img-slot',
      name: 'Image',
      fills: [{ type: 'IMAGE', imageHash: 'abc123' }],
      visible: true,
    } as unknown as SceneNode;

    const imageWrap = makeInstanceNode({
      id: 'iw-1',
      findOne: vi.fn().mockImplementation(function (pred: (n: SceneNode) => boolean) {
        if (pred(imageNode)) return imageNode;
        return null;
      }),
    });

    const result = extractImageWrap(imageWrap);
    expect(result.imageWrapId).toBe('iw-1');
    expect(result.imageHash).toBe('abc123');
  });

  it('returns null imageHash when no IMAGE fill exists', function () {
    const emptySlot = {
      type: 'FRAME',
      id: 'empty-slot',
      name: 'Image',
      fills: [],
      visible: true,
    } as unknown as SceneNode;

    const imageWrap = makeInstanceNode({
      id: 'iw-2',
      findOne: vi.fn().mockImplementation(function (pred: (n: SceneNode) => boolean) {
        if (pred(emptySlot)) return emptySlot;
        return null;
      }),
    });

    const result = extractImageWrap(imageWrap);
    expect(result.imageHash).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// CardWrap — extractCardsFromScope
// ---------------------------------------------------------------------------

describe('extractCardsFromScope', function () {
  it('extracts cards with heading and paragraph', function () {
    const headingText = makeTextNode({ name: 'Heading', characters: 'Card Title' });
    const paragraphText = makeTextNode({ name: 'Paragraph', characters: 'Card body' });

    const card = makeInstanceNode({
      id: 'card-1',
      name: 'Card',
      findAll: vi.fn().mockReturnValue([]),
      findOne: vi.fn().mockImplementation(function (pred: (n: SceneNode) => boolean) {
        if (pred(headingText)) return headingText;
        if (pred(paragraphText)) return paragraphText;
        return null;
      }),
      findChild: vi.fn().mockReturnValue(null),
      children: [],
    });

    const slide = makeInstanceNode({ id: 'slide-1' });
    const cardWrap = makeInstanceNode({
      id: 'cardwrap-1',
      findAll: vi.fn().mockImplementation(function (pred: (n: SceneNode) => boolean) {
        if (pred(card)) return [card];
        return [];
      }),
    });

    const items = extractCardsFromScope(cardWrap, slide);
    expect(items).toHaveLength(1);
    expect(items[0]!.cardNodeId).toBe('card-1');
    expect(items[0]!.heading).toBe('Card Title');
    expect(items[0]!.paragraph).toBe('Card body');
  });

  it('skips cards without a Heading text node', function () {
    const cardNoHeading = makeInstanceNode({
      id: 'bad-card',
      name: 'Card',
      findOne: vi.fn().mockReturnValue(null),
      children: [],
    });
    const slide = makeInstanceNode({ id: 'slide-1' });
    const cardWrap = makeInstanceNode({
      findAll: vi.fn().mockImplementation(function (pred: (n: SceneNode) => boolean) {
        if (pred(cardNoHeading)) return [cardNoHeading];
        return [];
      }),
    });
    expect(extractCardsFromScope(cardWrap, slide)).toHaveLength(0);
  });

  it('returns empty array when no Card instances', function () {
    const slide = makeInstanceNode({ id: 'slide-1' });
    const cardWrap = makeInstanceNode({
      findAll: vi.fn().mockReturnValue([]),
    });
    expect(extractCardsFromScope(cardWrap, slide)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TimelineWrap — extractCopyWrapItems
// ---------------------------------------------------------------------------

describe('extractCopyWrapItems', function () {
  it('extracts CopyWrap items from a TimelineWrap scope', function () {
    const headingText = makeTextNode({ name: 'Heading', characters: 'Step 1' });
    const paragraphText = makeTextNode({ name: 'Paragraph', characters: 'Description' });

    const cwItem = makeInstanceNode({
      id: 'cw-item-1',
      name: 'CopyWrap',
      findOne: vi.fn().mockImplementation(function (pred: (n: SceneNode) => boolean) {
        if (pred(headingText)) return headingText;
        if (pred(paragraphText)) return paragraphText;
        return null;
      }),
    });

    const timelineWrap = makeInstanceNode({
      findAll: vi.fn().mockImplementation(function (pred: (n: SceneNode) => boolean) {
        if (pred(cwItem)) return [cwItem];
        return [];
      }),
    });

    const items = extractCopyWrapItems(timelineWrap);
    expect(items).toHaveLength(1);
    expect(items[0]!.copyWrapNodeId).toBe('cw-item-1');
    expect(items[0]!.heading).toBe('Step 1');
    expect(items[0]!.paragraph).toBe('Description');
  });

  it('skips CopyWrap items without a Heading', function () {
    const cwNoHeading = makeInstanceNode({
      name: 'CopyWrap',
      findOne: vi.fn().mockReturnValue(null),
    });
    const timelineWrap = makeInstanceNode({
      findAll: vi.fn().mockImplementation(function (pred: (n: SceneNode) => boolean) {
        if (pred(cwNoHeading)) return [cwNoHeading];
        return [];
      }),
    });
    expect(extractCopyWrapItems(timelineWrap)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TableWrap — scanTableSlotNode
// ---------------------------------------------------------------------------

describe('scanTableSlotNode', function () {
  it('reads rows and cells from slot children', function () {
    const cellText = makeTextNode({ characters: 'Cell A1' });
    const cell = makeFrameNode({
      id: 'cell-1',
      name: 'TableItem-c0',
      findOne: vi.fn().mockImplementation(function (pred: (n: SceneNode) => boolean) {
        if (pred(cellText)) return cellText;
        return null;
      }),
    });

    const row = makeFrameNode({
      id: 'row-1',
      name: 'TableRow-0',
      children: [cell as unknown as SceneNode],
    });

    const slot = makeFrameNode({
      id: 'slot-1',
      children: [row as unknown as SceneNode],
      getPluginData: vi.fn().mockImplementation(function (key: string) {
        if (key === 'width') return 'md';
        if (key === 'hasColumnHeader') return '0';
        if (key === 'textSize') return 'md';
        return '';
      }),
    });

    const model = scanTableSlotNode(slot);
    expect(model.slotId).toBe('slot-1');
    expect(model.width).toBe('md');
    expect(model.hasColumnHeader).toBe(false);
    expect(model.rows).toHaveLength(1);
    expect(model.rows[0]!.cells).toHaveLength(1);
    expect(model.rows[0]!.cells[0]!.value).toBe('Cell A1');
  });

  it('defaults width to md when pluginData is empty', function () {
    const slot = makeFrameNode({
      id: 'slot-2',
      children: [],
      getPluginData: vi.fn().mockReturnValue(''),
    });
    const model = scanTableSlotNode(slot);
    expect(model.width).toBe('md');
  });

  it('reads hasColumnHeader from pluginData', function () {
    const slot = makeFrameNode({
      id: 'slot-3',
      children: [],
      getPluginData: vi.fn().mockImplementation(function (key: string) {
        if (key === 'hasColumnHeader') return '1';
        return 'md';
      }),
    });
    const model = scanTableSlotNode(slot);
    expect(model.hasColumnHeader).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// JourneyWrap — scanJourneySlotNode
// ---------------------------------------------------------------------------

describe('scanJourneySlotNode', function () {
  it('returns an empty items array and default columns when slot is empty', function () {
    const slot = makeFrameNode({
      id: 'j-slot-1',
      children: [],
      getPluginData: vi.fn().mockReturnValue(''),
    });
    const model = scanJourneySlotNode(slot);
    expect(model.slotId).toBe('j-slot-1');
    expect(model.items).toHaveLength(0);
    // Default 6 empty columns when no WelderJourneyHeader found.
    expect(model.columns).toHaveLength(6);
  });

  it('reads JourneyItem instances from WelderJourneyContent', function () {
    const labelText = makeTextNode({ characters: 'Phase A' });
    const pill = makeInstanceNode({
      id: 'pill-1',
      name: 'JourneyItem',
      findOne: vi.fn().mockImplementation(function (pred: (n: SceneNode) => boolean) {
        if (pred(labelText)) return labelText;
        return null;
      }),
      getPluginData: vi.fn().mockImplementation(function (key: string) {
        if (key === 'journey-icon') return 'star';
        if (key === 'journey-start-pct') return '10';
        if (key === 'journey-end-pct') return '40';
        return '';
      }),
    });

    const contentFrame = makeFrameNode({
      id: 'content-1',
      name: 'WelderJourneyContent',
      children: [pill as unknown as SceneNode],
    });

    const slot = makeFrameNode({
      id: 'j-slot-2',
      children: [contentFrame as unknown as SceneNode],
      getPluginData: vi.fn().mockReturnValue(''),
    });

    const model = scanJourneySlotNode(slot);
    expect(model.items).toHaveLength(1);
    expect(model.items[0]!.icon).toBe('star');
    expect(model.items[0]!.startPct).toBe(10);
    expect(model.items[0]!.endPct).toBe(40);
    expect(model.items[0]!.label).toBe('Phase A');
  });

  it('defaults icon to star when journey-icon pluginData is empty', function () {
    const labelText = makeTextNode({ characters: '' });
    const pill = makeInstanceNode({
      id: 'pill-2',
      name: 'JourneyItem',
      findOne: vi.fn().mockImplementation(function (pred: (n: SceneNode) => boolean) {
        if (pred(labelText)) return labelText;
        return null;
      }),
      getPluginData: vi.fn().mockReturnValue(''),
    });

    const contentFrame = makeFrameNode({
      id: 'content-2',
      name: 'WelderJourneyContent',
      children: [pill as unknown as SceneNode],
    });

    const slot = makeFrameNode({
      id: 'j-slot-3',
      children: [contentFrame as unknown as SceneNode],
      getPluginData: vi.fn().mockReturnValue(''),
    });

    const model = scanJourneySlotNode(slot);
    expect(model.items[0]!.icon).toBe('star');
  });
});
