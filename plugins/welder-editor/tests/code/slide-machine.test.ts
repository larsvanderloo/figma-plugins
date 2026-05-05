// tests/code/slide-machine.test.ts
//
// Happy-path and failure-path tests for slide-machine.ts.
// Uses inline mocks (no shared fixture yet — plugin-tester refactors in Wave 2b).
//
// Test environment: node (environmentMatchGlobs: tests/code/**)
// No DOM, no figma.* — all figma.* calls are stubbed via globalThis.figma.
//
// Owner: figma-api-engineer

import { describe, it, expect, vi } from 'vitest';
import {
  isSlide,
  buildSlideSummary,
  buildSlideListSignature,
  isEffectivelyVisible,
  findCopyWrap,
  findBadge,
  findTableWrap,
  findTimelineWrap,
  getPropertyKey,
  setInstanceProperty,
} from '../../code/slide-machine';

// ---------------------------------------------------------------------------
// Minimal figma stub for tests that access figma.currentPage
// ---------------------------------------------------------------------------

function makeTextNode(overrides: Partial<TextNode> = {}): TextNode {
  return {
    type: 'TEXT',
    id: 'text-1',
    name: 'Heading',
    characters: 'Hello',
    visible: true,
    parent: null,
    ...overrides,
  } as unknown as TextNode;
}

function makeInstanceNode(overrides: Record<string, unknown> = {}): InstanceNode {
  return {
    type: 'INSTANCE',
    id: 'inst-1',
    name: 'Slide',
    width: 1920,
    height: 1080,
    visible: true,
    parent: null,
    findOne: vi.fn().mockReturnValue(null),
    findAll: vi.fn().mockReturnValue([]),
    componentProperties: {},
    setProperties: vi.fn(),
    ...overrides,
  } as unknown as InstanceNode;
}

// ---------------------------------------------------------------------------
// isSlide
// ---------------------------------------------------------------------------

