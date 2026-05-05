// validation/fixtures/figma-mock/index.ts
//
// Shared node-factory helpers for code-side vitest tests.
//
// These factories replace the inline makeTextNode / makeInstanceNode /
// makeFrameNode helpers that previously lived in each test file. All
// production code in plugins/welder-editor/code/ that the tests exercise
// is covered by the subset of fields modelled here.
//
// Usage:
//   import { makeInstanceNode, makeTextNode, makeFrameNode } from
//     '../../../validation/fixtures/figma-mock';
//
//   // Merge overrides onto the default stub shape:
//   const slide = makeInstanceNode({ id: 'slide-1', name: 'Slide',
//                                    width: 1920, height: 1080 });
//
//   // Override traversal methods with vi.fn() for assertion:
//   const node = makeInstanceNode({
//     findOne: vi.fn().mockReturnValue(someChild),
//   });
//
// figma.mixed sentinel:
//   Install the figma global (including figma.mixed) in a test setup file;
//   see plugins/welder-editor/tests/setup.code.ts.
//
// No vitest import:
//   This module is framework-agnostic. Traversal method defaults are no-op
//   arrow functions. Tests that need to assert on calls should pass vi.fn()
//   via the overrides argument — this keeps vitest out of the fixtures module
//   and allows the fixtures to typecheck under the plugin tsconfig without
//   pulling vitest into the validation/ directory's module resolution.
//
// Owner: plugin-tester (harness contract)

// Overrides parameter intentionally uses Record<string, unknown> so callers
// can pass Figma node stubs (InstanceNode, FrameNode, etc. cast to unknown)
// without TypeScript complaining about FigmaNodeStub compatibility. The
// factories cast the merged object to `as unknown as T` before returning.
type NodeOverrides = Record<string, unknown>;

// ---------------------------------------------------------------------------
// makeTextNode
// ---------------------------------------------------------------------------
// Returns a stub shaped like Figma's TextNode.
// Defaults: type TEXT, empty characters, visible, no parent.

export function makeTextNode(overrides: NodeOverrides = {}): TextNode {
  return {
    type: 'TEXT',
    id: _uid('text'),
    name: 'Text',
    characters: '',
    visible: true,
    parent: null,
    ...overrides,
  } as unknown as TextNode;
}

// ---------------------------------------------------------------------------
// makeInstanceNode
// ---------------------------------------------------------------------------
// Returns a stub shaped like Figma's InstanceNode.
// Defaults: type INSTANCE, name 'Instance', visible, no parent.
// Traversal methods default to no-op arrow functions returning null / [].
// Pass vi.fn() in overrides when the test needs to assert on calls.

export function makeInstanceNode(overrides: NodeOverrides = {}): InstanceNode {
  return {
    type: 'INSTANCE',
    id: _uid('inst'),
    name: 'Instance',
    visible: true,
    parent: null,
    componentProperties: {} as Record<
      string,
      { type: string; value: string; boundVariables: Record<string, unknown> }
    >,
    findOne: () => null,
    findAll: () => [],
    findChild: () => null,
    getPluginData: () => '',
    setPluginData: () => undefined,
    setProperties: () => undefined,
    setRelaunchData: () => undefined,
    ...overrides,
  } as unknown as InstanceNode;
}

// ---------------------------------------------------------------------------
// makeFrameNode
// ---------------------------------------------------------------------------
// Returns a stub shaped like Figma's FrameNode.
// Defaults: type FRAME, name 'Frame', visible, no parent, empty children.
// Traversal methods default to no-op arrow functions returning null / [].

export function makeFrameNode(overrides: NodeOverrides = {}): FrameNode {
  return {
    type: 'FRAME',
    id: _uid('frame'),
    name: 'Frame',
    visible: true,
    parent: null,
    children: [],
    findOne: () => null,
    findAll: () => [],
    getPluginData: () => '',
    setPluginData: () => undefined,
    ...overrides,
  } as unknown as FrameNode;
}

// ---------------------------------------------------------------------------
// Internal counter for unique IDs
// ---------------------------------------------------------------------------
// Prevents id collisions when factories are called many times without
// explicit id overrides.

let _counter = 0;

function _uid(prefix: string): string {
  _counter += 1;
  return `${prefix}-${_counter}`;
}

// ---------------------------------------------------------------------------
// Re-export types for consumer convenience
// ---------------------------------------------------------------------------

export type { FigmaNodeStub, FigmaGlobalStub } from './types';
