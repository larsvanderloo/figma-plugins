# Sprint 3 retro — welder-editor (S2026-W19-W21)

**Plugin:** welder-editor
**Sprint:** 3 (S2026-W19-W21)
**Sprint Monday item:** 2893968879
**Retro Monday item:** MON-2893969503 (TDEV-062)
**Author:** project-pm
**Date:** 2026-05-05
**Status:** final

---

## 1. Sprint summary

Sprint 3 closed 9 planned PRs plus 2 unplanned P0 hotfixes. The Content tab is wired in `App.vue` with three composite sections (CardList, CardEditor, TimelineEditor) all built atop Sprint 2's components/sections library; `pnpm test` reports 195 passing.

| Task | PR  | Outcome                                                                              |
| ---- | --- | ------------------------------------------------------------------------------------ |
| 3.0  | #27 | Section migration to `components/src/` primitives (4 sections converted)             |
| 3.1  | #26 | sections/CardList — read-only list, 36 tests, axe-clean                              |
| 3.2  | #29 | sections/CardEditor — composes TDE+IconPicker+ImageEditor, 31 tests                  |
| 3.3  | #32 | sections/TimelineEditor — mixed Card+CopyWrap items, 34 tests                        |
| 3.4  | #34 | App.vue Content tab wired with CardList+CardEditor+TimelineEditor, +15 tests         |
| 3.5  | #36 | Cross-section integration tests, +16 tests; total now 195 passing                    |
| 3.6  | #30 | ui-side bundle re-measurement: PASS, ~80% headroom on both code+ui                   |
| 3.7  | #35 | E2E gauntlet runbook for Content tab (manual run remains user task; status: pending) |
| 3.8  | #31 | Components extraction pass — no candidates met the ≥2-call+1-pending rule, deferred  |
| HF   | #28 | code.js IIFE single-file (P0 — plugin couldn't load in Figma without it)             |
| HF   | #33 | ui.html single-file via `vite-plugin-singlefile` (P0 — same load failure class)      |

**Did not ship:** the manual e2e gauntlet run from 3.7 — runbook is in `plugins/welder-editor/validation/e2e/`, but the actual screenshots-in-Figma-desktop sign-off is still outstanding and rolls into Sprint 4.

## 2. What went well

- **Library-first sequencing paid off.** Every Sprint 3 section composed Sprint 2's primitives + sections without rewriting. CardEditor (3.2) is literally `<TitleDescriptionEditor> + <IconPicker> + <ImageEditor>` glue; TimelineEditor (3.3) reuses CardEditor and a CopyWrap variant. Zero duplicate Vue logic introduced this sprint.
- **3.6 measurement showed Sprint 2's section migration (PR #27) actually shrunk `ui.js` gzip by ~400 bytes** via better gzip pattern compression once primitives were unified. Refactor work paid for itself in bundle savings — the rare case where consolidation is also a win at the byte level.
- **3.8 deferral was the right call.** Discipline held: the extraction PR shipped a docs note explaining no candidates met the ≥2-call+1-pending rule, instead of forcing premature abstraction to "tick the box." Audit-trail entry over speculative scaffolding.
- **Auto-merge cadence held.** 9 PRs landed in roughly an hour of wall-clock with zero merge conflicts on `pnpm-lock.yaml` — the merge driver from PR #19 paid off as designed when section-by-section work converged.

## 3. What didn't go well

- **The plugin didn't actually load in Figma until end of sprint.** Despite earlier "it should work" reports, two distinct load-blockers shipped to main and were only caught during a real Figma-desktop import: (a) `code.js` was emitted as an ES module rather than IIFE because Vite's multi-entry rollup default split `shared/messages.ts` into a separate chunk; (b) `ui/index.html` referenced `/ui.js` and `/ui.css` as separate files but Figma's iframe sandbox runs in a `data:`-URL context with no origin server. Both should have been caught by the e2e gauntlet — they weren't, because nobody actually loaded the plugin in Figma desktop. Root cause documented in `learnings/anti-patterns/0002-figma-plugin-load-debugging.md`. PR #28 (IIFE) and PR #33 (single-file UI) are the corresponding hotfixes.
- **Worktree fall-through recurred at least once** — the parent process briefly ended up on the 3.5 feature branch instead of an isolated tmp worktree. Same anti-pattern class as `learnings/anti-patterns/0001-...-cross-domain.md` describes for cross-domain edits, but the trigger (working in the wrong tree) is mechanical rather than authority-based. 0001 doesn't cover this trigger; a new note is warranted in Sprint 4.
- **No automated way to verify "plugin loads in Figma."** The full test suite, axe scan, and `tools/validate_manifest.py` all passed with both load-blockers in place. Static checks on build artifacts caught nothing because the bugs live at the boundary between Vite's output shape and Figma's runtime expectations — invisible to per-file linters.

