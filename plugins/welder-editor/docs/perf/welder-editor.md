# welder-editor — performance budget

**Status:** Active (Sprint 2 close)
**Date:** 2026-05-05
**Authority:** ADR-0003 (`docs/adr/0003-welder-editor-bundle-budget.md`)
**Owners:** figma-api-engineer (code-side), ui-engineer (ui-side)

This is the day-to-day reference for performance budgets on the `welder-editor` plugin. Budget changes require a new ADR; this file is updated to reflect the accepted values from the latest budget ADR.

---

## Bundle-size budget

All sizes are **minified + gzipped**. Numbers come from ADR-0003 (Accepted, 2026-05-05).

| Artifact       | Budget               | Baseline (ext. build v0.2.1)  | Notes                     |
| -------------- | -------------------- | ----------------------------- | ------------------------- |
| `dist/code.js` | **≤ 60 KB gzipped**  | ~24 KB gzip (code logic only) | See structural note below |
| `dist/ui.js`   | **≤ 250 KB gzipped** | 339 KB gzip                   | Stretch target: ≤ 200 KB  |

**Stretch targets** (achievable with the reduction levers in ADR-0003):

| Artifact       | Stretch target   |
| -------------- | ---------------- |
| `dist/code.js` | ≤ 40 KB gzipped  |
| `dist/ui.js`   | ≤ 200 KB gzipped |

### Structural note on the code-side baseline

The external build's `dist/code.js` reports 1,756,471 bytes raw / 362,838 bytes gzip. These numbers are **not** the baseline for the monorepo budget. The external build uses a custom esbuild `chunked-text-loader` that embeds the entire `dist/ui.html` as chunked string literals inside `code.js` (to work around a Figma sandbox parser limit on large string literals). Subtracting the ui.html contribution (1,577,390 bytes raw / 339,105 bytes gzip, separately measured), the actual code-side logic from the external build is ~179 KB raw / ~24 KB gzip.

The monorepo uses `figma.showUI(__html__, ...)` where `__html__` is Figma's built-in template variable; the iframe HTML is delivered via `manifest.json`'s `"ui"` field and is not embedded in `code.js`. The monorepo `code.js` therefore contains only the TypeScript sandbox logic, making the external ~24 KB gzip the correct comparison point.

**Measurement command (monorepo, from `plugins/welder-editor/`):**

```sh
pnpm build
# code-side
gzip -c dist/code.js | wc -c
# ui-side (JS bundle; dist/ui/index.html is the trivial HTML shell, not gated)
gzip -c dist/ui.js | wc -c
```

---

## Init-paint budget

| Operation                                       | Budget       | Notes                                                                                                                                |
| ----------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Plugin open → first paint (SlidePicker visible) | **≤ 200 ms** | Canonical device: Figma desktop, macOS arm64. Font pre-warm and variable import run in parallel at init; must not block first paint. |
| User-input → optimistic ui update               | **≤ 16 ms**  | One frame. Bound in ui; no message-bus round-trip for pure ui state.                                                                 |

The 200 ms init-paint budget is the CLAUDE.md default. It applies without override for this plugin; no Figma API calls at plugin open are known to block beyond this threshold for typical document sizes.

---

## Per-edit latency budgets

Defined in `plugins/welder-editor/docs/threading/welder-editor.md §Latency budgets`. Reference that file; do not duplicate. Summary:

| Operation                                               | Budget   |
| ------------------------------------------------------- | -------- |
| `slide-list:request` → result                           | ≤ 500 ms |
| `slide-load:request` → result                           | ≤ 500 ms |
| `apply-title-description`, `apply-badge`, `apply-image` | ≤ 500 ms |
| `apply-card-list`, `apply-timeline`                     | ≤ 500 ms |
| `apply-table` (small, 4×4)                              | ≤ 500 ms |
| `apply-journey` (10 items)                              | ≤ 500 ms |
| `image-upload:result` bytes available                   | ≤ 200 ms |

**Frame-trace gate (Risk register R1):** The TableEditor section toggle (open/close via PropertyPanel collapsible) must complete in **< 16 ms** as measured by Chrome DevTools frame trace in the plugin iframe. This is a blocking merge gate for the Sprint 4 TableEditor RC. The perf fix (T42.21: offset-based render + memoized truncation flags) must be applied before the first Sprint 4 RC build; the frame-trace measurement is owned by `plugin-tester`.

---

## Measurement methodology

Per ADR-0003 §Measurement methodology:

