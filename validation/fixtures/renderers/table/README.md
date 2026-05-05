# renderers/table — golden-snapshot reference for the Table renderer

Owner: `plugin-tester` (harness, conventions) / `figma-api-engineer` (snapshots, tests)

This directory holds the committed JSON golden-snapshot files that Sprint 4 renderer
tests compare against. Each `.snapshot.json` is the serialized FRAME tree produced
by the v0.2.1 Table renderer on a known input.

See `validation/fixtures/README.md` §3 for the full golden-snapshot convention,
format rationale, and how to regenerate.

---

## Status

Sprint 0: directory and conventions created.
Sprint 4: `figma-api-engineer` generates snapshots and writes tests.

## Source renderer

External build path: `welder-slide-editor/widget-src/editors/table/renderer.ts` (642 LOC)
Rebuilt path (Sprint 4): `plugins/welder-editor/code/editors/table/renderer.ts`

## Planned snapshot files

| File | Input | Notes |
|---|---|---|
| `basic-3x4.snapshot.json` | 3 cols, 4 rows, widthKey `md`, textSizeKey `md` | Baseline happy path |
| `header-riff-2x3.snapshot.json` | 2 cols, 3 rows, T40 header-riff active | Header styling variant |
| `csv-import-5x5.snapshot.json` | 5 cols, 5 rows via CSV import path | CSV boundary validation |

Snapshot files are absent in Sprint 0. Any test that attempts to import a missing
snapshot file will fail with a `MODULE_NOT_FOUND` error — this is intentional and
expected until Sprint 4 generates them.

## Test file naming (in `plugins/welder-editor/tests/code/`)

- `table.basic-3x4.test.ts`
- `table.header-riff-2x3.test.ts`
- `table.csv-import-5x5.test.ts`

## Regenerating snapshots

Run (Sprint 4 only — script added to package.json at Sprint 4 kickoff):

```
pnpm --filter @figma-plugins/welder-editor test:update-snapshots
```

Review the diff before committing. A snapshot diff that wasn't caused by an
intentional renderer change is a regression — file a bug before merging.
