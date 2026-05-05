# Fixture conventions — welder-editor code-side tests

Owner: `plugin-tester` (conventions, harness) / `figma-api-engineer` (fixture content, test authoring)

This directory holds shared test fixtures used by `plugins/welder-editor/tests/`.
Sprint 0 establishes the conventions and directory layout; Sprint 1+ fills in the
actual fixture files.

---

## Directory map

```
validation/fixtures/
  figma-mock/       — mock figma.* global for code-side vitest tests
  slide-machine/    — typed JSON/TS fixtures representing Welder slides
  renderers/
    table/          — golden-snapshot reference output for the Table renderer
    journey/        — golden-snapshot reference output for the Journey renderer
```

---

## 1. Mock-figma fixtures (`figma-mock/`)

### Purpose

`plugins/welder-editor/code/` runs in Figma's plugin sandbox and has no DOM, but
it does have the global `figma` object. vitest runs in Node; there is no `figma`
global unless we install one. The fixtures in `figma-mock/` provide a lightweight
structural mock that covers the subset of `figma.*` called by `code/main.ts` and
the wrapper detectors.

### What to mock

Cover every `figma.*` surface called by the production code. At Sprint 1 that is:

| Call | Mock behavior |
|---|---|
| `figma.currentPage.selection` | Settable array of `SceneNode`-shaped objects |
| `figma.currentPage.findAll(predicate)` | Filter over a pre-loaded node array |
| `figma.getNodeByIdAsync(id)` | Async lookup in a Map keyed by node id |
| `figma.ui.postMessage(msg)` | Capture calls for assertion in tests |
| `figma.on('selectionchange', cb)` | Register/fire a callback |
| `figma.on('close', cb)` | Register/fire a callback |
| `figma.closePlugin()` | Spy — no-op |
| `figma.commitUndo()` | Spy — no-op |
| `node.getPluginData(key)` | Returns value from an in-memory Map |
| `node.setPluginData(key, value)` | Writes to that Map |
| `node.setRelaunchData(data)` | Spy — captures last call |
| `figma.loadFontAsync(font)` | Resolves immediately (no-op) |
| INSTANCE detection: `node.type === 'INSTANCE'`, `node.name`, `node.width`, `node.height` | Plain object properties |

**Do not** mock `figma.importComponentByKeyAsync` with actual component data —
return a minimal INSTANCE stub; the shape is documented in `figma-mock/README.md`.

### File layout

```
figma-mock/
  README.md         (this context + usage example)
  index.ts          (the `createFigmaMock()` factory — Sprint 1 fills this)
  types.ts          (DeepPartial types so stubs typecheck without full SDK types)
```

### Usage pattern

```typescript
// plugins/welder-editor/tests/code/slide-machine.test.ts
import { createFigmaMock } from '../../../validation/fixtures/figma-mock';

const figma = createFigmaMock({
  page: {
    nodes: [
      { id: '1:1', type: 'INSTANCE', name: 'Slide', width: 1920, height: 1080 },
    ],
  },
});

// Inject global before importing the module under test.
globalThis.figma = figma as unknown as PluginAPI;
```

### What NOT to mock

`figma.variables.*` (library-variable resolution) is complex enough to warrant
its own fixture in `slide-machine/accent-vars.fixture.ts`. The table/journey
renderer tests do not call it at all (renderer inputs are pre-resolved models).

---

## 2. Slide-machine fixtures (`slide-machine/`)

### Purpose

Represent a fully-parsed Welder slide as a TypeScript fixture: a plain object
(or factory function) that a test passes directly to the scanner or renderer
rather than constructing a mock Figma document.

### Slide detection contract

A slide is detected by:
- `node.type === 'INSTANCE'`
- `node.name === 'Slide'`
- `node.width === 1920 && node.height === 1080`

It is NOT detected by library file ID. The detection is name-based so it works
against both the published library (`kAZqxj4nxpafYjB5FhfOru`) and the work copy
(`RgTXIrUpihBauydjMZbUGX`). Tests should assert this property explicitly.