- **Bundle size:** `gzip -c <file> | wc -c`. Run after every RC build and post in the PR description. CI gate via a `check:bundle` npm script (to be added to `package.json` in Sprint 1 setup).
- **Bundle composition:** `rollup-plugin-visualizer` (devDependency). Run with `VISUALIZE=true pnpm build`; output to `dist/stats.html`. Required before opening any PR that adds a new dependency to either bundle.
- **Init paint:** Chrome DevTools Performance tab with 4× CPU throttle in the Figma desktop iframe. Use `performance.mark('plugin-open')` at `figma.showUI(...)` call and `performance.mark('first-paint')` at the `init` message handler in the ui. Captured by the e2e gauntlet.
- **Frame trace (TableEditor toggle):** Chrome DevTools Performance tab, record toggle interaction, inspect frame budget for the collapse/expand animation. Required in Sprint 4 PR for TableEditor section.

**CI gate:** the `validate.yml` workflow runs the `check:bundle` script on every PR. PRs that exceed budget fail CI. `plugin-tester` holds veto on any bypass.

---

## Hot paths — where bundle pressure is greatest

These are the modules with the highest risk of inflating the code-side bundle. Monitor via `rollup-plugin-visualizer` during their introduction sprint.

| Module                                     | Bundle side | Raw bytes (ext.)            | Sprint introduced | Risk                                                              |
| ------------------------------------------ | ----------- | --------------------------- | ----------------- | ----------------------------------------------------------------- |
| `code/editors/journey/renderer.ts`         | code        | 48,332                      | Sprint 4          | Dense geometry; ~13 KB gzip; no split opportunity on code side    |
| `code/editors/table/renderer.ts`           | code        | 25,803                      | Sprint 4          | Slot-based frame builder; ~8 KB gzip                              |
| Zod runtime (if used code-side)            | code        | 131,212 (v3/types.js alone) | Sprint 1          | ~13–21 KB gzip; optional — see reduction lever A                  |
| `packages/figma-api/` wrappers (6 modules) | code        | Est. 12–24 KB raw           | Sprint 1          | Small; ~3–5 KB gzip total                                         |
| `slide-machine.ts`                         | code        | 14,503                      | Sprint 1          | ~4.5 KB gzip; no optimization pressure                            |
| Lucide icon data (`@iconify-json/lucide`)  | ui          | Full JSON ~1,700 icons      | Sprint 2          | Dominant ui cost driver; must use manifest approach (ADR-0003 §1) |
| Nuxt UI v4 (full import)                   | ui          | —                           | Sprint 2          | 60–80 KB gzip if globally registered; tree-shake to ~15–25 KB     |
| cropperjs                                  | ui          | ~45 KB min.                 | Sprint 2          | Lazy-load only (ImageEditor async component)                      |
| `sections/JourneyEditor/`                  | ui          | —                           | Sprint 4          | Async component; lazy-load on `journeyModel !== null`             |
| `sections/TableEditor/`                    | ui          | —                           | Sprint 4          | Async component; lazy-load on `tableModel !== null`               |

**Chart absence note (ADR-0007):** `chart/bar.ts`, `chart/renderer.ts`, and `chart/types.ts` (19,218 bytes raw in the external build) are intentionally absent in v0.1.0. There is no `code/wrappers/ChartWrap.ts`. Their absence removes ~6–8 KB gzip from the code-side bundle compared to the external build.

---

## Reduction levers

### Code-side (owned by figma-api-engineer)

| Lever                                                  | Est. saving   | Sprint                    | Status                                         |
| ------------------------------------------------------ | ------------- | ------------------------- | ---------------------------------------------- |
| A. Hand-rolled type guards instead of Zod on code side | 13–21 KB gzip | Sprint 1 (decision point) | Pending Sprint 1 first build measurement       |
| B. Journey renderer — tree-shaking (no split)          | 0–2 KB gzip   | Sprint 4                  | Passive; monitor via visualizer                |
| C. Variables wrapper eager load (correct, no split)    | —             | Sprint 1                  | By design                                      |
| D. Slide-machine `skipInvisibleInstanceChildren`       | Latency only  | Sprint 1                  | Required for large-doc threshold               |
| E. Icon SVG data — code side clean (no action)         | —             | —                         | Confirmed: code side does not import icon data |

### UI-side (owned by ui-engineer)

See ADR-0003 §Per-layer reduction targets — ui-side for the full detail. Summary:

| Lever                                             | Est. saving                | Sprint            |
| ------------------------------------------------- | -------------------------- | ----------------- |
| 1. Lucide icon subset manifest (on-demand)        | 60–80 KB gzip              | Sprint 2          |
| 2. Nuxt UI v4 tree-shaking                        | 15–25 KB gzip              | Sprint 1/2 setup  |
| 3. Tailwind CSS v4 content purge                  | 5–10 KB gzip               | Sprint 0/1 config |
| 4. cropperjs lazy-loaded (async component)        | 25 KB gzip from initial    | Sprint 2          |
| 5. JourneyEditor split-loaded (async component)   | 15–20 KB gzip from initial | Sprint 4          |
| 6. TableEditor split-loaded (async component)     | 10–15 KB gzip from initial | Sprint 4          |
| 7. Vue 3 production build (`NODE_ENV=production`) | 2–5 KB gzip                | Sprint 0/1 config |

---

## Decision policy (from ADR-0003)

1. **Ratchet downward each release.** v0.2.0 must not exceed v0.1.0's actual measured gzipped size at release (not the budget).
2. **Budget delta requires its own ADR.** Any dependency adding > 50 KB gzip to either bundle requires an ADR before the PR merges.
3. **Per-sprint gate.** Every sprint RC posts gzip measurements in the PR description. PRs exceeding budget are blocked.

---

## Sprint 2 measurement (post-assembly)

