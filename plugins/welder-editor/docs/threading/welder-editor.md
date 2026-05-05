# Threading model — welder-editor v0.1.0

**Status:** Accepted (Sprint 0)
**Date:** 2026-05-05
**Author:** figma-api-engineer
**Authoritative Plugin API reference:** https://developers.figma.com/docs/plugins/

---

## Two-thread model

Per `CLAUDE.md` §"Plugin-thread rules (non-negotiable)", the plugin runtime has exactly two threads with strict separation:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  Figma desktop / web                                                            │
│                                                                                 │
│  ┌───────────────────────────────────┐     postMessage      ┌────────────────┐ │
│  │  code/ (Figma sandbox)            │ ──────────────────▶  │ ui/ (iframe)   │ │
│  │                                   │                       │                │ │
│  │  figma.*  ✓                       │ ◀──────────────────   │ Vue 3          │ │
│  │  DOM      ✗                       │     postMessage       │ Nuxt UI v4     │ │
│  │  fetch    ✗ (allowedDomains:none) │                       │                │ │
│  │  window   ✗                       │                       │ figma.*  ✗     │ │
│  │                                   │                       │ DOM      ✓     │ │
│  │  canvas-of-truth:                 │                       │ fetch    ✓     │ │
│  │   PluginData per wrapper node     │                       │ localStorage ✗ │ │
│  │                                   │                       │                │ │
│  │  slide-machine.ts                 │                       │ sections/      │ │
│  │  code/wrappers/                   │                       │ components/    │ │
│  │  code/editors/{general,           │                       │                │ │
│  │    content,table,journey}/        │                       │ state owned    │ │
│  │  code/persistence.ts              │                       │ by message bus │ │
│  └───────────────────────────────────┘                       └────────────────┘ │
│                                                                                 │
│         shared/messages.ts — the contract (owned by figma-api-engineer)        │
└─────────────────────────────────────────────────────────────────────────────────┘
```

The message bus (`shared/messages.ts`) is the only sanctioned crossing point. Direct `figma.*` imports in `ui/` are a blocking review violation. Direct DOM access in `code/` does not exist (the sandbox has no DOM).

---

## Message flow diagram

```
code/main.ts                              shared/messages.ts            ui/ (Vue)
     │                                         │                            │
     │  plugin opens                            │                            │
     │──[init]────────────────────────────────▶│──────────────────────────▶│ SlidePicker renders
     │  {slides[], initialSlideId, editorType} │                            │
     │                                         │                            │
     │◀────────────────[slide-list:request]────│◀──────────────────────────│ (debounce 200ms on selectionchange)
     │  {}                                     │                            │
     │──[slide-list:result]──────────────────▶│──────────────────────────▶│ SlidePicker updates
     │  {slides[]}              correlationId  │                            │
     │                                         │                            │
     │◀────────────────[slide-load:request]────│◀──────────────────────────│ user picks slide
     │  {slideId}               correlationId  │                            │
     │  scan wrappers                          │                            │
     │  load persistence                       │                            │
     │──[slide-load:result]──────────────────▶│──────────────────────────▶│ General+Content+Graphs render
     │  {general,content,graphs} correlationId │                            │
     │                                         │                            │
     │  (selectionchange event fires)           │                            │
     │──[selection-changed]──────────────────▶│──────────────────────────▶│ ui triggers slide-load:request
     │  {}  (fire-and-forget)                  │                            │
     │                                         │                            │
     │◀────────────────[apply-title-description│◀──────────────────────────│ user edits heading (debounced 200ms)
     │  {copyWrapId, heading, paragraph}        │                            │
     │  setTextCharactersSafe                  │                            │
     │──[apply-title-description:result]──────▶│──────────────────────────▶│ toast on error, silent on ok
     │  Result<ok, err>         correlationId  │                            │
     │                                         │                            │
     │◀────────────────[apply-badge]───────────│◀──────────────────────────│ user edits badge label or icon
     │  {badgeNodeId, label?, icon?}            │                            │
     │  setTextCharactersSafe + setProperties  │                            │
     │──[apply-badge:result]─────────────────▶│──────────────────────────▶│
     │                          correlationId  │                            │
     │                                         │                            │
     │◀────────────────[apply-image]───────────│◀──────────────────────────│ user uploads image
     │  {imageWrapId, bytes: Uint8Array}        │                            │
     │  figma.createImage + fills write        │                            │
     │──[apply-image:result]─────────────────▶│──────────────────────────▶│
     │                          correlationId  │                            │
     │                                         │                            │
     │  (image preview flow — separate)         │                            │
     │◀────────────────[image-upload:request]──│◀──────────────────────────│
     │  {imageWrapId}           correlationId  │                            │
     │  getImageByHash + bytes                 │                            │
     │──[image-upload:result]────────────────▶│──────────────────────────▶│ preview renders
     │  {bytes, fillW, fillH}   correlationId  │                            │
     │                                         │                            │
     │◀────────────────[apply-card]────────────│◀──────────────────────────│ user edits card (debounced 200ms)
     │  {cardNodeId, ...patches}correlationId  │                            │
     │──[apply-card:result]──────────────────▶│──────────────────────────▶│
     │                                         │                            │
     │◀────────────────[apply-timeline]────────│◀──────────────────────────│ user edits timeline item
     │  {copyWrapNodeId, ...}   correlationId  │                            │
     │──[apply-timeline:result]──────────────▶│──────────────────────────▶│
     │                                         │                            │
     │◀────────────────[apply-table]───────────│◀──────────────────────────│ user edits table (full-state PUT)
     │  {slotId, desired: TableWrapModel}       │                            │
     │  table renderer (atomic)                │                            │
     │──[apply-table:result]─────────────────▶│──────────────────────────▶│
     │  + [progress] (multi-batch)  correlId   │                            │
     │                                         │                            │
     │◀────────────────[apply-journey]─────────│◀──────────────────────────│ user edits journey (full-state PUT)
     │  {slotId, desired: JourneyWrapModel}     │                            │
     │  journey renderer (atomic)              │                            │
     │──[apply-journey:result]───────────────▶│──────────────────────────▶│
     │                                         │                            │
     │  (page changed in Figma)                │                            │
     │──[page-changed]───────────────────────▶│──────────────────────────▶│ SlidePicker re-renders
     │  {slides[]}  (fire-and-forget)          │                            │
     │                                         │                            │
     │◀────────────────[close]─────────────────│◀──────────────────────────│ user clicks close
     │  figma.closePlugin()                    │                            │
```

**Message categories:**

- **Request-response (correlationId required):** `slide-list:request/result`, `slide-load:request/result`, `apply-*:result`, `image-upload:request/result`, `persisted-state:get/result`, `persisted-state:set/result`
- **Fire-and-forget (code → ui):** `init`, `selection-changed`, `page-changed`, `progress`, `error`
- **Fire-and-forget (ui → code):** `close`

The router in `packages/figma-api/src/router.ts` maintains a `Map<correlationId, handler>` for in-flight request-response operations. Late results without a registered correlation are logged and dropped.

---

## State map

| State                                        | Canonical owner                         | Reactivity model                                   | Lifetime                                | Sync strategy                                              |
| -------------------------------------------- | --------------------------------------- | -------------------------------------------------- | --------------------------------------- | ---------------------------------------------------------- | --------------------------------------- |
| Slide list (`SlideSummary[]`)                | `code/` scans `figma.currentPage`       | Recomputed on request or `currentpagechange` event | Per-session; invalidated on page change | `slide-list:result` message → ui ref                       |
| Current slide ID                             | `ui/` (user selection)                  | Vue ref                                            | Per-session                             | No sync needed — ui sends `slide-load:request` on change   |
| Active tab (`general`/`content`/`graphs`)    | `ui/`                                   | Vue ref                                            | Per-session                             | No sync needed — ui-only state                             |
| General sections (`GeneralSections           | null`)                                  | `code/` reads canvas nodes                         | Recomputed on `slide-load:request`      | Per slide-load                                             | `slide-load:result` → ui reactive state |
| Content items (`ContentItems                 | null`)                                  | `code/` reads canvas nodes                         | Recomputed on `slide-load:request`      | Per slide-load                                             | `slide-load:result` → ui reactive state |
| Graph items (`GraphItems                     | null`)                                  | `code/` reads canvas nodes                         | Recomputed on `slide-load:request`      | Per slide-load                                             | `slide-load:result` → ui reactive state |
| Wrapper persisted model                      | `figma.setPluginData` on wrapper node   | Written on every successful `apply-*`              | Per-file (Figma document)               | Explicit round-trip: read on slide-load, write on apply    |
| Relaunch data                                | `figma.setRelaunchData` on wrapper node | Written after every successful `apply-*`           | Per-file                                | One-way write from `code/`                                 |
| Image preview bytes                          | transient, `code/` side only            | Computed on `image-upload:request`                 | Per request                             | `image-upload:result` → ui local state, not stored         |
| User preferences (icon picker history, etc.) | `figma.clientStorage`                   | Async read at plugin init                          | Per-user, cross-file                    | `persisted-state:get/result`, `persisted-state:set/result` |

**Canvas-of-truth invariant:** The Figma canvas nodes (and their `pluginData`) are the canonical data store. The ui holds a mirror of what the code side last reported. The ui does NOT maintain a parallel writable store that diverges from what is on canvas. Edits flow: ui input → debounced `apply-*` message → code mutates canvas → `apply-*:result` → ui updates mirror. There is no optimistic update without confirmation.

---

## Latency budgets

| Operation                                                       | Budget       | Notes                                                                                      |
| --------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------ |
| Plugin open → first paint (`init` → ui renders slide list)      | ≤ 200 ms     | Font pre-warm and variable import run in parallel at init; they must not block first paint |
| `selectionchange` → `slide-load:request` sent                   | ≤ 200 ms     | Debounce in ui before triggering load                                                      |
| `slide-load:request` → `slide-load:result` received             | ≤ 500 ms     | Covers `findSlidesOnPage` + wrapper detection + pluginData read + variable resolution      |
| Atomic text edit (`apply-title-description`) → `apply-*:result` | ≤ 100 ms p95 | One `setTextCharactersSafe` call (font load cached)                                        |
| Table render (`apply-table`) — small (4×4)                      | ≤ 500 ms     | 16 cells + frame operations                                                                |
| Table render (`apply-table`) — large (10×6)                     | ≤ 2 s        | 60 cells; send `progress` messages at row boundaries                                       |
| Journey render (`apply-journey`) — 10 items                     | ≤ 500 ms     | ~30 frame/text operations                                                                  |
| Image upload → `apply-image:result`                             | ≤ 1 s        | `figma.createImage(bytes)` + fill write                                                    |
| Image preview → `image-upload:result` bytes                     | ≤ 200 ms     | `figma.getImageByHash` + byte transfer                                                     |

**Large-doc threshold:** Pages with > 5000 nodes. On such pages, `figma.currentPage.findAll(isSlide)` may exceed 100 ms. The code side must set `figma.skipInvisibleInstanceChildren = true` before the scan (Sprint 1) and report progress if the result takes > 200 ms. The ui shows a "Scanning..." state until `slide-list:result` arrives.

---

## Error taxonomy

Every `apply-*:result` message carries a `Result<T, WelderError>` envelope where `WelderError` is:

```ts
type WelderErrorCode =
  | 'NOT_FOUND' // node no longer exists on canvas (deleted while plugin was open)
  | 'INVALID_INPUT' // payload failed Zod validation at code-side boundary
  | 'LIBRARY_VAR_MISSING' // importVariableByKeyAsync failed (free plan, library unlinked)
  | 'NODE_TYPE_MISMATCH' // found node is not the expected type (e.g., TEXT expected, FRAME found)
  | 'MUTATION_FAILED' // figma.* call threw unexpectedly (read-only file, collaborative conflict)
  | 'TIMEOUT'; // withTimeout guard expired (Sprint 1 primitive)
```

Error categories:

| Category         | Examples                                                                | ui response                                                                       |
| ---------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| User-correctable | `INVALID_INPUT` (empty required field), `NOT_FOUND` (deleted node)      | Inline validation error or toast with actionable copy                             |
| Plugin-internal  | `INVALID_INPUT` from code-side Zod (schema mismatch after VERSION bump) | Toast + console.error; user should not see this in normal operation               |
| Figma-side       | `MUTATION_FAILED` (read-only community file), `LIBRARY_VAR_MISSING`     | Toast with explanation; degrade gracefully (apply text without variable binding)  |
| Unexpected       | Any thrown error caught by the top-level handler in `code/main.ts`      | `error` fire-and-forget message to ui; toast "Something went wrong; please retry" |

The top-level handler in `code/main.ts` catches all unhandled exceptions and sends:

```ts
figma.ui.postMessage({
  type: 'error',
  version: MESSAGE_BUS_VERSION,
  payload: { message: err.message, code: 'UNEXPECTED' },
});
```

It does NOT call `figma.closePlugin()` — the user should be able to retry without reopening the plugin.

---

## Reference flow walkthroughs

### Flow A — Plugin opens → init → slide list → first paint

1. Figma executes `code/main.ts`
2. `figma.showUI(__html__, { width: 520, height: 760, themeColors: true })` — iframe mounts
3. In parallel: `loadFontAsync` for all required fonts, `loadAccentVars()` (variable import)
4. `findSlidesOnPage()` on `figma.currentPage` — synchronous scan
5. `slideSummary(slide, i)` for each found slide — builds `SlideSummary[]`
6. `figma.ui.postMessage({ type: 'init', ... })` with slides + `initialSlideId` (from current selection, if any)
7. ui receives `init` → Vue renders `SlidePicker` with slide list
8. **First paint target: ≤ 200 ms from plugin open**
9. If `initialSlideId` is non-null, ui auto-sends `slide-load:request` for that slide

### Flow B — User picks slide → sections render

1. User selects a slide in `SlidePicker` dropdown (or canvas selection changes and ui detects it)
2. ui sends `slide-load:request { slideId, correlationId: uuid() }`
3. `code/main.ts` receives via router, dispatches to `handleSlideLoad`
4. `figma.getNodeByIdAsync(slideId)` — verify node exists and is still a valid slide
5. `findCopyWrap`, `findBadge`, `findImageWrap`, `findCardWrap`, `findTimelineWrap`, `findTableWrap`, `findJourneyWrap` — all synchronous
6. For each found wrapper: read pluginData (`kind`, `v`, `model`), apply T34.4 migration if needed
7. Build `GeneralSections | null`, `ContentItems | null`, `GraphItems | null`
8. `figma.viewport.scrollAndZoomIntoView([slideNode])`
9. `figma.ui.postMessage({ type: 'slide-load:result', ..., correlationId })`
10. ui receives result → Vue renders General / Content / Graphs sections; absent wrappers hide their sub-section

### Flow C — User edits title → debounced apply → canvas mutated

1. User types in heading `<UInput>` inside `TitleDescriptionEditor`
2. ui debounces 200 ms, then sends `apply-title-description { copyWrapId, heading, paragraph?, correlationId }`
3. Zod validates payload at code-side boundary; rejects with `INVALID_INPUT` if malformed
4. `figma.getNodeByIdAsync(copyWrapId)` — verify node exists
5. `findOne` for Heading TEXT node within CopyWrap
6. `setTextCharactersSafe(headingNode, heading)` — loads all fonts, writes characters
7. If paragraph is provided: same pattern for Paragraph TEXT node
8. `node.setPluginData('kind', 'welder-copywrap')`, `setPluginData('v', '1')`, `setPluginData('model', ...)`
9. `node.setRelaunchData({ open: 'Edit with Slide Editor' })`
10. `figma.ui.postMessage({ type: 'apply-title-description:result', payload: { ok: true, ... }, correlationId })`
11. ui receives result: if `ok: true`, silent (state is already optimistic in the input); if `ok: false`, show toast

### Flow D — User uploads image → apply image → canvas updated

1. User selects file in `ImageEditor` file input
2. ui reads bytes from `FileReader` as `Uint8Array`
3. ui sends `apply-image { imageWrapId, bytes }` (NOT `image-upload:request` — that is for reading existing image bytes)
4. `figma.getNodeByIdAsync(imageWrapId)` — verify node
5. `findImageSlot(imageWrapNode)` — find the child node with `ImagePaint` fill
6. `const img = figma.createImage(bytes)` — register image in Figma's asset store
7. `slotNode.fills = [{ type: 'IMAGE', imageHash: img.hash, scaleMode: 'FILL' }]`
8. `setPluginData` + `setRelaunchData` on imageWrapNode
9. `figma.ui.postMessage({ type: 'apply-image:result', ..., correlationId })`

The separate `image-upload:request` flow (reading existing image bytes for preview) is the reverse: ui requests the current fill bytes, code calls `figma.getImageByHash(fill.imageHash)` and posts the bytes back.

---

## Init pre-warm strategy

The following async calls are fired in parallel at plugin init (before waiting for `slide-list:request`):

```ts
// code/main.ts initialization block
const [fonts, accentVars] = await Promise.all([
  preloadRequiredFonts(), // figma.loadFontAsync for all REQUIRED_FONTS
  loadAccentVars(), // figma.variables.importVariableByKeyAsync(TEXT_KEY, TEXT_DIMMER_KEY)
]);
```

`preloadRequiredFonts` covers Inter (Regular, Medium, SemiBold) and Instrument Sans (SemiBold) — the fonts used by table and journey renderers for cell text. Pre-warming means that when `apply-table` or `apply-journey` arrives, the font cache is already hot and the per-cell `loadFontAsync` call resolves in microseconds rather than 50–100 ms.

Variable import is pre-warmed to avoid a 50–100 ms blocking call on the first table/journey render that needs library variable binding.

Neither pre-warm operation blocks first paint — the `init` message is sent immediately after `findSlidesOnPage()` completes (synchronous), before the awaited pre-warms resolve.

---

## Correlation-ID dispatch

All request-response messages carry a `correlationId: string` (UUID-v4 generated in the ui). The router in `packages/figma-api/src/router.ts` maintains a `Map<correlationId, handler>` for in-flight operations. When `code/main.ts` posts a `*:result` or `*:progress` message, it includes the same `correlationId`. The ui matches it back to the waiting handler.

Late results (the node was deleted while the request was in-flight and a second request for the same wrapper arrived) are matched by correlationId, not by message type. This prevents result collisions when the user edits rapidly.

Fire-and-forget messages (`init`, `selection-changed`, `page-changed`, `progress`, `error`, `close`) do not carry a `correlationId`. The router does not wait for a response on these.
