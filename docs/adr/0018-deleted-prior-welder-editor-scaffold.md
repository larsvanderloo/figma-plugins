# ADR 0018 — Prior welder-editor scaffold deleted in favor of imported v0.2.1 build

**Status:** Accepted (back-filled — decision predates the ADR)
**Date:** 2026-05-06
**Decision-makers:** user (direct-to-main); project-pm (back-filling the audit trail)
**Supersedes:** —
**References:** Commit `b842be1` (the deletion); ADR-0001 (monorepo structure); ADR-0017 (welder-editor retains widget-src/ layout temporarily); ADRs 0002, 0003, 0006, 0007, 0008, 0009, 0010, 0011, 0013, 0014 (all scoped to the deleted scaffold); commits `c9a87af`, `f252b50`, `6d0ea13`, `630ccc6` (the import + rename).

---

## Context

This ADR back-fills a decision that was already executed. On 2026-05-06, in commit `b842be1`, the entire `plugins/welder-editor/` subtree was deleted in a direct-to-main commit by the user. That subtree had been the canonical-layout reference plugin for this monorepo since the first sprint — `code/` + `ui/` + `shared/` split, pnpm workspace member, with its own established build, test, axe, bundle-size, and frame-trace-perf pipelines, plus 10+ scoped ADRs (0002, 0003, 0006, 0007, 0008, 0009, 0010, 0011, 0013, 0014).

The deletion was followed (in commit `630ccc6`) by renaming the imported `_placeholder-plugin` (a v0.2.1 zip imported earlier the same day) to take the freed `welder-editor` slug. The new `welder-editor` is a different plugin in every way that matters to engineering:

- **Layout**: `widget-src/` (per ADR-0017's bounded deviation), not `code/`+`ui/`+`shared/`.
- **Toolchain**: npm + Vite 8 + vue-tsc 3 + esbuild + chunked-text-loader, not pnpm + Vite 5 + vue-tsc 2 + `__html__` + `vite-plugin-singlefile`.
- **Workspace status**: excluded from pnpm-workspace.yaml.
- **CI**: dedicated `npm-plugin-welder-editor` job, not the workspace-wide `node` / `axe` / `bundle-size` / `frame-trace-perf` jobs (the latter three were deleted alongside the plugin in commit `630ccc6`).
- **Codebase**: a different working v0.2.1 release sourced from an external scaffold; the prior scaffold's `code.ts`, wrapper modules, persistence layer, dev-console bridge, and tests are gone.

Because the deletion happened direct-to-main without a PR or ADR, the rationale was never written down. This ADR captures it now so the audit trail is complete.

## Decision

Accept the deletion as final. The prior `plugins/welder-editor/` subtree is gone from working state and from the tip of `main`. It survives only in git history (last present at parent of `b842be1`) and in the 10 scoped ADRs that documented its design.

The slug `welder-editor` is reassigned to the imported v0.2.1 build (formerly `_placeholder-plugin`), per commit `630ccc6`.

## Stated rationale (reconstructed)

The user's commit message on `b842be1` says only: _"Delete the entire plugins/welder-editor subtree (code, ui, shared types, tests, docs, manifests, configs, and related build files)."_ The PM-reconstructed rationale, based on the surrounding session and the user's intent expressed during the imports:

1. **The imported v0.2.1 zip was the actually-released, in-production version** of the Welder Slide Editor product. The prior scaffold was a parallel earlier-stage rebuild that had not shipped externally. Maintaining both was redundant.
2. **The two diverged on architecture** (chunked-text-loader vs `__html__`+singlefile, npm vs pnpm, widget-src/ vs code/+ui/+shared/) and **on feature completeness** (the imported v0.2.1 had Card / Chart / Table / Journey / Timeline editors plus full slide-machine wrapper detection; the prior scaffold was earlier in those areas).
3. **The user prioritised the working v0.2.1** over the canonical-layout scaffold and chose to consolidate on it.

This is a reasonable call. The cost is real (canonical-layout reference plugin gone; CI gates for axe/bundle-size/frame-trace-perf removed; cross-references in docs now self-referential — see ADR-0017's "consequences" section). The benefit is also real (one plugin instead of two, working v0.2.1 functionality preserved, fewer concurrent active branches).

## What was preserved

- **Git history.** The deleted subtree is recoverable from `b842be1^` if needed.
- **Scoped ADRs (0002, 0003, 0006, 0007, 0008, 0009, 0010, 0011, 0013, 0014).** They remain in `docs/adr/` and document the design reasoning of the deleted scaffold. Many of their conclusions still apply to the new `welder-editor` (the chunked-text-loader / `__html__` discussion in 0002, the bundle-size doctrine in 0003 + 0014, the editor-type narrowing in 0002, the cropper choice in 0006, etc.). When the new welder-editor's `T_REFACTOR_LAYOUT` lands, those ADRs become live references for it.
- **`runbooks/` and `learnings/`** are unchanged.

## What was lost

- **Canonical-layout reference plugin.** No plugin in the repo now demonstrates the `code/`+`ui/`+`shared/` split — `plugins/_template/` is the only canonical-layout artifact, and it's a skeleton, not a worked example.
- **Active CI gates** for axe (WCAG 2.1 AA), gzipped bundle size, and frame-trace perf. Removed in commit `630ccc6` because they were hardcoded against the deleted plugin's vitest tests and pnpm-built artifacts. Equivalents must be re-introduced under the npm-driven welder-editor as part of `T_REFACTOR_LAYOUT` (ADR-0017) or sooner.
- **Test surface.** The prior scaffold had vitest unit + component tests; the new welder-editor has none. `tests/` is empty.
- **Cross-references in docs**, runbook examples, and the `[message_bus] version` history. Some of these references in the new welder-editor's docs (api-spec/overview.md, threading/overview.md, perf/budget.md, ADR-0017) now point at the deleted scaffold and read as self-referential or dangling. To be cleaned up incrementally; not blocking.

## Alternatives considered (after-the-fact)

### Keep both plugins side by side under different slugs

Rejected. The user explicitly chose consolidation. Maintaining two parallel Welder editors at different stages of architecture and feature completeness would have doubled review surface, doubled CI cost, doubled documentation overhead, and confused users about which one is the canonical Welder editor. The cost/benefit favored consolidation.

### Refactor the prior scaffold to absorb v0.2.1's features

Rejected by user choice. Would have preserved the canonical layout but required reimplementing all of v0.2.1's editors against the prior scaffold's code/ui/shared split. Estimated weeks of work for an already-shipped feature set.

### Delete the imported v0.2.1 instead, keep the prior scaffold

Rejected by user choice. Would have preserved the canonical layout and the existing CI gates, but discarded the working v0.2.1 release and the consolidation rationale that motivated the import in the first place.

## Consequences

### Positive

- One plugin to maintain, one CI lane, one Monday folder, one set of docs.
- The working v0.2.1 release is the source of truth, matching what's in production.
- Sprint capacity is not split between two parallel rebuilds.

### Negative

- The audit trail of this decision had to be back-filled. The user pushed `b842be1` direct-to-main without a PR or written rationale; this ADR exists because project-pm noticed the gap and filed it post-hoc. See `learnings/anti-patterns/0004-direct-to-main-during-plugin-onboarding.md` for the named pattern.
- The repo currently has no canonical-layout plugin example. New plugins follow `plugins/_template/`, but a worked example is more instructive than a skeleton.
- CI gates for accessibility, bundle size, and frame-trace perf are absent until `T_REFACTOR_LAYOUT` re-introduces npm-driven equivalents.
- 10+ scoped ADRs reference paths inside the deleted plugin. They're correct as historical records; they're misleading as live references. Annotated as "scoped to the deleted scaffold" is the cleanest fix when each is next touched.

### Reversibility

Trivially reversible from git history (`git revert b842be1` plus a follow-up to handle the slug collision with the renamed imported plugin). Practically reversible only if the consolidation rationale is re-evaluated; the user's decision stands.

## References

- Commit `b842be1` — the deletion (no PR, no merge commit, direct push to main).
- Commits `c9a87af`, `f252b50`, `6d0ea13`, `630ccc6` — the import + Monday + CI + rename sequence that ended with the imported v0.2.1 occupying the `welder-editor` slug.
- ADR-0017 — the bounded `widget-src/` layout deviation that the new welder-editor inherits.
- `learnings/anti-patterns/0004-direct-to-main-during-plugin-onboarding.md` — names the procedural pattern (direct-to-main during the import session) so it doesn't recur silently.
- `runbooks/decision-discipline.md` — the protocol for back-filling rationale when a decision predates its ADR.