### Wrapper variants

Each fixture should specify which wrappers are present. The full set:

| Wrapper | Detection field |
|---|---|
| `CopyWrap` | INSTANCE child with `name === 'CopyWrap'` |
| `Badge` | INSTANCE child with `name === 'Badge'` |
| `ImageWrap` | INSTANCE child with `name === 'ImageWrap'` |
| `CardWrap` | INSTANCE child with `name === 'CardWrap'` |
| `TimelineWrap` | INSTANCE child with `name === 'TimelineWrap'` |
| `JourneyWrap` | INSTANCE child with `name === 'JourneyWrap'` |
| `TableWrap` | INSTANCE child with `name === 'TableWrap'` |

`ChartWrap` is intentionally absent from v0.1.0 (ADR-0007).

### Fixture naming

`<scenario>.fixture.ts` — e.g.:
- `all-wrappers.fixture.ts` — slide with every wrapper present
- `graphs-only.fixture.ts` — slide with only TableWrap + JourneyWrap
- `copy-badge-only.fixture.ts` — General tab only
- `empty-slide.fixture.ts` — no wrappers (plugin should show empty state)

### File layout

```
slide-machine/
  README.md                       (this context)
  all-wrappers.fixture.ts         (Sprint 1 fills these)
  graphs-only.fixture.ts
  copy-badge-only.fixture.ts
  empty-slide.fixture.ts
```

### Usage pattern

```typescript
// plugins/welder-editor/tests/code/slide-machine.test.ts
import { allWrappersSlide } from '../../../validation/fixtures/slide-machine/all-wrappers.fixture';

it('detects TableWrap in a full slide', () => {
  const result = detectWrappers(allWrappersSlide);
  expect(result.tableWrap).toBeDefined();
});
```

---

## 3. Golden-snapshot conventions (`renderers/`)

### Purpose

R10 in the plan: the 642-LOC Table renderer and 1223-LOC Journey renderer must
produce byte-equivalent output to v0.2.1 on identical input fixtures. Sprint 4
writes these tests; this harness describes the format and storage convention.

### Format decision: JSON-serialized FRAME-tree snapshots

**Chosen format: JSON-serialized FRAME trees.**

Rationale:

- The renderers build Figma FRAME/TEXT/INSTANCE node trees via `figma.*` calls.
  The mock records every `appendChild`, `createFrame`, `createText`, and property
  assignment as a serializable tree.
- JSON-diffing is deterministic, human-readable, and amenable to `--update`
  workflows (compare: screenshot pixel-diffs are fragile on retina/non-retina
  differences and provide no indication of _what_ changed).
- AST-style comparison would require parsing the renderer source; the node-tree
  output is the canonical observable behavior.
- The JSON tree mirrors the Figma node hierarchy: `{ type, name, width, height,
  children, fills, strokes, textContent, layoutMode, ... }`. Only properties
  explicitly set by the renderer are recorded — undefined properties are omitted
  (no noise from Figma defaults).

**Pixel diffs are out of scope** for Sprint 4. They require headless Chromium and
are better suited for a separate visual-regression job added post-v0.1.0.

### Snapshot storage

```
renderers/
  table/
    README.md
    basic-3x4.snapshot.json        (Sprint 4 fills: 3 col, 4 row table)
    header-riff-2x3.snapshot.json  (T40 header-riff variant)
    csv-import-5x5.snapshot.json   (CSV import path)
  journey/
    README.md
    5-pills.snapshot.json          (Sprint 4 fills: 5 journey items)
    10-pills-dividers.snapshot.json (T46 dividers)
    column-header.snapshot.json    (column-header variant)
```

Snapshots are committed to the repo. They are generated once from the v0.2.1
renderer output and thereafter treated as the expected output. To regenerate:

```
pnpm --filter @figma-plugins/welder-editor test:update-snapshots
```

This script is defined in Sprint 4 (not yet in `package.json`).

### Test file naming convention

