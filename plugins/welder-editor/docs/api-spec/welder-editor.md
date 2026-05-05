# API-spec brief — welder-editor v0.1.0

**Status:** Accepted (Sprint 0)
**Date:** 2026-05-05
**Author:** figma-api-engineer
**Source build:** `welder-slide-editor` v0.2.1 (`/Users/lars/Documents/Claude/Figma_plugin/plugins/welder-slide-editor/`)
**Authoritative Plugin API reference:** https://developers.figma.com/docs/plugins/

---

## Purpose statement

`welder-editor` is a Figma plugin that lets users edit existing Welder-branded slides on the current page. A user picks a slide from a header dropdown, then edits its content across three tabs (General / Content / Graphs). The plugin mutates the content of pre-existing Slide Machine library instances — it does not create, reorder, or structurally modify slides.

The plugin targets **Figma design and Figma Slides** editor types (see ADR-0002). FigJam cannot host Slide Machine instances and is explicitly excluded.

**Non-goals for v0.1.0** (from `spec.md` §2):

- No slide creation — slides are instantiated from the Slide Machine library (`kAZqxj4nxpafYjB5FhfOru`).
- No layout-level creation — CopyWrap / Badge / ImageWrap / CardWrap / TableWrap / JourneyWrap are not created by the plugin.
- No add/remove of cards inside CardWrap.
- No add/remove of badges, images, or table/journey instances.
- No cross-page slide navigation — only `figma.currentPage` is scanned.
- No undo/redo management beyond Figma's native undo (see ADR-0004).
- No real-time multi-user editing or conflict resolution.
- No chart editing — ChartWrap is intentionally absent in v0.1.0 (see ADR-0007).
- No drag-reorder of content within a slide.
- No accent-range (Text Dimmer word-by-word dim) editing — deferred to backlog (ADR-0008).

---

## Editor type scope

`"editorType": ["figma", "slides"]`

FigJam is excluded by ADR-0002. The plugin is narrowed from the scaffold default of `["figma", "figjam", "slides"]`.

---

## Manifest constraints

```json
{
  "editorType": ["figma", "slides"],
  "documentAccess": "dynamic-page",
  "networkAccess": { "allowedDomains": ["none"] },
  "permissions": ["teamlibrary"],
  "relaunchButtons": [
    { "command": "open", "name": "Edit with Slide Editor" }
  ]
}
```

- `documentAccess: "dynamic-page"` — required for `figma.currentPage` access; allows future cross-page scanning without a manifest bump.
- `networkAccess: { "allowedDomains": ["none"] }` — all data is local. CSV parsing happens in the UI iframe, not via any network call.
- `permissions: ["teamlibrary"]` — required for `figma.variables.importVariableByKeyAsync` (library variable binding via the Slide Machine library).
- `relaunchButtons` — one button per wrapper node after save: `{ command: "open", name: "Edit with Slide Editor" }`. Applied via `setRelaunchData`.
- **UI sizing:** `{ width: 520, height: 760, themeColors: true }` (ported from `widget-src/code.ts` line 77 of the external build). `themeColors: true` adapts the iframe to Figma's light/dark theme.
- **Parameters:** none in v0.1.0. The relaunch button uses the `command: "open"` path. Parameters may be added in a future minor release.

---

## API surface inventory

### READ

