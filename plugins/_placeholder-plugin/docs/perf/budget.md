# \_placeholder-plugin — performance budget

**Status:** Placeholder (post-import; needs gzipped re-measurement)
**Date:** 2026-05-06
**Owners:** figma-api-engineer (code-side), ui-engineer (ui-side)

This is the day-to-day reference for performance budgets on `_placeholder-plugin`. The numbers below are placeholder budgets carried over from the imported zip — they are **raw (non-gzipped) bytes** and they are NOT the canonical budget. Before the next release, a canonical gzipped pass must be run and ratified in a budget ADR (model after ADR-0003 and ADR-0014 for `welder-editor`).

---

## Build architecture (chunked-text-loader)

This plugin reuses the chunked-text-loader pattern carried over from the external scaffold. It is the same pattern called out in `learnings/anti-patterns/0002-figma-plugin-load-debugging.md` (originally referred to in the import brief as "anti-pattern 0004"). Quoting the anti-pattern:

> "The external build's chunked-text-loader approach (embedding ui.html as JS string literals inside code.js) is an alternative but adds unnecessary complexity — the `__html__` global approach via `manifest.ui` is cleaner."

In `welder-editor` the team chose to drop the chunked loader and use `vite-plugin-singlefile` + `__html__` instead. This plugin retains the chunked loader **for now** because the external build was working and the import was non-destructive. Replacing it is part of `T_REFACTOR_LAYOUT` (see the import ADR).

How the loader works in this plugin:

- `vite.config.ts` builds `widget-src/ui/index.html` into a single-file `dist/ui.html` (~1.577 MB raw at v0.2.1).
- `esbuild.config.mjs` bundles `widget-src/code.ts` to `dist/code.js`, then a `chunkedTextLoader` plugin reads `dist/ui.html`, splits it into ~60 KB string chunks, and inlines those chunks into `dist/code.js` (~1.756 MB raw at v0.2.1).
- At runtime, `dist/code.js` reassembles the chunks and passes the concatenated HTML to `figma.showUI(html, opts)`.

Reason for the 60 KB chunk size: Figma's plugin sandbox parser has a string-literal size limit; literals beyond ~64 KB cause "Syntax error" failures. Splitting at 60 KB keeps each literal under the limit with safety margin.

---

## Bundle-size budget (PLACEHOLDER, raw bytes)

| Artifact       | Placeholder budget | Imported v0.2.1 (raw) | Canonical budget    |
| -------------- | ------------------ | --------------------- | ------------------- |
| `dist/code.js` | **≤ 2200 KB raw**  | 1,756,471 bytes raw   | TBD — gzipped + ADR |
| `dist/ui.html` | **≤ 1700 KB raw**  | 1,577,390 bytes raw   | TBD — gzipped + ADR |