`<editor>.<scenario>.test.ts` inside `plugins/welder-editor/tests/code/`:

```
table.basic-3x4.test.ts
table.header-riff-2x3.test.ts
table.csv-import-5x5.test.ts
journey.5-pills.test.ts
journey.10-pills-dividers.test.ts
journey.column-header.test.ts
```

### How a renderer test works (Sprint 4 pattern)

```typescript
// plugins/welder-editor/tests/code/table.basic-3x4.test.ts
import { createFigmaMock, captureNodeTree } from '../../../validation/fixtures/figma-mock';
import { applyTable } from '../../code/editors/table/renderer';
import expectedTree from '../../../validation/fixtures/renderers/table/basic-3x4.snapshot.json';

it('table renderer: 3-col 4-row matches v0.2.1 snapshot', async () => {
  const mock = createFigmaMock({ ... });
  const slot = mock.createSlotNode({ width: 1280, height: 600 });
  const model = { cols: 3, rows: tableRows3x4, widthKey: 'md', textSizeKey: 'md' };

  await applyTable(slot, model);

  const actualTree = captureNodeTree(slot);
  expect(actualTree).toEqual(expectedTree);
});
```

`captureNodeTree` is a utility in `figma-mock/index.ts` that serializes the mock
node tree to a plain JSON object.

### Generating the v0.2.1 baseline (Sprint 4 prerequisite)

Before Sprint 4 writes renderer tests, `figma-api-engineer` runs a one-off script
against the external build (`welder-slide-editor/widget-src/`) with the same mock
harness to produce the reference snapshots. These go in `renderers/{table,journey}/`
as committed `.snapshot.json` files. From that point forward, any change to the
renderer that produces a different tree is a failing test — intentional changes
require regenerating and re-reviewing the snapshots.

---

## 4. Test placement summary

| Test type | Location | vitest environment |
|---|---|---|
| Code-side (slide scanner, wrapper detectors, persistence) | `plugins/welder-editor/tests/code/*.test.ts` | `node` (per vitest.config.ts `environmentMatchGlobs`) |
| Renderer golden-snapshot (table, journey) | `plugins/welder-editor/tests/code/<editor>.<scenario>.test.ts` | `node` |
| UI component tests (@testing-library/vue) | `plugins/welder-editor/tests/ui/*.test.ts` | `jsdom` |
| Axe accessibility scan | `plugins/welder-editor/tests/ui/axe.test.ts` | `jsdom` |

Shared fixtures are imported from `validation/fixtures/` using the path alias
`../../../validation/fixtures/` (relative) or via a root-level `tsconfig.base.json`
path alias `@fixtures` if `figma-api-engineer` adds one in Sprint 1.

---

## 5. Coverage thresholds

Initial threshold set for Sprint 1 (proposed, subject to review):

| Metric | Threshold | Ratchet schedule |
|---|---|---|
| Statements | 60% | +10 pp per sprint until 80%; hold at 80% |
| Branches | 50% | +10 pp per sprint until 70%; hold at 70% |
| Functions | 60% | +10 pp per sprint until 80%; hold at 80% |
| Lines | 60% | +10 pp per sprint until 80%; hold at 80% |

**Rationale for starting conservative:** Sprint 1 ports the scaffold and wires
the figma-api wrappers. The renderers (Sprint 4) account for ~40% of total code
lines. Demanding 80% statements from Sprint 1 would force premature coverage of
code that doesn't exist yet. The ratchet enforces forward progress without
front-loading the test burden.

**Ratchet mechanics:** increase the vitest coverage thresholds in
`plugins/welder-editor/vitest.config.ts` at the start of each sprint's
planning session. The increase is a sprint-exit criterion — `plugin-tester`
reviews the coverage report before signing off.

To enable coverage gating, add to `plugins/welder-editor/vitest.config.ts`:

```typescript
coverage: {
  thresholds: {
    statements: 60,
    branches: 50,
    functions: 60,
    lines: 60,
  },
},
```

This is not yet added — Sprint 1 adds it when there is real code to measure.
