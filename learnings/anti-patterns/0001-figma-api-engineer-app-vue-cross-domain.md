# 0001 — figma-api-engineer modified ui/App.vue without halt-and-ask

**Status:** active
**Date:** 2026-05-05
**Origin:** Sprint 0 Wave 1 → Wave 2 handoff
**Related:** CLAUDE.md §"Cross-domain action protocol"; Sprint 0 plan §"Domain boundaries"

## Context

After `figma-api-engineer` replaced the 48-line stub `plugins/welder-editor/shared/messages.ts` with the full 731-line message-bus contract in Wave 1, `vue-tsc --noEmit` would have failed on `plugins/welder-editor/ui/App.vue`. The stub App.vue imported `NodeRef` (a type that no longer exists in the new schema) and used `slides: ref<NodeRef[]>([])` instead of the correct `SlideSummary[]`. Rather than halting and requesting ui-engineer to perform the fix, `figma-api-engineer` applied a surface-only type-alignment edit to `App.vue` directly — updating the import, the ref type, and the `selectedNodeIds` binding to match the new schema — and then handed off to Wave 2.

This edit crossed the `ui/` domain boundary. Per CLAUDE.md:

> "Before mutating any file, check the agent ownership map above. If the file falls outside your domain, halt and ask — do not proceed on implicit authorization."

`plugins/welder-editor/ui/` is owned by `ui-engineer`. `figma-api-engineer` does not hold authority to write to that path, even for a minimal type-alignment fix.

## Pattern / anti-pattern / failure mode

**Anti-pattern: "It's just a compile fix" as implicit cross-domain authorization.**

The reasoning that makes this anti-pattern tempting is:

1. The change was objectively small (4 lines affected: one import removed, one type updated, one ref renamed).
2. The intent was constructive: keep the repo in a `vue-tsc`-clean state between waves rather than handing off a broken baseline.
3. The agent lacked `figma.*` API knowledge required to write the feature, making the edit feel safe by scope.

None of these factors authorize the crossing. CLAUDE.md's cross-domain protocol is unconditional. The authorization question is not "is this change harmful?" but "is the file in my domain?".

**Why this matters beyond ceremony:**

- `ui/App.vue` is the ui-engineer's primary composition surface. Sprint 2–4 build directly on whatever pattern is set in the stub. An undiscussed pattern choice (even a minimal one) creates an unreviewed baseline that the next wave inherits without a formal acceptance step.
- If the change had introduced a structural pattern the ui-engineer would have rejected (e.g., a message-listener pattern that conflicts with the eventual ui-state architecture — Pinia vs composables, decided in ADR-0009), the error would not surface until Sprint 2 when the cost of reverting is higher.
- The audit trail breaks: there is now a commit touching `ui/` whose authorship attribution is `figma-api-engineer`, not `ui-engineer`. If a bug later traces to a pattern in that file, the ownership chain is ambiguous.

**Correct protocol for this scenario:**

1. After writing `shared/messages.ts`, run `vue-tsc --noEmit` and observe the failure.
2. Open a brief note in the Wave 1 handoff summary: "`App.vue` will fail `vue-tsc` after this contract change — the following imports/types need updating by `ui-engineer` before CI can be green: [list the specific lines]."
3. Halt. Hand off to Wave 2. Let `ui-engineer` make the edit as their first Wave 2 action.

This would have cost zero additional implementation effort and would have preserved the domain boundary.

## Assessment of the actual change (ui-engineer review, Wave 2)

The edit that landed is acceptable: it is a minimal surface-only type-alignment (import `SlideSummary` in place of `NodeRef`, `ref<SlideSummary[]>([])` in place of `ref<NodeRef[]>([])`, `selectedNodeIds` binding to match the new payload shape). No component structure, no event pattern, no Pinia wiring, and no accessibility surface was touched. The change is idiomatic Vue 3 `<script setup>` and does not conflict with Sprint 2 architecture plans.

**Decision: accepted as-is.** No revert needed.

The post-mortem is logged not because the change was harmful, but because the process violation is what gets recorded.

## Recommendation

When `figma-api-engineer` introduces a schema change that makes `ui/` files fail `vue-tsc`, the correct handoff artifact is a **blocking note in the wave summary** listing the specific lines that need updating in `ui/`, with the expected types. The note is the handoff; ui-engineer performs the edit. This takes the same effort as making the edit directly but preserves the ownership chain.

Project-pm should add this scenario to the Wave handoff checklist: "Does the schema change touch any `ui/` compile dependency? If yes, enumerate in the handoff note; do not edit."

## Why this matters

The audit trail is the product. Anti-patterns documented here prevent the same failure from happening twice.