| API | Purpose | Notes |
|---|---|---|
| `figma.currentPage` | Anchor for slide scanning and event listeners | Scope is current page only per spec §2 |
| `figma.currentPage.findAll(predicate)` | Scan page for Slide instances | `isSlide` predicate: `type === 'INSTANCE' && name === 'Slide' && width === 1920 && height === 1080`. O(n) over page — see Risk flags. |
| `figma.currentPage.selection` | Detect initial slide focus on plugin open | Used in `init` to pre-select the focused slide if one is in the selection |
| `figma.editorType` | Branch behavior between `"figma"` and `"slides"` | `SlideNode`-parent path for `isSkipped` is only available in `"slides"` editor |
| `figma.viewport` | Scroll + zoom to selected slide | `figma.viewport.scrollAndZoomIntoView([slideNode])` |
| `instance.findOne(predicate)` | Locate wrapper instances inside a slide | Used by all `find*Wrap` selectors in `slide-machine.ts` |
| `instance.componentProperties` | Read variant property keys (hash-suffixed) | Used by `getPropertyKey` + `setInstanceProperty` for badge icon-swap |
| `node.getStyledTextSegments(['fontName'])` | Read mixed-font ranges before write | Required by `loadAllFontsForNode` (FIG-FONT-01) |
| `node.characters` | Read existing text content | Heading + Paragraph text extraction from CopyWrap, Badge, Card |
| `node.fills` | Read image fills (ImageWrap, card visual) | `ImagePaint.imageHash` for existing image detection |
| `figma.getImageByHash(hash)` | Read image bytes for preview | Used by image-preview flow |
| `node.getPluginData(key)` | Read per-node persisted state | Keys: `kind`, `v`, `model` — see Persistence model |
| `figma.variables.importVariableByKeyAsync(key)` | Import Text / Text Dimmer library variables | Keys from `accent-vars.ts` lines 19-20; requires `teamlibrary` permission |
| `variable.resolveForConsumer(node)` | Resolve variable to current-mode RGB | Avoids stale color from cache; node is the TextNode/SlotNode target |
| `slot.children` | Read slot contents (Table/Journey) | SlotNode within TableWrap/JourneyWrap instances |
| `node.absoluteBoundingBox` | Read node dimensions for slot sizing | Used by table and journey renderers |
| `SlideNode.isSkippedSlide` | Read slide skip-state (Slides editor only) | `parent.type === 'SLIDE'` guard required before access |

### MUTATE

All mutations that modify user-visible canvas content are described below. Each `setCharacters` or node-property write is a separate native Figma undo step per ADR-0004.

| API | Purpose | Undo behavior |
|---|---|---|
| `node.characters = value` | Write heading / paragraph / badge label / cell text | Single undo step per write. Must be preceded by `loadAllFontsForNode` (FIG-FONT-01). |
| `node.setRangeFills(start, end, fills)` | Write accent (Text Dimmer) ranges on heading | Deferred — accent ranges are out of scope in v0.1.0 (ADR-0008). API documented here for completeness. |
| `node.fills = [paint]` | Replace image fill on ImageWrap slot or card visual slot | Single undo step. |
| `figma.createImage(bytes).hash` | Create Figma image from uploaded bytes | Precedes `node.fills` write for image upload path. |
| `instance.setProperties({ [key]: value })` | Swap badge icon (INSTANCE_SWAP component property) | Single undo step. Key must be resolved via `getPropertyKey` due to hash suffix. |
| `node.setPluginData(key, value)` | Persist wrapper model and kind/version | Three keys: `kind` (wrapper type), `v` (schema version), `model` (JSON-stringified data). |
| `node.setRelaunchData({ open: '...' })` | Register relaunch button per wrapper | Called after every successful save. |
| `frame.appendChild(child)` | Build table rows/cells and journey items inside SlotNode | Used by table and journey renderers. |
| `figma.createFrame()` | Create row/cell frames inside table SlotNode | Table renderer builds FRAME nodes imperatively. |
| `figma.createText()` | Create text nodes inside table cells | Table renderer. `loadFontAsync` required before `characters` write. |
| `frame.resize(width, height)` | Resize slot container and row/cell frames | Table renderer layout math. |
| `figma.loadFontAsync(fontName)` | Pre-warm font cache before text write | Called in parallel at plugin init for all required fonts (FIG-FONT-01). |
| `figma.commitUndo()` | Explicit undo-group boundary (optional, per ADR-0004) | Used only when helper API in `packages/figma-api/src/mutate.ts` is called with `atomic: true`. Default is granular per-mutation undo. |
| `SlideNode.isSkippedSlide = boolean` | Toggle slide skip state (Slides editor only) | Guarded by `figma.editorType === 'slides'` check. |

### UI bridge

| API | Purpose |
|---|---|
| `figma.showUI(__html__, { width: 520, height: 760, themeColors: true })` | Open the plugin iframe |
| `figma.ui.postMessage(msg)` | Send typed messages to ui (init, slide-loaded, target-updated, page-changed, slide-focused, image-preview, progress, error) |
| `figma.ui.on('message', handler)` | Receive typed messages from ui (slide-list:request, slide-load:request, apply-*, image-upload:request, persisted-state:*, close) |
| `figma.on('selectionchange', handler)` | Detect canvas selection change for slide focus-follow | Debounced 200 ms before slide-load |
| `figma.on('currentpagechange', handler)` | Re-scan slides when user navigates to a different page | Posts `page-changed` (slide list refresh) |
| `figma.on('documentchange', handler)` | Optional — invalidate cached node references | Consider for Sprint 2+ if stale node refs become a bug pattern |