describe('isSlide', function () {
  it('returns true for a correctly-shaped INSTANCE', function () {
    const node = makeInstanceNode({ name: 'Slide', width: 1920, height: 1080 });
    expect(isSlide(node)).toBe(true);
  });

  it('returns false when name is not Slide', function () {
    const node = makeInstanceNode({ name: 'NotSlide', width: 1920, height: 1080 });
    expect(isSlide(node)).toBe(false);
  });

  it('returns false when width is wrong', function () {
    const node = makeInstanceNode({ name: 'Slide', width: 1000, height: 1080 });
    expect(isSlide(node)).toBe(false);
  });

  it('returns false when height is wrong', function () {
    const node = makeInstanceNode({ name: 'Slide', width: 1920, height: 720 });
    expect(isSlide(node)).toBe(false);
  });

  it('returns false for a FRAME node', function () {
    const node = {
      type: 'FRAME',
      name: 'Slide',
      width: 1920,
      height: 1080,
    } as unknown as SceneNode;
    expect(isSlide(node)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildSlideSummary
// ---------------------------------------------------------------------------

describe('buildSlideSummary', function () {
  it('returns a SlideSummary with the correct number', function () {
    const copyWrapNode = makeInstanceNode({ name: 'CopyWrap' });
    const headingText = makeTextNode({ name: 'Heading', characters: 'My Slide' });
    copyWrapNode.findOne = vi.fn().mockReturnValue(headingText);

    const slide = makeInstanceNode({
      id: 'slide-abc',
      name: 'Slide',
      width: 1920,
      height: 1080,
      findOne: vi.fn().mockImplementation(function (pred: (n: SceneNode) => boolean) {
        if (pred(copyWrapNode)) return copyWrapNode;
        return null;
      }),
      findAll: vi.fn().mockReturnValue([copyWrapNode]),
      parent: null,
    });

    const summary = buildSlideSummary(slide, 3);
    expect(summary.id).toBe('slide-abc');
    expect(summary.number).toBe(3);
    expect(typeof summary.name).toBe('string');
    expect(summary.isSkipped).toBe(null); // no SlideNode parent
  });

  it('falls back to "Slide N" when no CopyWrap heading is found', function () {
    const slide = makeInstanceNode({
      id: 'slide-xyz',
      findOne: vi.fn().mockReturnValue(null),
      findAll: vi.fn().mockReturnValue([]),
    });
    const summary = buildSlideSummary(slide, 7);
    expect(summary.name).toBe('Slide 7');
  });

  it('reflects isSkipped from SlideNode parent', function () {
    const slideParent = { type: 'SLIDE', isSkippedSlide: true };
    const slide = makeInstanceNode({
      parent: slideParent as unknown as BaseNode,
    });
    const summary = buildSlideSummary(slide, 1);
    expect(summary.isSkipped).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildSlideListSignature
// ---------------------------------------------------------------------------

describe('buildSlideListSignature', function () {
  it('returns a stable string for the same list', function () {
    const list = [
      { id: 'a', number: 1, name: 'Slide 1', isSkipped: null },
      { id: 'b', number: 2, name: 'Slide 2', isSkipped: false },
    ];
    const sig1 = buildSlideListSignature(list);
    const sig2 = buildSlideListSignature(list);
    expect(sig1).toBe(sig2);
  });

  it('changes when a slide is renamed', function () {
    const list1 = [{ id: 'a', number: 1, name: 'Slide 1', isSkipped: null }];
    const list2 = [{ id: 'a', number: 1, name: 'New Name', isSkipped: null }];
    expect(buildSlideListSignature(list1)).not.toBe(buildSlideListSignature(list2));
  });

  it('changes when isSkipped toggles', function () {
    const list1 = [{ id: 'a', number: 1, name: 'Slide 1', isSkipped: false }];
    const list2 = [{ id: 'a', number: 1, name: 'Slide 1', isSkipped: true }];
    expect(buildSlideListSignature(list1)).not.toBe(buildSlideListSignature(list2));
  });

  it('returns an empty-list signature for no slides', function () {
    const sig = buildSlideListSignature([]);
    expect(sig).toBe('0#');
  });
});

// ---------------------------------------------------------------------------
// isEffectivelyVisible
// ---------------------------------------------------------------------------

describe('isEffectivelyVisible', function () {
  it('returns true when node itself is visible and slide is parent', function () {
    const slide = makeInstanceNode({ id: 'slide-1', visible: true });
    const node = makeInstanceNode({
      id: 'node-1',
      visible: true,
      parent: slide as unknown as BaseNode,
    });
    expect(isEffectivelyVisible(node, slide)).toBe(true);
  });

  it('returns false when node is not visible', function () {
    const slide = makeInstanceNode({ id: 'slide-1' });
    const node = makeInstanceNode({
      id: 'node-1',
      visible: false,
      parent: slide as unknown as BaseNode,
    });
    expect(isEffectivelyVisible(node, slide)).toBe(false);
  });

  it('returns false when an ancestor is not visible', function () {
    const slide = makeInstanceNode({ id: 'slide-1', visible: true });
    const parent = makeInstanceNode({
      id: 'parent-1',
      visible: false,
      parent: slide as unknown as BaseNode,
    });
    const node = makeInstanceNode({
      id: 'node-1',
      visible: true,
      parent: parent as unknown as BaseNode,
    });
    expect(isEffectivelyVisible(node, slide)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// findCopyWrap
// ---------------------------------------------------------------------------

describe('findCopyWrap', function () {
  it('returns the CopyWrap instance when present', function () {
    const copyWrap = makeInstanceNode({ id: 'cw-1', name: 'CopyWrap' });
    const slide = makeInstanceNode({
      findOne: vi.fn().mockImplementation(function (pred: (n: SceneNode) => boolean) {
        if (pred(copyWrap)) return copyWrap;
        return null;
      }),
    });
    expect(findCopyWrap(slide)).toBe(copyWrap);
  });

  it('returns null when no CopyWrap exists', function () {
    const slide = makeInstanceNode({
      findOne: vi.fn().mockReturnValue(null),
    });
    expect(findCopyWrap(slide)).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// findBadge (visibility filter)
// ---------------------------------------------------------------------------

describe('findBadge', function () {
  it('returns the Badge when visible', function () {
    const slide = makeInstanceNode({ id: 'slide-1' });
    const badge = makeInstanceNode({
      id: 'badge-1',
      name: 'Badge',
      visible: true,
      parent: slide as unknown as BaseNode,
    });
    (slide as unknown as Record<string, unknown>).findOne = vi.fn().mockImplementation(function (
      pred: (n: SceneNode) => boolean,
    ) {
      if (pred(badge)) return badge;
      return null;
    });
    expect(findBadge(slide)).toBe(badge);
  });

  it('returns null when badge is not visible (hidden by variant)', function () {
    const slide = makeInstanceNode({ id: 'slide-1' });
    const badge = makeInstanceNode({
      id: 'badge-1',
      name: 'Badge',
      visible: false,
      parent: slide as unknown as BaseNode,
    });
    // findOne finds the badge but visibility guard should reject it.
    // We need the predicate to be called with the badge — simulate findOne calling pred.
    slide.findOne = vi.fn().mockImplementation(function (pred: (n: SceneNode) => boolean) {
      // The predicate includes the visibility check; if it returns false, findOne returns null.
      if (pred(badge)) return badge;
      return null;
    });
    expect(findBadge(slide)).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// findTableWrap (name matching)
// ---------------------------------------------------------------------------

describe('findTableWrap', function () {
  it('matches exact name TableWrap', function () {
    const tableWrap = makeInstanceNode({ name: 'TableWrap' });
    const slide = makeInstanceNode({
      findOne: vi.fn().mockImplementation(function (pred: (n: SceneNode) => boolean) {
        if (pred(tableWrap)) return tableWrap;
        return null;
      }),
    });
    expect(findTableWrap(slide)).toBe(tableWrap);
  });

  it('matches Tabel=Table Default variant name', function () {
    const tableWrap = makeInstanceNode({ name: 'Tabel=Table Default' });
    const slide = makeInstanceNode({
      findOne: vi.fn().mockImplementation(function (pred: (n: SceneNode) => boolean) {
        if (pred(tableWrap)) return tableWrap;
        return null;
      }),
    });
    expect(findTableWrap(slide)).toBe(tableWrap);
  });

  it('does not match a TimelineWrap via the Tabel= prefix', function () {
    const timelineWrap = makeInstanceNode({ name: 'Tabel=Alt Timeline' });
    const slide = makeInstanceNode({
      findOne: vi.fn().mockImplementation(function (pred: (n: SceneNode) => boolean) {
        if (pred(timelineWrap)) return timelineWrap;
        return null;
      }),
    });
    expect(findTableWrap(slide)).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// findTimelineWrap (name matching)
// ---------------------------------------------------------------------------

describe('findTimelineWrap', function () {
  it('matches exact name TimelineWrap', function () {
    const tw = makeInstanceNode({ name: 'TimelineWrap' });
    const slide = makeInstanceNode({
      findOne: vi.fn().mockImplementation(function (pred: (n: SceneNode) => boolean) {
        if (pred(tw)) return tw;
        return null;
      }),
    });
    expect(findTimelineWrap(slide)).toBe(tw);
  });

  it('matches name containing Timeline', function () {
    const tw = makeInstanceNode({ name: 'Tabel=Alt Timeline' });
    const slide = makeInstanceNode({
      findOne: vi.fn().mockImplementation(function (pred: (n: SceneNode) => boolean) {
        if (pred(tw)) return tw;
        return null;
      }),
    });
    expect(findTimelineWrap(slide)).toBe(tw);
  });
});

// ---------------------------------------------------------------------------
// getPropertyKey
// ---------------------------------------------------------------------------

describe('getPropertyKey', function () {
  it('returns exact key when no hash suffix', function () {
    const instance = makeInstanceNode({
      componentProperties: {
        Style: { type: 'TEXT', value: 'Default', boundVariables: {} },
      } as unknown as InstanceNode['componentProperties'],
    });
    expect(getPropertyKey(instance, 'Style')).toBe('Style');
  });

  it('resolves hashed key by prefix', function () {
    const instance = makeInstanceNode({
      componentProperties: {
        'Style#1234:0': { type: 'TEXT', value: 'Default', boundVariables: {} },
      } as unknown as InstanceNode['componentProperties'],
    });
    expect(getPropertyKey(instance, 'Style')).toBe('Style#1234:0');
  });

  it('returns null when property does not exist', function () {
    const instance = makeInstanceNode({
      componentProperties: {} as unknown as InstanceNode['componentProperties'],
    });
    expect(getPropertyKey(instance, 'Missing')).toBe(null);
  });
});

// ---------------------------------------------------------------------------
// setInstanceProperty
// ---------------------------------------------------------------------------

describe('setInstanceProperty', function () {
  it('calls setProperties with the resolved key and returns true', function () {
    const setProps = vi.fn();
    const instance = makeInstanceNode({
      componentProperties: {
        'Icon#abc:0': { type: 'INSTANCE_SWAP', value: 'comp-id', boundVariables: {} },
      } as unknown as InstanceNode['componentProperties'],
      setProperties: setProps,
    });
    const result = setInstanceProperty(instance, 'Icon', 'new-comp-id');
    expect(result).toBe(true);
    expect(setProps).toHaveBeenCalledWith({ 'Icon#abc:0': 'new-comp-id' });
  });

  it('returns false when property key does not exist', function () {
    const instance = makeInstanceNode({
      componentProperties: {} as unknown as InstanceNode['componentProperties'],
    });
    expect(setInstanceProperty(instance, 'Missing', 'value')).toBe(false);
  });
});
