# ADR 0003 — welder-editor: bundle-size budget (v0.1.0)

**Status:** Accepted
**Date:** 2026-05-05
**Decision-makers:** ui-engineer (ui-side), figma-api-engineer (code-side)
**References:** ADR-0001; ADR-0002; ADR-0007; ADR-0008; Plan §"Bundle budget posture"; Risk register R2; `plugins/welder-editor/docs/perf/welder-editor.md`

---

## Context

The external build `welder-slide-editor` v0.2.1 was not developed with a formal bundle-size budget. It ships two artifacts: `dist/ui.html` (the entire iframe bundle inlined as a single HTML file) and `dist/code.js` (the Figma sandbox bundle). Both were measured against the external build as the baseline for this ADR.

Figma plugin iframes load from a `<iframe src="data:...">` generated from the `ui.html` content or from the `ui` field in the manifest pointing to the HTML file. There is no CDN; the entire ui bundle is included in the plugin package. Large bundles increase:

1. Plugin install size in Figma's plugin registry.
2. Time from "run plugin" to first paint of the iframe.
3. Startup JS parse and execution time, which on lower-end hardware can exceed the perceptual "fast" threshold.

The CLAUDE.md default budget is 250 KB (minified+gzipped, ui-side). The external build significantly exceeds this. The purpose of this ADR is to (a) establish a measured baseline, (b) set a v0.1.0 target that is ambitious but achievable given the feature scope, and (c) name the per-layer reduction levers.

---

## Measurement methodology

