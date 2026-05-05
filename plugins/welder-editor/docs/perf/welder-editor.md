# welder-editor — performance budget

**Status:** Active (Sprint 0, v0.1.0)
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
| `dist/ui.html` | **≤ 250 KB gzipped** | 339 KB gzip                   | Stretch target: ≤ 200 KB  |

**Stretch targets** (achievable with the reduction levers in ADR-0003):

| Artifact       | Stretch target   |
| -------------- | ---------------- |
| `dist/code.js` | ≤ 40 KB gzipped  |
| `dist/ui.html` | ≤ 200 KB gzipped |

### Structural note on the code-side baseline

The external build's `dist/code.js` reports 1,756,471 bytes raw / 362,838 bytes gzip. These numbers are **not** the baseline for the monorepo budget. The external build uses a custom esbuild `chunked-text-loader` that embeds the entire `dist/ui.html` as chunked string literals inside `code.js` (to work around a Figma sandbox parser limit on large string literals). Subtracting the ui.html contribution (1,577,390 bytes raw / 339,105 bytes gzip, separately measured), the actual code-side logic from the external build is ~179 KB raw / ~24 KB gzip.

The monorepo uses `figma.showUI(__html__, ...)` where `__html__` is Figma's built-in template variable; the iframe HTML is delivered via `manifest.json`'s `"ui"` field and is not embedded in `code.js`. The monorepo `code.js` therefore contains only the TypeScript sandbox logic, making the external ~24 KB gzip the correct comparison point.

**Measurement command (monorepo, from `plugins/welder-editor/`):**

```sh
pnpm build
# code-side
gzip -c dist/code.js | wc -c
# ui-side
gzip -c dist/ui.html | wc -c
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
