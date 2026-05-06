# Sprint 4 retro — welder-editor (S2026-W22-W24)

**Plugin:** welder-editor
**Sprint:** 4 (S2026-W22-W24)
**Sprint Monday item:** 2894068169
**Retro Monday item:** MON-2894039259 (TDEV-074)
**Author:** project-pm
**Date:** 2026-05-05
**Status:** final

---

## 1. Sprint summary

Sprint 4 closed 10 planned PRs plus 1 unplanned R10 hotfix. The Graphs tab is wired in `App.vue` with two composite sections (TableEditor, JourneyEditor); a csv-schema foundation, a parity harness, frame-trace perf gate, and final bundle re-measurement all landed. `pnpm test` reports 244 passing.

| Task       | PR  | Outcome                                                                              |
| ---------- | --- | ------------------------------------------------------------------------------------ |
| 4.5        | #38 | sections/TableEditor csv-schema (zod-based, 30 tests, 1.8 KB gzip)                   |
| 4.2        | #39 | sections/JourneyEditor a11y rewrite, 33 tests, axe clean across 5 states             |
| 4.1        | #40 | sections/TableEditor (T42.21 perf fix — Findings 1+3 — 45 tests + perf gate)         |
| 4.10       | #41 | components extraction pass — no candidates met ≥2+1 rule (learnings/0002)            |
| 4.7        | #42 | golden-snapshot parity harness (R10 mitigation) — surfaced 8 drift rows              |
| 4.3        | #43 | App.vue Graphs tab wiring + InputField axe fix (24 new tests)                        |
| R10 hotfix | #44 | TableWrap+JourneyWrap reverted to v0.2.1 constants (Path A; 6/6 parity pass)         |
| 4.8        | #45 | Final bundle re-measurement: code.js 10.83 KB (82% headroom), ui.html 68.23 KB (73%) |
| 4.4        | #46 | Frame-trace perf gate CI (R1 enforcement, 7.8x headroom on 16 ms gate)               |
| 4.6        | #47 | Cross-section integration tests (19 new cases, 244 total)                            |
| 4.9        | —   | RC e2e gauntlet runbook (manual run pending; dispatched parallel with 4.11)          |

**Did not ship:** the Sprint 4 manual e2e gauntlet run (4.9) — runbook lands alongside this retro; the actual screenshots-in-Figma sign-off rolls into v0.2.0 RC.

## 2. What went well