**Tool:** Unix `wc -c` for raw byte count; `gzip -c <file> | wc -c` for minified+gzipped equivalent. The ui bundle is a single-file HTML with all JS/CSS inlined (Vite's default for Figma plugins); gzip on the HTML file gives a comparable signal to a separate `.js` bundle gzipped.

**Note on methodology:** The external build's `ui.html` is already a fully minified and inlined bundle. Gzipping it measures the compressibility of the already-minified output. This is the correct baseline signal because Figma's plugin registry delivers the file over HTTP/2 with gzip encoding.

**Measurement command (reproducible):**

```sh
# Raw size
wc -c dist/ui.html

# Gzipped size (minified+gzip equivalent)
gzip -c dist/ui.html | wc -c
```

---

## Baseline measurements (external build v0.2.1)

### ui-side (`dist/ui.html`)

| Metric | Value |
|---|---|
| Raw file size | 1,577,390 bytes (~1.50 MB) |
| Gzipped size | 339,105 bytes (~331 KB) |

Measured against `/Users/lars/Documents/Claude/Figma_plugin/plugins/welder-slide-editor/dist/ui.html`.

The gzipped size of 331 KB already exceeds the CLAUDE.md default budget of 250 KB.

**What is inside this bundle (inferred from the external build's dependencies and build output):**

- Vue 3 runtime (~45 KB gzip)
- Nuxt UI v4 full component set (not tree-shaken; estimated 60–80 KB gzip of which only ~30% is used by this plugin)
- Tailwind CSS v4 (generated CSS, not tree-shaken by PurgeCSS in the external build; estimated 15–25 KB gzip)
- Full Lucide icon set bundled inline (this is the dominant cost driver at ~80–100 KB gzip; the external build imports icon components statically from `lucide-vue-next` without a tree-shaking-friendly manifest approach)
- cropperjs (T10 image editor, currently dormant; ~25 KB gzip)
- The external build's own component code: `GeneralPanel.vue`, `ContentPanel.vue`, `GraphsPanel.vue`, `TableEditor.vue`, `JourneyEditor.vue`, `SlidePicker.vue`, plus composables and stores

### code-side (`dist/code.js`)

| Metric | Value |
|---|---|
| Raw file size | 1,756,471 bytes (~1.68 MB) |
| Gzipped size | 362,838 bytes (~354 KB) |

**Measurement command (reproducible, run from external build directory):**

```sh
# Raw size
wc -c dist/code.js

# Gzipped size
gzip -c dist/code.js | wc -c
```

These numbers confirmed by figma-api-engineer (2026-05-05) against `/Users/lars/Documents/Claude/Figma_plugin/plugins/welder-slide-editor/dist/code.js`.

**Critical structural note:** The external build uses esbuild with a custom `chunked-text-loader` that inlines the entire `dist/ui.html` as chunked string literals inside `dist/code.js` (required to avoid a Figma sandbox parser limit on large string literals). This means the external `code.js` contains both the sandbox logic and the full iframe bundle. The numbers 1.68 MB raw / 354 KB gzip are therefore **not comparable** to the monorepo build's `code.js`.

**External build breakdown:**

| Component | Raw bytes | Gzipped (est.) |
|---|---|---|
| Embedded `ui.html` | 1,577,390 (~1.50 MB) | 339,105 (~331 KB) |
| Actual code-side logic | ~179,081 (~175 KB) | ~23,733 (~23 KB) |
| **Total `code.js`** | **1,756,471 (~1.68 MB)** | **~362,838 (~354 KB)** |

The gzip estimates for the individual components are: actual gzip of `ui.html` (339,105 bytes, separately measured) subtracted from total, giving ~23.7 KB for the code-side logic alone.

**Monorepo build difference:** The monorepo's Vite IIFE build uses `figma.showUI(__html__, ...)` where `__html__` is Figma's built-in template variable injected at plugin load time by the Figma client — the iframe HTML is delivered via the `ui` field in `manifest.json`, not embedded in `code.js`. The monorepo `code.js` therefore contains only the sandbox TypeScript logic, not the ui bundle. This is the correct, Figma-recommended architecture.

**Dominant cost drivers in the external code-side logic (~179 KB raw / ~24 KB gzip):**

| Module | Raw bytes | Notes |
|---|---|---|
| `widget-src/code.ts` | 58,395 | Main entry; contains chart dispatch paths |
| `widget-src/editors/journey/renderer.ts` | 48,332 | 1,223 lines; geometry calculation heavy |
| `widget-src/editors/table/renderer.ts` | 25,803 | 642 lines; slot-based frame builder |
| `widget-src/types.ts` | 20,512 | TypeScript types — erased at compile |
| `widget-src/editors/chart/` (bar + renderer + types) | 19,218 | **DROPPED in v0.1.0 (ADR-0007)** |
| `widget-src/editors/general/` (badge + image + title) | 20,372 | Production editors; kept |
| `widget-src/editors/content/card.ts` | 9,624 | Kept |
| `widget-src/slide-machine.ts` | 14,503 | Kept |
| `widget-src/constants.ts` | 12,365 | Static constants; no runtime imports |
| `widget-src/editors/_shared/fonts.ts` | 2,335 | Kept; promotes to `packages/figma-api/` |
| `widget-src/editors/_shared/accent-vars.ts` | 3,298 | **DROPPED in v0.1.0 (ADR-0008)** |
| `widget-src/editors/shared/icon-swap.ts` | 14,002 | Kept; uses `figma.importComponentByKeyAsync` |

No Zod or other schema-validation runtime is present in the external code-side bundle — the external build uses hand-rolled type checks and `typeof` guards throughout.

---

## Proposed v0.1.0 budget — ui-side (ui-engineer)

**Target: ≤ 250 KB gzipped for `dist/ui.html`.**

This is a 26% reduction from the 331 KB baseline. It is achievable with the reductions enumerated below.

**Stretch target: ≤ 200 KB gzipped.**

Achievable if the Lucide icon manifest approach lands in Sprint 2 and cropperjs stays lazy-loaded.

**Init paint budget (plugin open → first paint): ≤ 200 ms on the canonical test device (Figma desktop, macOS arm64).**

**User-input → optimistic update: ≤ 16 ms (one frame).**

---

## Proposed v0.1.0 budget — code-side (figma-api-engineer)

**Target: ≤ 60 KB gzipped for `dist/code.js`.**

**Rationale:**

The monorepo `code.js` contains only the TypeScript sandbox logic — not the ui bundle. Starting point is the ~23.7 KB gzip equivalent from the external build's code-side logic.

v0.1.0 scope changes versus the external build logic:

| Change | Direction | Est. gzip delta |
|---|---|---|
| Chart renderer removed (ADR-0007): chart/bar.ts + renderer.ts + types.ts (19,218 raw) | Savings | −6 to −8 KB |
| Accent-range write logic removed (ADR-0008): accent-vars.ts (3,298 raw), `applyAccentRanges`, `loadAccentVars` call paths | Savings | −1 to −1.5 KB |
| Zod runtime added for message-bus validation (z.object, z.string, z.literal, z.discriminatedUnion) | Cost | +13 to +21 KB |
| `packages/figma-api/` wrappers added (router.ts + 6 Sprint 1 modules: selection, mutate, progress, variables, fonts, manifest) | Cost | +3 to +5 KB |
| `shared/messages.ts` runtime contribution: `MESSAGE_BUS_VERSION = 1` constant only | Cost | < 0.1 KB |

**Net estimate: ~20–40 KB gzipped for v0.1.0.**

The 60 KB budget provides headroom above the upper-bound estimate for two reasons:

1. **Zod surface uncertainty.** The Sprint 1 implementation determines how many Zod schemas are defined on the code side. If all 25 message types receive Zod validators (maximum validation depth), Zod's contribution may reach the upper end of its range. The 60 KB budget accommodates this without requiring a schema-validation ADR.
2. **Implementation complexity.** The journey renderer (48,332 bytes raw) and table renderer (25,803 bytes raw) contain dense imperative logic that compresses well (gzip ratio ~25–30%) but is not trivially reducible. The budget accounts for Sprint 1 adding tests and typed wrappers around these files, which may add a few KB.

**Stretch target: ≤ 40 KB gzipped.** Achievable if Zod is replaced by hand-rolled discriminated-union type guards on the code side (see §Per-layer reduction targets — code-side). This is the preferred path if the code bundle tracks toward 50 KB during Sprint 1 build measurement.

**Measurement command (monorepo):**

```sh
# From plugins/welder-editor/
pnpm build
gzip -c dist/code.js | wc -c
```

---

## Per-layer reduction targets — ui-side

The following changes are achievable by ui-engineer without cross-domain coordination. Estimated savings are conservative; each must be verified with `rollup-plugin-visualizer` during Sprint 2–4 builds.

### 1. Lucide icon subset — on-demand manifest (saves ~60–80 KB gzip)

**Problem:** The external build statically imports icon components from `lucide-vue-next`. Even with Vite tree-shaking, the icon metadata (SVG path strings) is bundled for every icon that is referenced anywhere in the component tree. The external build uses ~120 icons across all editors. `lucide-vue-next` ships ~1500 icons; bundling all of them would be ~300+ KB gzip. Static imports of 120 icons still produce a large chunk.

**Solution:** Build an icon manifest JSON file (icon-key → SVG path data) at build time from the specific subset used by the plugin. At runtime, the `IconPicker` section fetches the manifest on first open (not on plugin open). Before the manifest is fetched, icon display falls back to a key-string. Icon components are never bundled; only the manifest JSON is loaded. Saves ~60–80 KB from the initial bundle.

**Sprint:** Sprint 2 (IconPicker section design must account for the manifest approach from day one).

### 2. Nuxt UI v4 tree-shaking — import only used components (saves ~15–25 KB gzip)

**Problem:** The external build appears to import Nuxt UI globally (no per-component explicit imports). Global registration bundles every Nuxt UI component.

**Solution:** Explicit per-component imports in the plugin's `app.config.ts` and `main.ts`. Only `UButton`, `UInput`, `USelect`, `UTabs`, `USwitch`, `UFormField`, `UBadge`, `UTooltip`, and one or two more are needed in v0.1.0. Estimated saving: 15–25 KB gzip from eliminating unused component code.

**Sprint:** Sprint 1/2 setup (must be done before the first section is assembled).

### 3. Tailwind CSS v4 content purge (saves ~5–10 KB gzip)

**Problem:** Tailwind CSS v4 generates atomic utilities. If the content paths are broad (e.g. `**/*.{vue,ts}` includes node_modules), unused utilities survive.

**Solution:** Narrow `content` in the Tailwind config to `ui/**/*.vue`, `sections/**/*.vue`, `components/**/*.vue` only. Exclude node_modules explicitly.

**Sprint:** Sprint 0/1 config (a one-line fix in the Tailwind config; can be done at initial build setup).

### 4. cropperjs lazy-loaded via async component (saves ~25 KB gzip from initial bundle)

**Problem:** cropperjs (~45 KB minified) is needed only when the user opens the image editor section. Including it in the initial bundle delays first paint for users who never open image editing.

**Solution:** `ImageEditor.vue` is an async component (`defineAsyncComponent(() => import('./ImageEditor.vue'))`). cropperjs is imported only inside `ImageEditor.vue`. The initial bundle pays only for the async stub (~200 bytes).

**Sprint:** Sprint 2 (T10 image editor, ADR-0006 will confirm cropperjs vs canvas-API; if cropperjs is chosen, it ships lazy-loaded).

> **Project-pm review:** ADR-0006 (cropper choice) is a Sprint 2 kickoff decision. If the canvas-API alternative is chosen instead of cropperjs, the ~25 KB lazy-load saving disappears because the canvas API is native — but the baseline is already lower. Either way, ImageEditor ships as an async component.

### 5. Journey renderer split-loaded (saves ~15–20 KB gzip from initial bundle)

**Problem:** The journey renderer (1223 LOC in the external build) includes complex geometry calculation code. At initial plugin open, only the SlidePicker and loading state are shown; the journey renderer is not needed until the user picks a slide with a JourneyWrap.

**Solution:** `JourneyEditor.vue` is an async component, loaded when the slide-load result arrives and `journeyModel !== null`. The code-side renderer is already separated by the message-bus boundary; the ui-side visual component lazy-loads without additional coordination.

**Sprint:** Sprint 4 (JourneyEditor section).

### 6. Table editor split-loaded (saves ~10–15 KB gzip from initial bundle)

Same rationale as journey: `TableEditor.vue` is an async component, loaded on demand when a slide with a TableWrap is picked.

**Sprint:** Sprint 4 (TableEditor section).

### 7. Vue 3 production build (no dev warnings, no Vue DevTools overhead)

This is a build-config correctness item, not a sprint item. Verify `NODE_ENV=production` is set in the Vite build config for the plugin build. Development builds of Vue include runtime warnings and DevTools communication hooks that inflate bundle size and slow execution.

---

## Per-layer reduction targets — code-side (figma-api-engineer)

### A. Zod → hand-rolled type guards on the code side (saves ~13–21 KB gzip)

**Problem:** Zod 3.x adds ~131 KB raw / ~21 KB gzip to any bundle that imports it. The code-side bundle needs validated message dispatch, but the validation surface is narrow: every incoming message from the iframe has a `type` discriminant and a `version` field. The actual payload shapes are enforced by TypeScript at compile time.

**Solution:** Replace Zod on the code side with narrow hand-rolled type guards — one `isXxxPayload(u: unknown): u is XxxPayload` function per incoming message type. These are simple `typeof` and `in` checks, 3–10 lines each, zero runtime dependency. The Zod schemas in `shared/messages.ts` (if any) are erased at compile time; only runtime guards need to live in `code/`. The ui side may keep Zod if its bundle budget accommodates it; the code side is the critical path for this saving.

**Sprint:** Sprint 1 decision. If the Sprint 1 implementation elects Zod for ergonomics, measure the code bundle on first build and compare against the 60 KB budget. If it tracks above 50 KB, switch to hand-rolled guards before Sprint 1 RC.

> **Project-pm review:** This lever interacts with the code/ui split of validation responsibility. If the ui side uses Zod and the code side uses hand-rolled guards, they diverge in validation expressiveness. This is intentional and defensible (the code side only needs to reject unknown message types and malformed versions, not validate deep payloads — TypeScript already guarantees the ui side sends the right shape). No ui-engineer concurrence required, but flag in the Sprint 1 handoff note.

### B. Journey renderer — no code-side split opportunity (document, do not optimize)

The journey renderer (1,223 LOC, 48,332 bytes raw) contributes ~13 KB gzip to the code bundle. There is no meaningful split opportunity on the code side: the Figma sandbox processes messages synchronously per message-bus round-trip, and the journey renderer must be fully resident in memory to handle a `apply-journey` message in a single synchronous-to-Figma call sequence. Lazy-loading a code-side module would require an asynchronous import chain that the Figma sandbox does not support in the same way a browser supports `import()`. The correct optimization is tree-shaking: ensure only the exported symbols actually called from `code/main.ts` handlers survive.

**Sprint:** No action needed. Monitor in `rollup-plugin-visualizer` output during Sprint 4 (JourneyEditor sprint).

### C. Library variable wrapper — eager load, bounded cost

`packages/figma-api/src/variables.ts` (lifted from `_shared/accent-vars.ts`, 3,298 bytes raw, ~1.2 KB gzip) runs at plugin init to resolve `loadAccentVars`. In v0.1.0, accent-range write logic is dropped (ADR-0008), so `variables.ts` serves library-variable resolution for canvas token binding in table/journey renders. This is an eager load by design: the variable resolution cache must be primed before the first `apply-table` or `apply-journey` call or there will be a blocking async gap in user-visible apply latency. No split opportunity; the module is small and the eager load is correct.

### D. Slide-machine scanner — scope control

`slide-machine.ts` (14,503 bytes raw, ~4.5 KB gzip) runs on every `slide-list:request`. In v0.1.0 the scanner is bounded to `figma.currentPage`. If page size exceeds 5,000 nodes, the scanner must set `figma.skipInvisibleInstanceChildren = true` before traversal (Sprint 1 required). The module itself is not a bundle weight concern.

### E. `@iconify-json/lucide` — code side does NOT bundle icon SVG data

The external build's `ui/main.ts` statically imports `@iconify-json/lucide/icons.json` on the ui side (1,756-line icon name list → full SVG data). The code-side `icon-swap.ts` does **not** import icon data; it uses `figma.importComponentByKeyAsync` to resolve icons at runtime from the Figma library. The monorepo's icon strategy (ADR-0003 §1, Lucide icon subset manifest) moves icon data to a lazily-fetched manifest on the ui side; the code side is unaffected. No code-side action needed.

---

## Bundle delta policy

This ADR establishes the v0.1.0 budgets. The policy for all subsequent releases:

1. **Ratchet downward each release.** v0.2.0 must not exceed v0.1.0's measured gzipped size (not the budget — the actual measured number at release). Budget deltas are governed by the next rule.

2. **Budget delta requires its own ADR.** If a Sprint introduces a dependency that adds > 50 KB minified+gzipped to either bundle, the addition requires an ADR justifying it before the PR can merge. This threshold matches the CLAUDE.md performance discipline. The ADR must name the dep, its measured contribution (via `rollup-plugin-visualizer`), and why no lighter alternative exists.

3. **Per-sprint bundle gate.** Every sprint RC runs `gzip -c dist/ui.html | wc -c` and posts the number in the PR description. If the number exceeds the budget, the PR is blocked at `ui-engineer` review.

---

## Measurement tooling

- **`rollup-plugin-visualizer`:** generates a treemap of bundle composition. Add as a devDependency in the build config; run with `VISUALIZE=true pnpm build` (gate with an env flag so it is not always active). Output to `dist/stats.html`.
- **Gzip measurement script:** `gzip -c dist/ui.html | wc -c` — sufficient for CI gate. Can be added as a `check:bundle` npm script.
- **Chrome DevTools Performance tab + CPU throttle (4×):** for init paint measurement. See CLAUDE.md §Performance discipline.
- **`performance.mark()` / `performance.measure()`:** instrument plugin open → first paint and user-input → optimistic update. The e2e gauntlet captures these marks.

---

## Follow-up items

1. **`plugins/welder-editor/plugin.toml` budget fields:** update `[perf]` section once this ADR is ratified (ADR status → Accepted). This is Monday task 0.13, owned by project-pm.
2. **`plugins/welder-editor/docs/perf/welder-editor.md`:** created in Sprint 0 with baseline measurements and v0.1.0 budgets from this ADR. Sprint 0 item 0.4, co-owned by figma-api-engineer (code-side) and ui-engineer (ui-side). See that file for the day-to-day reference.
3. **ADR-0006 (cropper choice):** Sprint 2 decision. If cropperjs is chosen, confirm lazy-load approach in ADR-0006. If canvas API is chosen, update the Lucide + Nuxt UI tree-shaking estimates in this ADR (canvas API has no bundle contribution).

---

## Consequences

**Positive:**

- v0.1.0 has a formal, measured budget that can be enforced in CI.
- The per-layer reduction register gives Sprint 2–4 engineers a concrete checklist; no reduction is speculative — each is named and estimated.
- The ratchet-downward policy prevents budget creep across releases.

**Negative:**

- The 250 KB target requires discipline starting from Sprint 2 setup. If tree-shaking and the icon manifest are not implemented as part of the first assembly (Sprint 2), it is harder to retrofit them in Sprint 4 when the full feature set is present.
- The 60 KB code-side budget is an estimate; first measurement after Sprint 1 build may reveal the Zod trade-off needs resolution earlier than anticipated. If the Sprint 1 build exceeds 50 KB, the hand-rolled type guard path (§A) becomes mandatory before Sprint 1 RC.

---

## References

- Plan §"Bundle budget posture" — "Revise via ADR — Sprint 0 ADR-0003 measures and proposes realistic numbers"
- Plan §Risk register R2 — "Bundle budget collision: General + Content + Table + Journey + cropperjs + 120 Lucide icons may exceed even revised ADR-0003 budgets"
- ADR-0007 — chart renderer absent in v0.1.0 (removes a significant code-side cost from the external build)
- ADR-0008 — accent-range write logic absent in v0.1.0 (removes `applyAccentRanges`, `loadAccentVars`, `readDimRanges` and their Figma variable call stack from code-side)
- CLAUDE.md §"Performance discipline" — 250 KB default budget, `rollup-plugin-visualizer`, per-function imports
- External build baseline: `/Users/lars/Documents/Claude/Figma_plugin/plugins/welder-slide-editor/dist/`
- Perf budget day-to-day reference: `plugins/welder-editor/docs/perf/welder-editor.md`
