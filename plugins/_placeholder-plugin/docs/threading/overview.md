# Threading overview — \_placeholder-plugin

**Status:** Pointer (onboarding placeholder)
**Date:** 2026-05-06
**Owner:** figma-api-engineer

This file documents the shape of the message bus between `widget-src/code.ts` (Figma sandbox) and `widget-src/ui/` (Vue 3 iframe) at the time of import (v0.2.1). The canonical schema lives in [`../../widget-src/types.ts`](../../widget-src/types.ts) — it is the de-facto contract — because of the layout deviation noted in the import ADR. There is **no `shared/messages.ts`** yet; it will be authored as part of `T_REFACTOR_LAYOUT`.

For full behavioural detail, see the imported product spec at [`../../spec.md`](../../spec.md) §5 ("Communicatie & berichtenstroom").

## Two-thread model

Per `CLAUDE.md` §"Plugin-thread rules (non-negotiable)", the plugin runtime has exactly two threads with strict separation:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  Figma desktop / web                                                         │
│                                                                              │
│  ┌───────────────────────────────────┐    postMessage     ┌───────────────┐ │
│  │  widget-src/code.ts  (sandbox)    │ ─────────────────▶ │ widget-src/ui │ │
│  │                                   │                    │   (iframe)    │ │
│  │  figma.*  ✓                       │ ◀───────────────── │               │ │
│  │  DOM      ✗                       │    postMessage     │ Vue 3         │ │
│  │  fetch    ✗ (allowedDomains:none) │                    │ Nuxt UI v4    │ │
│  │  window   ✗                       │                    │               │ │
│  │                                   │                    │ figma.*  ✗    │ │
│  │  slide-machine.ts (detectors)     │                    │ DOM      ✓    │ │
│  │  editors/{general,content,chart,  │                    │ fetch    ✓    │ │
│  │   table,journey,shared,_shared}/  │                    │               │ │
│  │  chart-core/csv/                  │                    │ components/   │ │
│  │                                   │                    │ composables/  │ │
│  └───────────────────────────────────┘                    └───────────────┘ │
│                                                                              │
│       widget-src/types.ts — the contract (owned by figma-api-engineer)      │
└──────────────────────────────────────────────────────────────────────────────┘
```

The chunked-text-loader pattern (see `../perf/budget.md` and the import ADR) means `dist/code.js` carries both the code-side logic AND the entire iframe HTML inlined as ~60 KB string chunks. This does not change the threading model — Figma still loads the iframe in a separate sandboxed context — but it does mean the `dist/ui.html` artifact is a build-intermediate, not the loaded-by-Figma artifact.

## Message types (v0.2.1)

The discriminated unions are defined in `widget-src/types.ts`. Summary lifted from `spec.md` §5:

### UI → plugin (sandbox)

| Type             | Payload                              | Purpose                                                                 |
| ---------------- | ------------------------------------ | ----------------------------------------------------------------------- |
| `ui-ready`       | `{}`                                 | Iframe boot complete; sandbox should send `init`                        |
| `pick-slide`     | `{ slideId: string }`                | User selected a slide in the picker; sandbox should load it             |
| `update-general` | varies (see `types.ts`)              | Edit to TitleDescription / Badge / Image — applied to the current slide |
| `update-card`    | `{ cardNodeId, ... }`                | Edit to a Card item inside CardWrap                                     |
| `update-graph`   | `{ instanceId, model }`              | Edit to a Graph instance (Chart / Table / Journey / Timeline)           |
| `upload-image`   | `{ imageWrapId, bytes: Uint8Array }` | Image bytes from a file input; sandbox writes the fill                  |
| `close`          | `{}`                                 | User dismissed the plugin; sandbox calls `figma.closePlugin()`          |

### Plugin (sandbox) → UI

| Type             | Payload                             | Purpose                                                                |
| ---------------- | ----------------------------------- | ---------------------------------------------------------------------- |
| `init`           | `{ slides[], initialSlideId, ... }` | Plugin opened; iframe renders slide picker                             |
| `slide-loaded`   | `{ general, content, graphs }`      | Response to `pick-slide` — section state for the chosen slide          |
| `target-updated` | varies                              | Response to `update-*` / `upload-image` — confirms the canvas mutation |
| `page-changed`   | `{ slides[] }`                      | User navigated to a different page; iframe refreshes the picker        |

`spec.md` §5 has the full per-type payload table and reference flow walkthroughs. The on-disk source of truth is `widget-src/types.ts` — match the implementation, not the spec, when they disagree.

## Latency budgets

Carried over from the prior perf investigation (`../../.reviews/perf-investigation-2026-04-26.md`) and `spec.md` §6. These are pre-monorepo numbers and should be re-validated in the canonical `e2e-gauntlet.md` pass before the next release.

| Operation                                       | Budget   |
| ----------------------------------------------- | -------- |
| Plugin open → first paint (iframe `init` shown) | ≤ 200 ms |
| `pick-slide` → `slide-loaded`                   | ≤ 500 ms |
| `update-*` → `target-updated` (single field)    | ≤ 500 ms |
| `upload-image` bytes → `target-updated`         | ≤ 1 s    |

## Error taxonomy

Inherited from the external scaffold; not yet aligned with `welder-editor`'s `WelderError` discriminated union. The current `widget-src/code.ts` reports failures as `target-updated` payloads carrying an error string; failure modes are not categorized into the canonical `NOT_FOUND` / `INVALID_INPUT` / `LIBRARY_VAR_MISSING` / `NODE_TYPE_MISMATCH` / `MUTATION_FAILED` / `TIMEOUT` codes that `welder-editor` uses.

Aligning the error taxonomy is a `T_REFACTOR_LAYOUT` follow-up — the `shared/messages.ts` extraction is the natural place to introduce typed errors with `Result<T, WelderError>` envelopes.

## Pointers

- Discriminated unions: [`../../widget-src/types.ts`](../../widget-src/types.ts)
- Constants (variable keys, library IDs): [`../../widget-src/constants.ts`](../../widget-src/constants.ts)
- Wrapper detection: [`../../widget-src/slide-machine.ts`](../../widget-src/slide-machine.ts)
- Spec §5 (message flow): [`../../spec.md`](../../spec.md)
- Import ADR (layout deviation): top-level `docs/adr/`
- Reference threading model in canonical-layout sibling plugin: `plugins/welder-editor/docs/threading/welder-editor.md`