- **R1 perf gate WORKED in CI.** TableEditor toggle measured 2.06 ms max vs 16 ms budget — the entire reason for the rebuild is now mitigated and CI-enforced (PR #46). 7.8x headroom; regression cliff is a hard fail, not a code review opinion.
- **R10 parity gate caught real drift.** Task 4.7's harness (PR #42) found 8 rows of accidental regression in TableWrap+JourneyWrap dating back to Sprint 1's section lift; Path A revert (PR #44) restored byte-equivalent v0.2.1 output and all 6/6 parity tests pass.
- **Bundle headroom held large.** code.js 10.83 KB (82% headroom on 60 KB budget), ui.html 68.23 KB (73% headroom on 250 KB budget) — measured on the final Sprint 4 build (PR #45).
- **Cross-section integration found a real WCAG bug.** Task 4.6 work surfaced an `aria-allowed-attr` violation in InputField, fixed inline in PR #43; net axe-clean across all five rendered surfaces.
- **0 net new heavy dependencies.** csv-schema's tokenizer is 45 LOC; no papaparse pulled. zod was already in tree. Discipline held against speculative deps.

## 3. What didn't go well

- **Worktree fall-through recurred ≥6 times in Sprint 4 alone.** Sprint 3 retro flagged this; A3 lefthook hook (filed as MON-2894170625) was the carry-forward and is **still not implemented**. Sprint 4 paid the cost six times. This is now a Sprint 3 prediction that came true and a Sprint 4 prediction that will come true again unless A3 lands before any further code work.
- **R10 drift discovered LATE.** Sprint 1 section lift introduced byte-level drift at commit `c1ef6c5` (2026-04). Three sprints elapsed before Task 4.7 built the parity harness that detected it. Parity harnesses are not a Sprint-4 polish task — they are foundational tooling that should sit alongside any cross-cutting refactor.
- **4.0 JOURNEYITEM_KEY_FALLBACK seed remains unfiled.** Flagged in PR #39's title; the figma-api-engineer follow-up is documented in PR commentary but not yet a Monday item. Audit-trail gap.
- **Multiple agents missed the canonical renderer path.** Several Sprint 4 tasks searched `code/editors/` for the renderer functions when the canonical location is `code/wrappers/`. Documentation drift between the rebuild plan and current repo structure cost time on three separate tasks.

## 4. Lessons — bake into v0.2.0 process

- **Implement A3 fall-through hook before any v0.2.0 code work.** Six-incident pattern across one sprint is a process failure, not a discipline failure. Block on it.
- **Add manifest+code structural validator extension (A1, deferred from Sprint 3).** Sprint 3's IIFE+inline P0s should never have shipped; the equivalent for Sprint 4 would have caught the R10 drift earlier had a parity gate run on Sprint 1's PR.
- **Document actual repo structure in `CLAUDE.md`.** Specifically the `code/wrappers/` vs `code/editors/` distinction. Path-doc drift is cheap to fix and expensive to repeat.
- **Parity harnesses are foundational, not optional.** Any future refactor that lifts code across module boundaries ships with a parity harness in the same PR — not three sprints later.

## 5. Action items for v0.2.0

| #   | Action                                                                                       | Owner Agent        | Monday item                                          |
| --- | -------------------------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------- |
| B1  | Implement lefthook worktree-fall-through warn check (carry-forward of Sprint 3 A3)           | figma-api-engineer | _filed in v0.2.0 planning — see Monday filing below_ |
| B2  | File JOURNEYITEM_KEY_FALLBACK seed task (4.0 carry-forward)                                  | figma-api-engineer | _filed in v0.2.0 planning_                           |
| B3  | Document `code/wrappers/` canonical path + remove stale `code/editors/` references in docs   | project-pm         | _filed in v0.2.0 planning_                           |
| B4  | Extend `tools/validate_manifest.py` with manifest+code structural checks (Sprint 3 A1 carry) | figma-api-engineer | _filed in v0.2.0 planning_                           |
| B5  | Run the Sprint 4 manual e2e gauntlet (4.9 carry-forward) and attach Figma-desktop evidence   | plugin-tester      | _existing item from 4.9 — confirm in §6_             |

**Monday filing note.** This retro is shipping under MON-2894039259. Action items B1–B4 are filed during v0.2.0 planning by `project-pm` on Monday workspace 6325546, board 5095865862 (Tasks). Each gets `Owner Agent` set per the table and a `Linked Sprint` to the v0.2.0 sprint when that sprint is created. B5 reconciles against the existing 4.9 task. Filing is gated on `MONDAY_API_TOKEN` availability on the runner; if filing is blocked, IDs are attached as a comment on this retro item once restored.

## 6. Monday hygiene

| Task | Expected status                                 |
| ---- | ----------------------------------------------- |
| 4.0  | Done                                            |
| 4.1  | Done                                            |
| 4.2  | Done                                            |
| 4.3  | Done                                            |
| 4.4  | Done                                            |
| 4.5  | Done                                            |
| 4.6  | Done                                            |
| 4.7  | Done                                            |
| 4.8  | Done                                            |
| 4.9  | In Progress (manual gauntlet run pending)       |
| 4.10 | Done                                            |
| 4.11 | Done (after this retro PR merges and is synced) |

Reconcile against the Tasks board after the retro PR merges. If sync drift is observed, log in `runbooks/monday-workflow.md` §"Drift" per the canonical reconciliation procedure.

---

**Cross-references:**

- `learnings/anti-patterns/0001-figma-api-engineer-app-vue-cross-domain.md` (cross-domain anti-pattern)
- `learnings/anti-patterns/0002-figma-plugin-load-debugging.md` (Sprint 3 P0 root cause)
- `learnings/patterns/0002-no-extraction-warranted-sprint-4.md` (Task 4.10 deferral)
- `plugins/welder-editor/docs/perf/welder-editor.md` (Sprint 4 bundle re-measurement evidence)
- `plugins/welder-editor/validation/e2e/` (Graphs tab gauntlet runbook, dispatched in parallel)
- `docs/sprint-retros/welder-editor-2026-W19-W21-sprint-3.md` (prior retro, A3 carry-forward source)
- `runbooks/monday-workflow.md` §6 (sprint cadence)
- `runbooks/release-candidate-checklist.md` (target for the smoke-import gate update from Sprint 3 A2)