## 4. Lessons — bake into Sprint 4 process

- **Mandatory smoke-import gate per sprint.** From Sprint 4 onward, every sprint includes "load the plugin in Figma desktop" as a step at the **start** of the close-PR review, not the end. `plugin-tester` only signs off `validation: pass` after actually loading. Codify in `runbooks/release-candidate-checklist.md`.
- **Build-artifact static checks must include Figma-runtime constraints.** `tools/validate_manifest.py` should also verify (a) `dist/code.js` head doesn't begin with `import`/`export`, (b) the manifest `ui` HTML contains no external `<script src=>` or `<link href=>`. Cheap to implement; would have caught both Sprint 3 P0s pre-merge.
- **Worktree fall-through detection.** Add a `git status` check in the lefthook pre-commit that warns if the working tree is the coordinator (`nice-shirley-c63acc` or any non-`agent-*` worktree) and the staged change touches production paths (`plugins/`, `sections/`, `components/`). Warning, not block — the audit signal is what matters.

## 5. Action items for Sprint 4

| #   | Action                                                                                      | Owner Agent                                  | Monday item                                                                      |
| --- | ------------------------------------------------------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------- |
| A1  | Extend `tools/validate_manifest.py` with build-artifact runtime constraints (IIFE + inline) | figma-api-engineer                           | _to be filed in Sprint 4 planning (project-pm) — see "Monday filing" note below_ |
| A2  | Add Figma-desktop import smoke step to the close-PR e2e gauntlet entry                      | plugin-tester                                | _to be filed in Sprint 4 planning (project-pm)_                                  |
| A3  | Document worktree-fall-through recovery + lefthook pre-commit warn check                    | project-pm (doc) + figma-api-engineer (hook) | _to be filed in Sprint 4 planning (project-pm)_                                  |
| A4  | Run the Sprint 3 manual e2e gauntlet (rolled from 3.7) and attach evidence to the run log   | plugin-tester                                | _existing item: TDEV from PR #35 — confirm in Monday hygiene §6_                 |

**Monday filing note.** This retro doc is being shipped under MON-2893969503. The three new Sprint 4 action items (A1, A2, A3) are filed during Sprint 4 planning by `project-pm` on Monday workspace 6325546, board 5095865862 (Tasks). Each gets its `Owner Agent` dropdown set per the table above and a `Linked Sprint` to Sprint 4. A4 is reconciled against the existing 3.7 task. Filing is gated on `MONDAY_API_TOKEN` availability on the runner; if filed before token is restored, attach a comment on this retro item with the assigned MON IDs.

## 6. Monday hygiene

| Task | Expected status                                 |
| ---- | ----------------------------------------------- |
| 3.0  | Done                                            |
| 3.1  | Done                                            |
| 3.2  | Done                                            |
| 3.3  | Done                                            |
| 3.4  | Done                                            |
| 3.5  | Done                                            |
| 3.6  | Done                                            |
| 3.7  | In Progress (manual gauntlet run pending)       |
| 3.8  | Done                                            |
| 3.9  | Done (after this retro PR merges and is synced) |

Reconcile against the Tasks board after the retro PR merges. If sync drift is observed, log in `runbooks/monday-workflow.md` §"Drift" per the canonical reconciliation procedure.

---

**Cross-references:**

- `learnings/anti-patterns/0001-figma-api-engineer-app-vue-cross-domain.md` (cross-domain anti-pattern)
- `learnings/anti-patterns/0002-figma-plugin-load-debugging.md` (the P0 root cause)
- `plugins/welder-editor/docs/perf/welder-editor.md` (Sprint 3 bundle re-measurement evidence)
- `plugins/welder-editor/validation/e2e/` (Content tab gauntlet runbook from 3.7)
- `runbooks/monday-workflow.md` §6 (sprint cadence)
- `runbooks/release-candidate-checklist.md` (target for the smoke-import gate update)