**Measured:** 2026-05-05 — commit 2ca82e9 (PR #23, App.vue assembly, all 7 sections wired)
**Built with:** `pnpm --filter @figma-plugins/welder-editor build` (Vite 5.4.21, production)
**Measurement command:** `gzip -c dist/<artifact> | wc -c`

### Total measured sizes (gzipped)

| Artifact                | Measured (bytes) | Measured (KB) | Budget        | % of budget | Status |
| ----------------------- | ---------------- | ------------- | ------------- | ----------- | ------ |
| `dist/code.js`          | 10,807           | 10.55 KB      | 60 KB         | 17.6%       | PASS   |
| `dist/ui.js`            | 45,901           | 44.83 KB      | 250 KB        | 17.9%       | PASS   |
| `dist/ui.css`           | 2,442            | 2.38 KB       | (informative) | —           | —      |
| `dist/ui/index.html`    | 270              | 0.26 KB       | (informative) | —           | —      |
| `dist/lucide-subset.js` | 1,661            | 1.62 KB       | (informative) | —           | —      |
| `dist/messages.js`      | 58               | 0.06 KB       | (informative) | —           | —      |

`dist/ui.js` is the budgeted artifact. `dist/lucide-subset.js` is loaded on demand (dynamic import from IconPicker); it does not contribute to initial-load cost.

### Per-section breakdown (from rollup-plugin-visualizer, `dist/bundle-stats.html`)

These are per-module gzip estimates as reported by the visualizer. Individual-module estimates sum to ~82 KB; the actual combined bundle is 44.83 KB gzip because gzip compresses cross-module repeated patterns across the whole file. Use the actual measured total as the authoritative number; use this breakdown only to track proportional contributors.

**Runtime infrastructure (ui.js)**

| Module group                                                          | Gzip estimate |
| --------------------------------------------------------------------- | ------------- |
| Vue 3 runtime (@vue/shared + reactivity + runtime-core + runtime-dom) | ~44.3 KB      |
| @iconify/vue runtime                                                  | ~11.6 KB      |
| Pinia + pinia-plugin-persistedstate                                   | ~4.5 KB       |
| Vite module-preload + preload helpers                                 | ~1.3 KB       |

Note: the Vue 3 runtime per-module estimates (~44 KB) are larger than the entire measured ui.js bundle (44.83 KB) because gzip achieves significant cross-file savings at the full-bundle level. The runtime accounts for the dominant share of raw bytes; section code is proportionally small.

**Sections (ui.js)**

| Section                                                           | Gzip estimate |
| ----------------------------------------------------------------- | ------------- |
| SlidePicker                                                       | ~1.5 KB       |
| TabStrip                                                          | ~1.5 KB       |
| PropertyPanel                                                     | ~1.2 KB       |
| TitleDescriptionEditor                                            | ~1.3 KB       |
| BadgeEditor                                                       | ~1.1 KB       |
| IconPicker (icons.ts + Vue component; excl. @iconify/vue runtime) | ~2.2 KB       |
| ImageEditor (ImageEditor.vue + CropperCanvas.vue + cropMath.ts)   | ~5.5 KB       |

**Components + App assembly (ui.js)**

| Module group                                        | Gzip estimate |
| --------------------------------------------------- | ------------- |
| Components (FormGroup + InputField + StatusMessage) | ~0.8 KB       |
| App.vue + main.ts + useEditorStore + composables    | ~5.5 KB       |

**Code-side (code.js) — full bundle 10.55 KB gzip**

| Module group                                                                    | Gzip estimate |
| ------------------------------------------------------------------------------- | ------------- |
| packages/figma-api (router + selection + fonts + mutate + progress + variables) | ~1.8 KB       |
| code/ logic (slide-machine + 7 wrappers + icon-swap + persistence + main)       | ~17.1 KB      |

The combined file compresses to 10.55 KB; cross-module repetition (shared type-guard patterns across wrappers, shared imports from slide-machine) drives substantial savings.

### Comparison vs ADR-0003 budgets and stretch targets

| Artifact       | Measured | Hard budget | Stretch target | vs hard budget | vs stretch     |
| -------------- | -------- | ----------- | -------------- | -------------- | -------------- |
| `dist/code.js` | 10.55 KB | 60 KB       | 40 KB          | 82.4% headroom | 73.6% headroom |
| `dist/ui.js`   | 44.83 KB | 250 KB      | 200 KB         | 82.1% headroom | 77.6% headroom |

Both artifacts beat the stretch targets by a wide margin at Sprint 2 close.

### Headroom remaining for Sprint 3+ sections

Sprint 3 and 4 will add: CardList, CardEditor, TimelineEditor, TableEditor, JourneyEditor.

ADR-0003 estimated these at:

- TableEditor (async component, Sprint 4): ~10–15 KB gzip savings when split-loaded; before split, adds ~8 KB raw render/slot code
- JourneyEditor (async component, Sprint 4): ~15–20 KB gzip savings when split-loaded; before split, adds ~13 KB raw
- CardList + CardEditor + TimelineEditor (Sprint 3): no split planned; estimated ~6–10 KB gzip total addition to ui.js

Worst-case estimate for Sprint 4 close (before lazy-loading TableEditor and JourneyEditor): ui.js may reach ~65–75 KB gzip. This remains well under the 200 KB stretch target and under 30% of the 250 KB hard budget. If lazy-loading is applied per ADR-0003 §lever 5 and 6, Sprint 4 initial-load ui.js should stay below ~55 KB gzip.

### Reduction levers exercised in Sprint 1 and Sprint 2

These decisions are already locked in and reducing bundle size relative to the external baseline:

- **Hand-rolled type guards instead of Zod on code-side** (lever A): Zod runtime (~13–21 KB gzip) is absent from code.js. Confirmed by visualizer — no Zod entry.
- **Dynamic-import icon manifest** (lever 1): `lucide-subset.js` is 1.62 KB gzip and loaded on demand. Not part of the initial-load budget.
- **Native HTML in sections instead of Nuxt UI** (Sprint 2 retro item): sections use native `<input>`, `<select>`, `<button>` — no Nuxt UI component imports appear in the visualizer. This is the primary reason ui.js is 44.83 KB rather than the ADR-estimated 60–80 KB for a Nuxt UI-heavy bundle. The tradeoff: sections need manual accessibility wiring (labels, ARIA, focus management), which is a Sprint 2 retro audit item for ui-engineer.
- **cropperjs not present** (lever 4): cropperjs is absent from ui.js. ImageEditor uses a custom canvas-based CropperCanvas.vue (3.3 KB gzip). This differs from the ADR-0003 assumption of using the cropperjs library (~25 KB gzip); actual cost is ~13x lower.
- **Vue 3 production build** (lever 7): NODE_ENV=production confirmed; devtools-api is tree-shaken out of the production bundle.

### Levers NOT yet exercised (reserved for later sprints)

- **Nuxt UI v4 tree-shaking** (lever 2): Nuxt UI is not currently imported into sections. If added for a future section, tree-shaking must be verified via visualizer before merge.
- **Tailwind CSS v4 content purge** (lever 3): Tailwind purge is handled by Vite automatically; `dist/ui.css` is 2.38 KB gzip — confirmed minimal.
- **JourneyEditor split-loading** (lever 5): async component; apply in Sprint 4 when JourneyEditor is introduced.
- **TableEditor split-loading** (lever 6): async component; apply in Sprint 4 when TableEditor is introduced.

### Next update

Re-measure after Sprint 4 close. Sprint 4 adds the heaviest editors (TableEditor + JourneyEditor). The frame-trace gate for TableEditor toggle (< 16 ms per T42.21) is a hard merge gate for the Sprint 4 TableEditor RC; document results in this section at that time.

---

## Sprint 3 measurement (post-Wave-2, pre-App.vue wiring)

**Measured:** 2026-05-05 — commit fbaf5ad (PR #29, CardEditor added; Sprint 3 sections not yet wired into App.vue)
**Built with:** `pnpm --filter @figma-plugins/welder-editor build` (Vite 5.4.21, production — `vite build && vite build --config vite.code.config.ts`)
**Measurement command:** `gzip -c dist/<artifact> | wc -c` (raw byte output)

### Total measured sizes (gzipped)

| Artifact                | Measured (bytes) | Measured (KB) | Budget        | % of budget | Status |
| ----------------------- | ---------------- | ------------- | ------------- | ----------- | ------ |
| `dist/code.js`          | 10,821           | 10.57 KB      | 60 KB         | 17.6%       | PASS   |
| `dist/ui.js`            | 45,508           | 44.44 KB      | 250 KB        | 17.8%       | PASS   |
| `dist/ui.css`           | 2,320            | 2.27 KB       | (informative) | —           | —      |
| `dist/ui/index.html`    | 240              | 0.23 KB       | (informative) | —           | —      |
| `dist/lucide-subset.js` | 1,661            | 1.62 KB       | (informative) | —           | —      |

No `dist/messages.js` chunk present. `dist/code.js` confirmed to start with `var st=` (single-file IIFE; no import/export regression).

### Delta vs Sprint 2 final measurement (PR #23, commit 2ca82e9)

| Artifact                | Sprint 2 (bytes) | Sprint 3 (bytes) | Delta | Direction    |
| ----------------------- | ---------------- | ---------------- | ----- | ------------ |
| `dist/code.js`          | 10,807           | 10,821           | +14   | Flat (+0.1%) |
| `dist/ui.js`            | 45,901           | 45,508           | −393  | Down (−0.9%) |
| `dist/lucide-subset.js` | 1,661            | 1,661            | 0     | Unchanged    |
| `dist/ui.css`           | 2,442            | 2,320            | −122  | Down (−5.0%) |

### Comparison vs ADR-0003 budgets and stretch targets

| Artifact       | Measured | Hard budget | Stretch target | vs hard budget | vs stretch     |
| -------------- | -------- | ----------- | -------------- | -------------- | -------------- |
| `dist/code.js` | 10.57 KB | 60 KB       | 40 KB          | 82.4% headroom | 73.6% headroom |
| `dist/ui.js`   | 44.44 KB | 250 KB      | 200 KB         | 82.2% headroom | 77.8% headroom |

Both artifacts beat the stretch targets by a wide margin.

### What changed and why

Sprint 3 merged four PRs since the Sprint 2 measurement: CardList (PR #26), section migration of SlidePicker / TitleDescription / BadgeEditor / IconPicker to `components/src/` primitives (InputField + FormGroup + StatusMessage, PR #27), the build-split hotfix emitting code.js as a single-file IIFE (PR #28), and CardEditor composing TitleDescription + IconPicker + ImageEditor (PR #29). Despite adding two new sections (CardList and CardEditor), the ui bundle shrank by 393 bytes gzip. The section migration in PR #27 reduced duplication inside the section modules by unifying shared primitives (FormGroup, InputField, StatusMessage) — cross-section repetition that was previously inlined separately in each section now compresses more aggressively at the bundle level because gzip sees the shared patterns once. CardList and CardEditor are NOT yet wired into App.vue (that wiring is Sprint 3 task 3.4); they exist only in `sections/` and are absent from the current App.vue import tree, which is why they do not appear in the ui bundle measurement. The code.js delta of +14 bytes is rounding noise; the code-side had no functional changes in Sprint 3.

### Next update

Re-measure after Sprint 3 task 3.4 (App.vue wiring of CardList + CardEditor) and at Sprint 4 close when TableEditor and JourneyEditor are introduced. CardList + CardEditor wiring is expected to add ~2–4 KB gzip to ui.js (within the ~6–10 KB Sprint 3 estimate from the Sprint 2 headroom analysis). The frame-trace gate for TableEditor toggle (< 16 ms per T42.21) remains the hard merge gate for the Sprint 4 TableEditor RC.
