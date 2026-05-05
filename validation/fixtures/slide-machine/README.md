# slide-machine — typed fixtures for Welder slide structures

Owner: `plugin-tester` (conventions) / `figma-api-engineer` (fixture authoring)

This directory holds TypeScript fixture files that represent parsed Welder slides
as plain objects. Tests import these directly rather than constructing a mock Figma
document node-by-node.

See `validation/fixtures/README.md` §2 for the full contract.

---

## Status

Sprint 0: directory and conventions created.
Sprint 1: `figma-api-engineer` authors the fixture files listed below.

## Detection contract (tests must assert this)

A slide is detected by name + dimension, not by library file ID:
- `node.type === 'INSTANCE'`
- `node.name === 'Slide'`
- `node.width === 1920 && node.height === 1080`

This makes detection revision-independent: it works against both
- Published library: `kAZqxj4nxpafYjB5FhfOru` (Slide Machine — production)
- Work copy: `RgTXIrUpihBauydjMZbUGX` (Templates-Welder — design reference)

## Files to create in Sprint 1

| File | Wrappers present | Purpose |
|---|---|---|
| `all-wrappers.fixture.ts` | CopyWrap, Badge, ImageWrap, CardWrap, TimelineWrap, JourneyWrap, TableWrap | Happy-path full scan |
| `graphs-only.fixture.ts` | JourneyWrap, TableWrap | Graphs-tab isolation |
| `copy-badge-only.fixture.ts` | CopyWrap, Badge | General-tab isolation |
| `empty-slide.fixture.ts` | (none) | Empty-state / hide-tab behavior |

`ChartWrap` is intentionally absent from all fixtures (ADR-0007: charts deferred).

## Fixture shape

Each `.fixture.ts` exports a named constant of type `FigmaNodeStub` (from
`validation/fixtures/figma-mock/types.ts`). Example skeleton:

```typescript
// all-wrappers.fixture.ts
import type { FigmaNodeStub } from '../figma-mock/types';

export const allWrappersSlide: FigmaNodeStub = {
  id: 'fixture:slide-all',
  type: 'INSTANCE',
  name: 'Slide',
  width: 1920,
  height: 1080,
  children: [
    { id: 'fixture:copy-wrap', type: 'INSTANCE', name: 'CopyWrap', children: [] },
    { id: 'fixture:badge',     type: 'INSTANCE', name: 'Badge',    children: [] },
    // ... etc
  ],
};
```

Wrapper children carry enough structure for the detector to find them but do not
need to replicate the full library-component internal hierarchy — that detail
belongs in renderer test fixtures.
