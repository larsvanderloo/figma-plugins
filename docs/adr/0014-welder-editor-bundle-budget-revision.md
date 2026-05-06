# ADR-0014 — Welder Editor: Bundle Budget Revision (ui-side 250 KB → 320 KB gzip)

**Status:** Accepted
**Supersedes:** ADR-0003 (ui-side budget only; code-side budget unchanged)
**Date:** 2026-05-05
**Author:** figma-api-engineer
**Sprint:** Sprint 5 — Wave 1 Foundation
**Monday item:** MON-2894473085

---

## Context

ADR-0003 set the following gzip budgets for `plugins/welder-editor`:

| Artifact                          | Budget        |
| --------------------------------- | ------------- |
| `dist/code.js`                    | ≤ 60 KB gzip  |
| `dist/ui.html` (via `dist/ui.js`) | ≤ 250 KB gzip |

The 250 KB ui-side budget was calibrated against the Sprint 4 final build: **68.23 KB gzip** (the plugin was using native HTML sections with no component library).

ADR-0013 adds Nuxt UI v4 + Tailwind v4 + the full Lucide icon collection (registered offline via `@iconify-json/lucide`) + `vue-picture-cropper` + `cropperjs`. The v0.2.1 reference build (which uses the same full Nuxt UI v4 stack) measures:

| Build                                                              | `ui.html` gzip (estimated) |
| ------------------------------------------------------------------ | -------------------------- |
| v0.2.1 (full Nuxt UI v4, Tailwind v4, Lucide, vue-picture-cropper) | ~280 KB                    |
| v0.1.0 Sprint 4 final (native HTML, no component library)          | 68.23 KB                   |

The 250 KB budget will be exceeded the moment the Nuxt UI v4 runtime is fully wired (task 5.1 + 5.2). Shipping with a budget the team knows will be busted is a process failure; this ADR corrects it.

---

## Decision

Revise the **ui-side gzip budget** from **250 KB** to **320 KB**.

Rationale:

- v0.2.1 benchmark: ~280 KB gzip (full Nuxt UI v4 + Tailwind v4 + Lucide + cropper)
- 320 KB provides ~14% headroom over the v0.2.1 benchmark, which is enough for additional sections not present in v0.2.1 (TimelineEditor, JourneyEditor have no equivalent in the reference).
- The trade is worthwhile: 320 KB gzip delivers WCAG 2.1 AA-compliant primitives + brand identity + offline icon coverage + polished cropper UX, replacing ~130 hand-rolled UI components.
- Plugin iframes are loaded once and cached; the extra ~250 KB raw is amortised across the session.

The **code-side budget** (60 KB gzip) is **unchanged**. ADR-0013's rewire does not touch `code/`.

---

## Measurement commitment

Sprint 5 Wave 4 (`plugin-tester` scope) will:

1. Run `pnpm --filter @figma-plugins/welder-editor build` on a clean checkout after all Wave 1–3 work lands.
2. Measure `gzip -c dist/ui.html | wc -c` and record the result in `docs/perf/welder-editor.md`.
3. If over **320 KB**: apply the following mitigations before revising the budget again:
   - Lazy-load `vue-picture-cropper` + `cropperjs` (~25 KB gzip savings) — only the ImageEditor section needs them; dynamic `import()` on first open.
   - Use an `@iconify-json/lucide` subset (~20 KB savings) — enumerate only the icon names actually used in sections; tree-shake the rest via a build-time filter.
4. If still over 320 KB after mitigations: file ADR-0015 with measurements.

---

## CI gate update

The `bundle-size` job in `.github/workflows/validate.yml` gates against the budget. After this ADR:

- Code-side gate: `dist/code.js` ≤ 60 KB gzip (unchanged)
- Ui-side gate: `dist/ui.html` (or `dist/ui.js` as measured) ≤ 320 KB gzip (revised)

The CI YAML update is part of the Sprint 5 Wave 4 scope (post-rewire re-validation). The gate is not updated in this ADR's commit because `dist/ui.html` will not exist until task 5.1 lands and the full Nuxt UI v4 install is wired — updating the gate before that would fail CI on the interim build.

---

## References

- ADR-0003 — original bundle budget (this ADR supersedes the ui-side clause only)
- ADR-0013 — Nuxt UI v4 recovery (the change that necessitates this revision)
- `docs/research/welder-editor-v0.2.0-frontend-rewire.md` §2 — bundle benchmark table
- `docs/perf/welder-editor.md` — per-sprint measurements (updated in Wave 4)
