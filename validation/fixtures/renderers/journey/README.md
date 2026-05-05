# renderers/journey — golden-snapshot reference for the Journey renderer

Owner: `plugin-tester` (harness, conventions) / `figma-api-engineer` (snapshots, tests)

This directory holds the committed JSON golden-snapshot files that Sprint 4 renderer
tests compare against. Each `.snapshot.json` is the serialized FRAME/INSTANCE tree
produced by the v0.2.1 Journey renderer on a known input.

See `validation/fixtures/README.md` §3 for the full golden-snapshot convention,
format rationale, and how to regenerate.

---

## Status

Sprint 0: directory and conventions created.
Sprint 4: `figma-api-engineer` generates snapshots and writes tests.

## Source renderer

External build path: `welder-slide-editor/widget-src/editors/journey/renderer.ts` (1223 LOC)
Rebuilt path (Sprint 4): `plugins/welder-editor/code/editors/journey/renderer.ts`

## Bootstrap note (JourneyItem key)

The Journey renderer calls `figma.importComponentByKeyAsync(JOURNEYITEM_KEY_FALLBACK)`.
Sprint 4 seeds `JOURNEYITEM_KEY_FALLBACK` from a known canvas instance. Until then,
the mock should provide a stub INSTANCE for any `importComponentByKeyAsync` call —
see `validation/fixtures/figma-mock/README.md` for how to configure the stub.

## Planned snapshot files

| File | Input | Notes |
|---|---|---|
| `5-pills.snapshot.json` | 5 journey items, default column layout | Baseline happy path |
| `10-pills-dividers.snapshot.json` | 10 items with T46 dividers active | Divider-rendering variant |
| `column-header.snapshot.json` | Column-header labels present | Header variant |

Snapshot files are absent in Sprint 0. Any test that attempts to import a missing
snapshot file will fail with a `MODULE_NOT_FOUND` error — this is intentional and
expected until Sprint 4 generates them.

## Test file naming (in `plugins/welder-editor/tests/code/`)

- `journey.5-pills.test.ts`
- `journey.10-pills-dividers.test.ts`
- `journey.column-header.test.ts`

## Regenerating snapshots

Run (Sprint 4 only — script added to package.json at Sprint 4 kickoff):

```
pnpm --filter @figma-plugins/welder-editor test:update-snapshots
```

Review the diff before committing. A snapshot diff that wasn't caused by an
intentional renderer change is a regression — file a bug before merging.

## Absolute-position layout specifics

The Journey renderer positions pill instances via absolute x/y (layoutMode = NONE):

```
x = (startCol - 1) / totalCols * contentWidth + JOURNEY_CONTAINER_PADDING
y = JOURNEY_CONTAINER_PADDING + i * (PILL_HEIGHT + PILL_GAP)
pillWidth = (endCol - startCol + 1) / totalCols * contentWidth
```

The snapshot must capture these computed coordinates exactly. The mock's
`captureNodeTree` records `x`, `y`, `width`, `height` as set by the renderer —
any floating-point rounding differences between Node (vitest) and Figma's runtime
must be resolved in the renderer before Sprint 4 snapshots are committed.
