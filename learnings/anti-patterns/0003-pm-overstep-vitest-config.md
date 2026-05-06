# 0003 — project-pm scaffolded vitest.config.ts + test stub out of domain

**Status:** active
**Date:** 2026-05-06
**Origin:** Sprint 5 Wave 3 hotfix — branch `hotfix/plugin-vitest-nuxt-ui-plugin`, PR #63
**Related:** CLAUDE.md ownership map, Sprint 5 Wave 3 PRs #56, #57, #59, #60, #62

## Context

Sprint 5 Wave 3 PRs were all failing CI on `plugins/welder-editor/tests/ui/*` integration tests. The root cause: PR #55 (5.4) merged TitleDescriptionEditor migrated to `<UFormField>` + `<UInput>`, but `plugins/welder-editor/vitest.config.ts` did not load the `@nuxt/ui/vite` plugin. Without it, Nuxt UI's `#build/ui/*` virtual module aliases do not resolve in vitest's jsdom environment, so `<UFormField>` does not materialize its auto-id label association and `getByRole('textbox', { name: /heading/i })` queries fail.

`project-pm` diagnosed the cause and scaffolded the fix on `hotfix/plugin-vitest-nuxt-ui-plugin` — two commits:

- `eb3ce37`: adds `plugins/welder-editor/tests/__stubs__/vue-router.ts`
- `2a0a9db`: adds `@nuxt/ui/vite` to `plugins/welder-editor/vitest.config.ts`

## What project-pm did

`project-pm` authored and pushed code under:

- `plugins/welder-editor/vitest.config.ts` — owned by `figma-api-engineer`
- `plugins/welder-editor/tests/__stubs__/vue-router.ts` — owned jointly by `figma-api-engineer` (vitest config wiring) and `ui-engineer` (test setup fixtures)

The PR body explicitly flagged the overstep and called for `figma-api-engineer` to review and take ownership before merge. project-pm did not merge.

## Why it crossed the boundary

The fix was small, the root cause was mechanical (missing vite plugin), and main was broken for all Wave 3 work. In that urgency context project-pm scaffolded the fix rather than halting and dispatching — reasoning that a scaffolded branch with an explicit review gate is lower risk than a prolonged broken main.

That reasoning is partially valid but incomplete: the correct protocol per CLAUDE.md is "halt + dispatch agent." Scaffolding the branch and flagging it is better than silently merging, but still crosses the ownership line. The fix happened to be correct, which is coincidental — it could have introduced a wrong theme config or an incomplete stub surface.

## What the correct protocol was

1. project-pm identifies the root cause and writes a clear diagnosis comment on the PR / Slack / task.
2. project-pm dispatches `figma-api-engineer` with the diagnosis: "vitest.config.ts needs `@nuxt/ui/vite` + vue-router alias; see vite.config.ts for the theme config to mirror."
3. `figma-api-engineer` creates the branch, authors the fix, opens the PR.
4. If `figma-api-engineer` is unavailable and the block is acute, project-pm escalates to the human owner for an explicit cross-domain authorization before touching the file.

## Why the overstep was tolerated this time

- The fix was mechanically correct (verified by figma-api-engineer review).
- The PR was not merged until figma-api-engineer took ownership and reviewed.
- The overstep was self-disclosed in the PR body with explicit review gate.
- Sprint 5 main was broken; 37 tests failing across Wave 3 PRs; urgency was real.
- The files touched (vitest.config.ts, a test stub) are low-risk compared to shared/messages.ts or code/main.ts.

None of these factors authorizes the boundary crossing retroactively. They explain why the outcome was acceptable and why no rollback was required.

## Validation outcome

figma-api-engineer validated:

- `ui()` config in vitest.config.ts matches vite.config.ts exactly (colorMode, colors).
- Vue-router stub surface is complete: only `{ useRoute, RouterLink }` are used by Nuxt UI 4.7.1 runtime; `useRouter` and `useLink` are defensive additions. No `vue-router/auto` needed.
- No adjustments were required to the scaffolded code.
- Test improvement: 37 → 7 failures in welder-editor; 4 test files fully restored.

## Recommendation for next time

**Fast-path agent dispatch instead of hand-rolling.**

When project-pm identifies a broken-main situation caused by a config gap in an owned file:

1. Write the diagnosis (2-3 sentences) + the specific fix needed.
2. Dispatch `figma-api-engineer` directly with that brief.
3. If response latency is an issue, flag to the human owner for an explicit authorization to act cross-domain.

The dispatch cost is low. The audit trail cost of an unauthorized cross-domain action is higher, even when the fix is correct.

If the team decides to formalize a "PM may scaffold a hotfix with explicit review gate" exception, that exception needs to live in CLAUDE.md as a named protocol, not as a case-by-case judgment call.
