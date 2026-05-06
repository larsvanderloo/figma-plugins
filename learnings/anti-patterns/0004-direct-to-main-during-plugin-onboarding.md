# 0004 — Direct-to-main during plugin onboarding

**Status:** active
**Date:** 2026-05-06
**Origin:** project-pm self-trigger (audit-trail debt observed in current session)
**Related:** ADR-0018 (welder-editor scaffold deletion); CLAUDE.md §"Branching and versioning"; `runbooks/decision-discipline.md`

## Context

Five commits landed on `origin/main` during a single plugin-onboarding session on 2026-05-06, all without a pull request, code review, or merge commit:

| Commit    | Subject                                                                            | Author          |
| --------- | ---------------------------------------------------------------------------------- | --------------- |
| `c9a87af` | feat(\_placeholder-plugin): scaffold imported v0.2.1 plugin under placeholder slug | claude (via PM) |
| `f252b50` | ci(\_placeholder-plugin): add npm-driven CI lane + wire Monday sync                | claude (via PM) |
| `6d0ea13` | ci(\_placeholder-plugin): trim CI to gating-only, fix blockers along the way       | claude (via PM) |
| `b842be1` | Remove welder-editor plugin and ignore .claude                                     | user            |
| `630ccc6` | refactor: rename \_placeholder-plugin -> welder-editor                             | claude (via PM) |

The first three were authored locally on a feature branch attempt that was aborted (the `feature/placeholder-plugin-onboarding` branch was created, pushed, and immediately deleted after the user said "go to main no branch"). They were then pushed direct-to-`main` from the user's terminal. Commit `b842be1` was authored and pushed direct-to-`main` by the user with no PR. Commit `630ccc6` followed the same direct-to-`main` push path.

The branch-protection layer at the GitHub server side blocked this from the agent harness (org policy: "requires feature branches and PRs"). It did not block the user's terminal because the user has admin bypass rights. The result: five commits landed on `main` with zero PR review surface and zero programmatic CI verification before the merge — the validate.yml workflow runs on `push: branches: [main]`, so it ran _after_ the merge, not before.

## Pattern / anti-pattern / failure mode

**The pattern**: during a high-velocity multi-step refactor (import + rename + CI overhaul + scaffold deletion), the canonical PR-review-then-merge workflow felt like overhead and was skipped — once for the placeholder import, once for the welder-editor delete, once for the rename. Each individual skip felt locally justified ("I just need to push this"); the cumulative effect is a session where five interrelated commits landed without review, including one (`b842be1`) that deleted a plugin with 10+ scoped ADRs and several active CI gates.

**The failure mode this enables**:

1. **Pre-merge CI gates do not run.** `validate.yml` triggers on `push: branches: [main]`, so it runs after the commit is already on main. A bad bundle, a vue-tsc regression, or a manifest schema break is caught only after it's irreversibly on the trunk. Reverting requires a follow-up commit; rewriting history on main is not allowed by the same branch protection that was bypassed.
2. **Decisions skip the ADR-then-merge pattern.** `b842be1` deleted a canonical-layout reference plugin with no written rationale. The audit trail had to be reconstructed post-hoc by `project-pm` (see ADR-0018). Reconstructed rationale is materially worse than rationale written in advance because the reviewer cannot challenge the reasoning at the point of decision.
3. **Two-human review is structurally absent.** Solo dev with a team-of-agents has one human reviewer; the canonical PR review is the _agent_ signing off (CODEOWNERS routes UI PRs to ui-engineer's approval, code PRs to figma-api-engineer, etc.). When you push direct-to-main, you also bypass the agent review. The canonical workflow uses agent-review as a partial substitute for second-human-review; direct-to-main negates that.
4. **The audit trail looks ad-hoc.** Five direct-to-main commits in one day with no PRs is a pattern that, repeated, becomes the operating norm. The team wakes up six months later not knowing why decisions were made because the rationale only ever lived in chat.

## Recommendation

**Default to the canonical path.** Per `CLAUDE.md` §"Branching and versioning":

- `feature/MON-<id>-<slug>` (or `chore/`, `bugfix/`, `hotfix/`) branches off `main`.
- PR targets `main`.
- Pre-merge CI must be green.
- Agent reviewer per CODEOWNERS routing approves.
- Merge commit (or squash) lands on `main`.
- For solo-dev sessions, the agent review and the human review are the same person reading the same diff with both hats on. That's still review. Direct-to-main removes the diff-review step entirely.

**Explicit exceptions, narrowly scoped:**

1. **Hotfix to unbreak `main` itself**: direct-to-main is acceptable when the trunk is broken and CI is failing. File a follow-up ADR within 24h naming what was broken, what was fixed, and why a PR cycle wasn't feasible.
2. **One-line fixes to release-blocking bugs found during the gauntlet**: same. ADR follow-up.
3. **Documentation-only commits with zero functional impact**: acceptable, but should still go through PR for cross-plugin docs and ADRs (the audit trail benefits from review even when the code doesn't).

**The 2026-05-06 plugin onboarding does not match any of these exceptions.** It was a multi-commit refactor with destructive operations and CI changes. It should have been one or more PRs.

**Process correction going forward:**

- Default branch for any session that touches more than one file or is expected to produce more than one commit: feature branch + PR.
- If the user declares "no branch" mid-session, project-pm pauses and surfaces the trade-off (no pre-merge CI, no review surface, audit-trail reconstructed after) before continuing. The user can still choose direct-to-main with explicit acknowledgment; silent capitulation is the failure.
- ADR for any destructive operation (plugin deletion, message-bus version bump, manifest editorType narrowing) MUST land in the same PR as the operation, not after.

## Why this matters

The audit trail is the product. Five commits landing direct-to-main in one session, including a plugin deletion with no rationale, means the next person reading this repo (or the next session of this same agent) cannot reconstruct _why_. Reconstructing rationale post-hoc (as ADR-0018 does for `b842be1`) is the most expensive, least reliable form of documentation. The whole point of the canonical PR-and-ADR workflow is to write the rationale at the moment of the decision, when it's still vivid, when reviewers can challenge it, and when the audit trail captures the actual reasoning instead of a reconstructed approximation.

This anti-pattern is named so the next time the pattern starts forming — second consecutive direct-to-main commit on the same branch within the same session, or a destructive operation about to land without an ADR — `project-pm` (or whichever agent is on point) calls it out, references this entry, and forces the canonical path or the explicit ADR-acknowledged exception.