`dist/ui.html` is a build-intermediate after the chunked-text-loader inlines it into `dist/code.js`. Figma loads only `dist/code.js` and (per `manifest.json`'s `"ui": "dist/ui.html"`) the iframe HTML — but in the chunked-loader architecture the canonical iframe HTML at runtime comes from the in-`code.js` chunks, not from a fetched `dist/ui.html`. Both are gated to flag drift in either path.

### Why these are placeholders

The org convention (per `plugins/welder-editor/docs/perf/welder-editor.md` and ADR-0003) is **minified + gzipped** budgets. Raw-byte numbers are unreliable as a quality signal — gzip can compress repeated patterns aggressively (the chunked-text-loader produces a lot of repeated chunk-stitching scaffolding), and a 1.7 MB raw file might be ~280 KB gzip or might not. Without the gzipped measurement, we cannot tell.

### Measurement command (to run before next release)

```sh
# From plugins/_placeholder-plugin/
npm run build           # builds dist/code.js + dist/ui.html
gzip -c dist/code.js  | wc -c
gzip -c dist/ui.html  | wc -c
```

Post results here, then file a budget ADR in `plugins/_placeholder-plugin/docs/adr/` (plugin-scoped — per CLAUDE.md plugin-scoped ADRs go under the plugin's `docs/adr/`, not the top-level `docs/adr/`).

---

## Init-paint budget

| Operation                                | Budget       | Notes                                              |
| ---------------------------------------- | ------------ | -------------------------------------------------- |
| Plugin open → first paint (slide picker) | **≤ 200 ms** | Canonical device: Figma desktop, macOS arm64.      |
| User-input → optimistic ui update        | **≤ 16 ms**  | One frame. Bound in ui; no message-bus round-trip. |

The 200 ms is the CLAUDE.md default and is restated in `plugin.toml` as `init_paint_ms_budget = 200`.

---

## Per-edit latency budgets

See `../threading/overview.md §"Latency budgets"` for the table. Summary:

| Operation                                    | Budget   |
| -------------------------------------------- | -------- |
| Plugin open → first paint                    | ≤ 200 ms |
| `pick-slide` → `slide-loaded`                | ≤ 500 ms |
| `update-*` → `target-updated` (single field) | ≤ 500 ms |
| `upload-image` bytes → `target-updated`      | ≤ 1 s    |

These are pre-monorepo numbers from the prior perf investigation (`../../.reviews/perf-investigation-2026-04-26.md`) and `spec.md` §6. Re-validate in the canonical e2e gauntlet before the next release.

---

## Hot paths

The dominant ui-side weight at v0.2.1, lifted from the imported `.reviews/perf-investigation-2026-04-26.md` (verify with `rollup-plugin-visualizer` after the layout refactor):

- **Nuxt UI v4 (full bundle)** — primary ui weight; tree-shaking opportunity once components are itemized.
- **Lucide icon set (`@iconify-json/lucide`)** — full set imported. Manifest-based subset is the welder-editor pattern (ADR-0003 §lever 1) and applies here too.
- **cropperjs + vue-picture-cropper** — image cropping; lazy-load-only candidate.
- **chart-core (CSV parser + chart renderers)** — required for the Graphs tab; consider async chunk.
- **Chunked-text-loader scaffolding inside `dist/code.js`** — eliminated by switching to `__html__` + `vite-plugin-singlefile`. Until the loader is replaced, this is a structural code-side overhead.

---

## Reduction levers (post-refactor)

Most of the welder-editor reduction levers (ADR-0003) apply directly:

- Drop the chunked-text-loader → `__html__` + `vite-plugin-singlefile` (eliminates the inlining overhead from `dist/code.js`).
- Lucide icon subset manifest (60–80 KB gzip).
- Nuxt UI v4 tree-shaking (15–25 KB gzip).
- Tailwind CSS v4 content purge (5–10 KB gzip).
- cropperjs lazy-load (~25 KB gzip from initial paint).
- Vue 3 production build via `NODE_ENV=production` (2–5 KB gzip).
- Async-load JourneyEditor and TableEditor (10–20 KB gzip each from initial paint).

Apply these as part of the post-refactor budget ADR; do not apply them piecemeal during the deviation window unless there is a P0 reason.

---

## Decision policy

1. **Ratchet downward each release.** v0.2.2 must not exceed v0.2.1's measured size after the gzipped re-measurement and ratifying ADR is in place.
2. **Budget delta requires its own ADR.** Any dependency adding > 50 KB gzip to either bundle requires an ADR before the PR merges.
3. **Per-sprint gate.** Every sprint RC posts gzip measurements in the PR description. PRs exceeding budget are blocked.
4. **Until the gzipped re-measurement lands**, treat any growth in raw bytes vs the imported v0.2.1 baseline as a soft signal and escalate to project-pm before merging.

---

## Pointers

- Imported perf investigation: `../../.reviews/perf-investigation-2026-04-26.md`
- Canonical-layout sibling perf budget: `plugins/welder-editor/docs/perf/welder-editor.md`
- Chunked-text-loader anti-pattern: `learnings/anti-patterns/0002-figma-plugin-load-debugging.md`
- Top-level perf doctrine: `docs/perf/` (when populated by `figma-api-engineer` / `ui-engineer`)
