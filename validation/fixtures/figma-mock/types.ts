// validation/fixtures/figma-mock/types.ts
//
// DeepPartial-style stub types for the structural figma.* mock.
//
// These types let test fixtures typecheck without requiring the full
// @figma/plugin-typings surface. They model only the subset of the API
// called by plugins/welder-editor/code/ at Sprint 1.
//
// Owner: plugin-tester (harness contract)

// ---------------------------------------------------------------------------
// FigmaNodeStub
// ---------------------------------------------------------------------------
// Represents a plain-object stub for any SceneNode subtype. Every field
// that the production code reads is present; unneeded fields are omitted.
// Cast to `InstanceNode`, `TextNode`, etc. in test code via `as unknown as T`.
//
// parent is typed as `unknown` to avoid compatibility friction when tests
// pass a previously-created stub (cast as `BaseNode`) to makeInstanceNode().
//
// children is `readonly` to match @figma/plugin-typings' node shapes.

export interface FigmaNodeStub {
  id: string;
  type: string;
  name: string;
  visible?: boolean;
  // `unknown` prevents type-checking conflicts with BaseNode and its subtypes
  // when tests pass a stub cast as `as unknown as BaseNode`.
  parent?: unknown;
  width?: number;
  height?: number;
  characters?: string;
  readonly children?: readonly FigmaNodeStub[];
  fills?: ReadonlyArray<{ type: string; imageHash?: string }> | symbol;
  componentProperties?: Record<
    string,
    { type: string; value: string; boundVariables: Record<string, unknown> }
  >;
  // Traversal and plugin-data methods — typed as `unknown` here; test code
  // casts the full node to the specific Figma type after construction.
  findOne?: unknown;
  findAll?: unknown;
  findChild?: unknown;
  getPluginData?: unknown;
  setPluginData?: unknown;
  setRelaunchData?: unknown;
  setProperties?: unknown;
}

// ---------------------------------------------------------------------------
// FigmaGlobalStub
// ---------------------------------------------------------------------------
// Represents the minimal shape of the global figma object that code-side
// tests install via setup.code.ts.

export interface FigmaGlobalStub {
  mixed: symbol;
}
