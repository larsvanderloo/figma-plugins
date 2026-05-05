# ADR 0003 — welder-editor: bundle-size budget (v0.1.0)

**Status:** Proposed
**Date:** 2026-05-05
**Decision-makers:** ui-engineer (ui-side, this ADR), figma-api-engineer (code-side, §TBD sections below)
**References:** ADR-0001; ADR-0002; ADR-0007; ADR-0008; Plan §"Bundle budget posture"; Risk register R2; `docs/perf/welder-editor.md` (to be created, linked here as follow-up)

> **Ratification gate:** This ADR moves from `Proposed` to `Accepted` once figma-api-engineer fills in the `TBD` sections (§Baseline code-side measurement and §Proposed v0.1.0 budget — code-side) and confirms the code-side numbers. See §F of the Wave 2 coordination notes for the figma-api-engineer action items.

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

> **TBD — figma-api-engineer:** Verify these measurements are the correct baseline for the code-side budget discussion. The gzipped 354 KB for `dist/code.js` suggests significant bundling of chart-related code and possibly the full Zod runtime. Identify the dominant cost drivers (e.g. chart-core renderer, Zod, slide-machine, journey renderer) and confirm whether any of these are absent in v0.1.0 (charts explicitly deferred per ADR-0007).

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

> **TBD — figma-api-engineer:** Propose the code-side minified+gzipped budget for `dist/code.js`. Consider the following known scope removals from the external build: chart renderer absent (ADR-0007), accent-range write logic absent (ADR-0008), Zod usage (does the code-side Zod import inflate the bundle? if so, is a lighter validation strategy available?). Propose a number and a rationale.

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

> **TBD — figma-api-engineer:** Name the code-side lazy-load opportunities, if any. Candidates: (a) Slide Machine library variable wrapper in `packages/figma-api/src/variables.ts` — is this loaded eagerly at plugin open, or lazily on first apply that needs library variables? (b) Zod runtime — is it present in the code-side bundle? If so, what is its contribution? (c) Journey renderer (1223 LOC) — already a single module; no obvious split opportunity on the code side since the code side processes messages synchronously, but worth noting whether it contributes disproportionately to the bundle.

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
2. **`docs/perf/welder-editor.md`:** create this file with the baseline measurements and v0.1.0 budgets from this ADR. Sprint 0 item 0.4, owned by figma-api-engineer + ui-engineer jointly. Blocked on figma-api-engineer filling in the code-side numbers.
3. **ADR-0006 (cropper choice):** Sprint 2 decision. If cropperjs is chosen, confirm lazy-load approach in ADR-0006. If canvas API is chosen, update the Lucide + Nuxt UI tree-shaking estimates in this ADR (canvas API has no bundle contribution).

---

## Consequences

**Positive:**

- v0.1.0 has a formal, measured budget that can be enforced in CI.
- The per-layer reduction register gives Sprint 2–4 engineers a concrete checklist; no reduction is speculative — each is named and estimated.
- The ratchet-downward policy prevents budget creep across releases.

**Negative:**

- The 250 KB target requires discipline starting from Sprint 2 setup. If tree-shaking and the icon manifest are not implemented as part of the first assembly (Sprint 2), it is harder to retrofit them in Sprint 4 when the full feature set is present.
- The code-side budget remains TBD until figma-api-engineer ratifies; until then this ADR cannot move to Accepted and `plugin.toml` cannot be updated.

---

## References

- Plan §"Bundle budget posture" — "Revise via ADR — Sprint 0 ADR-0003 measures and proposes realistic numbers"
- Plan §Risk register R2 — "Bundle budget collision: General + Content + Table + Journey + cropperjs + 120 Lucide icons may exceed even revised ADR-0003 budgets"
- ADR-0007 — chart renderer absent in v0.1.0 (removes a significant code-side cost from the external build)
- ADR-0008 — accent-range write logic absent in v0.1.0 (removes `applyAccentRanges`, `loadAccentVars`, `readDimRanges` and their Figma variable call stack from code-side)
- CLAUDE.md §"Performance discipline" — 250 KB default budget, `rollup-plugin-visualizer`, per-function imports
- External build baseline: `/Users/lars/Documents/Claude/Figma_plugin/plugins/welder-slide-editor/dist/`