The ui is **fixed-size** at 520 × 760. No `figma.ui.resize` calls in v0.1.0. Tab panels scroll internally.

### NETWORK

None. `networkAccess: { "allowedDomains": ["none"] }`. CSV import is parsed in the ui iframe from a local file. Image upload is bytes from a local file-input — passed over the message bus as `Uint8Array`. No external fetch calls.

### STORAGE

| Storage type | Keys / namespace | Scope | Contents |
|---|---|---|---|
| `node.setPluginData('kind', value)` | `kind` | Per-node (wrapper instance) | Wrapper type string: `'welder-copywrap'`, `'welder-badge'`, `'welder-imagewrap'`, `'welder-card'`, `'welder-tablewrap'`, `'welder-journeywrap'` |
| `node.setPluginData('v', value)` | `v` | Per-node | Schema version string: `'1'` for new instances, `'2'` for legacy table compat |
| `node.setPluginData('model', value)` | `model` | Per-node | `JSON.stringify(section-specific-data)`, max ~100 KB per Figma limit |
| `node.setRelaunchData({ open: '...' })` | `open` | Per-node | Relaunch button label string |
| `figma.clientStorage` | None in v0.1.0 | Per-user, cross-file | Reserved for future user preferences (last-active tab, icon cache). Not used in v0.1.0. |

**No `setSharedPluginData` in v0.1.0** — all state is private to this plugin's namespace.

---

## Wrapper detection inventory

Detection uses `slide-machine.ts` (to be ported from `widget-src/slide-machine.ts`). All detectors are synchronous. Each returns `InstanceNode | null`.

| Wrapper | Detection rule | Structural check | Source lines |
|---|---|---|---|
| `CopyWrap` | `instance.name === 'CopyWrap'` | First INSTANCE descendant; must contain a TEXT node named `'Heading'` to be useful | `slide-machine.ts:140` |
| `Badge` | `instance.name.indexOf('Badge') === 0` AND `isEffectivelyVisible(n, slide) === true` | First visible INSTANCE starting with `'Badge'`. Visibility check: `instance.visible` + ancestors up to slide (bounded 10 hops). | `slide-machine.ts:181-187` |
| `ImageWrap` | `instance.name === 'ImageWrap'` | First INSTANCE; child node with non-null `ImagePaint` fill is the slot target | `slide-machine.ts:189` |
| `CardWrap` | `instance.name === 'CardWrap'` | First INSTANCE; children named `'Card'` are iterated for per-card editing | `slide-machine.ts:193` |
| `TimelineWrap` | `instance.name === 'TimelineWrap'` OR `instance.name.indexOf('Timeline') >= 0` | First INSTANCE. Children are CopyWrap instances (Heading + Paragraph); `Stepper Item` children are skipped | `slide-machine.ts:277-280` |
| `JourneyWrap` | `instance.name === 'JourneyWrap'` | First INSTANCE; contains a SLOT node accessed via `findJourneySlot` | `slide-machine.ts:350` |
| `TableWrap` | `instance.name === 'TableWrap'` OR `instance.name.indexOf('Tabel=') === 0 && no 'Timeline'` OR `instance.name.indexOf('Table=') === 0 && no 'Timeline'` OR `instance.name.indexOf('Property 1=') === 0 && no 'Timeline' && no 'Chart'` | First matching INSTANCE; contains a SLOT node accessed via `findTableSlot` | `slide-machine.ts:225-238` |
| `ChartWrap` | **Intentionally absent in v0.1.0** | No detector, no stub file. See ADR-0007. | — |

**Variant-naming note (from `spec.md` §7.2, T31.1):** Slide Machine uses component-variant syntax as the on-canvas instance name (e.g., `Tabel=Alt Timeline`, `Tabel=Table Default`). The detection rules above handle this. Detection is by name-match, not by file-ID, making it revision-independent against both the published library (`kAZqxj4nxpafYjB5FhfOru`) and any future library revision.

---

## Persistence model

### pluginData round-trip

Each wrapper node receives three pluginData keys after a successful save:

```
node.setPluginData('kind', 'welder-tablewrap')  // wrapper type
node.setPluginData('v', '1')                     // schema version
node.setPluginData('model', JSON.stringify(data)) // serialized model
```

On read, the plugin reads all three keys. If `kind` is absent or unrecognized, the node is treated as un-initialized. If `v` is `'2'` and `kind` is `'welder-tablewrap'`, the legacy migration path (T34.4) applies — see below.

### Legacy-format detection (T34.4 migration)

The external v0.2.1 build introduced a `TableWrapModel` (Slot-based, v1) to replace the legacy `TableData` (v2, per-column schema). On read:

- If `getPluginData('v') === '2'` and `kind === 'welder-tablewrap'` → legacy format. Parse `model` as `TableData` (deprecated shape), convert to `TableWrapModel`, and re-save as v1.
- If `getPluginData('v') === '1'` → current format. Parse directly as the appropriate typed model.

The code-side typed wrapper in `code/persistence.ts` (Sprint 1) handles this migration transparently.

### setRelaunchData per-wrapper

After every successful save, the plugin calls:
```ts
node.setRelaunchData({ open: 'Edit with Slide Editor' });
```
This registers the relaunch button on the wrapper node, matching `manifest.relaunchButtons[0].command === 'open'`. (The external build uses the Dutch label "Bewerk met Slide Editor" — the rebuild uses English per monorepo conventions.)

---

## Library file ID reconciliation

Two Figma files are relevant:

| File | File key | Role |
|---|---|---|
| Slide Machine (published library) | `kAZqxj4nxpafYjB5FhfOru` | **Authority for production users.** This is the library user files in production reference. Variable keys `TEXT_KEY` and `TEXT_DIMMER_KEY` (from `accent-vars.ts` lines 19-20) belong to this library's variable collection. |
| Templates-Welder (work copy) | `RgTXIrUpihBauydjMZbUGX` | Design reference for the rebuild. Not the authority for runtime detection. URL: https://www.figma.com/design/RgTXIrUpihBauydjMZbUGX/Templates-Welder?node-id=26-1797&m=dev |

**Detection is name-based, not file-ID-based.** The `isSlide` predicate and all `find*Wrap` selectors match against `instance.name`, not against the component's origin file ID. This means detection is library-revision-independent: it works against the published library, the work copy, and any future library revision with the same component names.

The only place the published file ID matters is when importing library variables via `figma.variables.importVariableByKeyAsync(TEXT_KEY)` — the variable keys are scoped to the published library's variable collection.

> **Project-pm review:** The variable keys (`TEXT_KEY`, `TEXT_DIMMER_KEY`) from `accent-vars.ts` are string hashes specific to the published library's variable collection. If the published library is ever rebuilt from scratch (not just revised), these keys will change and variable binding will silently fail. This risk should be noted in the `packages/figma-api/src/variables.ts` module documentation when it is written in Sprint 1.

---

## Risk flags

### Slow path: `figma.currentPage.findAll` on large pages

`findSlidesOnPage` uses `figma.currentPage.findAll(isSlide)`. On a page with 10k+ nodes, this is O(n) over all descendants. The `isSlide` predicate is strict (three checks: type, name, dimensions) and cheap per node, but the traversal itself is not batched. Mitigation in Sprint 1: add `figma.skipInvisibleInstanceChildren = true` before the scan and reset it after. For pages with > 50 slides, consider a chunked async pattern with progress reporting.

### Silent fire-and-forget async (R3 from plan)

Image fetch (`figma.getImageByHash`), font pre-warm (`figma.loadFontAsync`), variable import (`importVariableByKeyAsync`), and icon cache priming are all async. In the external build these are fire-and-forget with no timeout or progress reporting. Sprint 1 resolves this via `withTimeout` / `withProgress` primitives in `packages/figma-api/src/progress.ts`.

### FIG-FONT-01: silent character truncation on mixed-font nodes

`node.characters = value` truncates silently at the first font boundary when not all fonts in the existing styled range are loaded. This is the root-cause bug from T29 in the external build. **All text writes in v0.1.0 must use `setTextCharactersSafe` from `packages/figma-api/src/fonts.ts`** (to be ported from `widget-src/editors/_shared/fonts.ts`).

### Reka focus-trap recurrence (R9 from plan)

T28 (accent ranges) in the external build was blocked by a `<UPopover>` + `<UInput>` keystroke incompatibility in Reka. Any popover-bound input in Sprints 2–4 carries the same risk. Pre-flight check required at Sprint 2 kickoff.

### Bundle budget collision (R2 from plan)

The ui bundle will carry: 120+ Lucide icons (icon picker), journey renderer, table renderer, cropperjs (ADR-0006 pending). This may exceed the ADR-0003 budget. Lazy-load boundaries are named in ADR-0003; the bundle analyzer must be run before each sprint's PR.

### Variable binding on non-team plans

`figma.variables.importVariableByKeyAsync` requires the user's team to have access to the published Slide Machine library. On a Figma free-plan or a team without the library enabled, this call throws. The `loadAccentVars` helper in the external build catches this and falls back gracefully (returns `null` variables; see `accent-vars.ts` lines 47-58). This pattern must be preserved in the port.

### `SlideNode.isSkippedSlide` — Slides editor only

Accessing `parent.isSkippedSlide` on a slide's parent node requires that `parent.type === 'SLIDE'`. In Figma Design, slide parents are `PAGE` nodes and this property does not exist. The `slideSummary` function must guard `parent.type === 'SLIDE'` before access, returning `isSkipped: null` in Design editor. Violation causes a runtime exception.

### `setPluginData` size limit

Figma enforces a per-key limit of approximately 100 KB for `setPluginData`. Large journey or table models must not exceed this. The table renderer in the external build stores `TableWrapModel` (rows + cells as arrays of strings) which stays well under the limit in practice. No explicit size guard in v0.1.0 — add a guard in Sprint 4 when the table editor is rewritten.

---

## Reuse opportunities

The following `packages/figma-api/` wrappers should be used by this plugin rather than calling `figma.*` directly:

| Wrapper to create (Sprint 1) | Source file to lift from | Purpose |
|---|---|---|
| `packages/figma-api/src/variables.ts` | `widget-src/editors/_shared/accent-vars.ts` | `loadAccentVars()`, `resolveColor()`, `TEXT_KEY`, `TEXT_DIMMER_KEY`, `TEXT_DIMMER_RGB` — lifted to shared package |
| `packages/figma-api/src/fonts.ts` | `widget-src/editors/_shared/fonts.ts` | `loadAllFontsForNode()`, `setTextCharactersSafe()` — FIG-FONT-01 canonical pattern |
| `packages/figma-api/src/mutate.ts` | New | `commitUndo()` discipline helper per ADR-0004 |
| `packages/figma-api/src/progress.ts` | New | `withTimeout()`, `withProgress()` — resolves R3 silent fire-and-forget |
| `packages/figma-api/src/selection.ts` | New | `getSelectedSlide()`, `getSelectedWrapper()` helpers |
| `packages/figma-api/src/router.ts` | Already exists | Versioned typed router with correlationId — use directly |

The slide scanner and wrapper detectors belong in `plugins/welder-editor/code/slide-machine.ts` (plugin-specific), not in `packages/figma-api/` — detection rules are Slide Machine-specific and not reusable across plugins.

---

## Submission gates

Before implementation starts, `release-engineer` must verify:

1. The `teamlibrary` permission is policy-compliant for Figma Community submission. As of 2026-05-05 this permission is standard for plugins that read shared library variables; no special policy flag is needed.
2. The `relaunchButtons` command name matches between `manifest.json` and the handler registered in `code/main.ts`.
3. No `enableProposedApi` is required — all APIs used are stable as of Figma API 1.0.0.

---

## Measurement gaps

The following cannot be determined from typings alone and should be measured on a real test document in Sprint 1:

1. **`findAll` latency on a large Figma Slides presentation** — target: a 30-slide deck with each slide having full wrapper complement (~300 descendants per slide = ~9000 nodes). Expected: < 100 ms. If > 200 ms, chunked async iteration is required.
2. **`importVariableByKeyAsync` cold vs warm call latency** — first call (uncached) vs subsequent calls. Should be pre-warmed at plugin init. Target: < 50 ms warm.
3. **`setTextCharactersSafe` throughput on a 6-column, 10-row table** — 60 cell writes, each preceded by font load. Expected: < 2 s total. If > 500 ms per cell, batch font-load before the first cell write.
4. **`getImageByHash` latency for image-preview bytes** — image data must be returned before the ui shows a preview. Target: < 200 ms for a 1920×1080 image fill.
