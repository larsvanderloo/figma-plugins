# ADR 0001 — Monorepo structure for figma-plugins

**Status:** accepted
**Date:** 2026-05-05
**Decision-makers:** Lars (project-pm)

## Context

We're starting a Figma-plugins team that will ship multiple plugins (first: welder-editor; more to follow) targeting Figma design, FigJam, and Figma Slides. The audio-plugins team in a sibling repo has a working professional setup — monorepo with shared components/sections, agent-driven ownership, Monday-sync, runbooks, learnings — that we want to mirror with a different domain.

Open questions:
- Monorepo vs per-plugin repos?
- Shared component library structure?
- How to map the audio-plugins agent philosophy to a UI-domain stack?
- How does the Monday workspace align with the agent roster?

## Decision

**Monorepo, single GitHub repo `larsvanderloo/figma-plugins`.** Each plugin is a directory under `plugins/`; shared library code lives at the root in `components/`, `sections/`, and `packages/figma-api/`. pnpm workspaces handle linking.

**Stack:** Vue 3 + Nuxt UI v4 + TypeScript + Vite + pnpm workspaces. Vitest + @testing-library/vue + axe-core for testing.

**Agent roster — 6 agents, matching the Owner Agent dropdown labels in Monday workspace 6325546:**

| Agent | Scope |
|---|---|
| `project-pm` | Process, structure, sprint cadence, ADRs, release timing (mechanics belong to release-engineer) |
| `figma-api-engineer` | Plugin API surface, manifest, message-bus contract (`shared/messages.ts`), code-side TypeScript (`code/`), document mutations, persisted state, code-side bundle size and perf |
| `ui-engineer` | Vue 3 + Nuxt UI v4 (`ui/`), atomic components, composite sections, design tokens, theming, accessibility, ui-side bundle size and render perf |
| `plugin-tester` | Validation suite (vue-tsc, vitest, @testing-library/vue, axe), e2e gauntlet across design + FigJam + Slides, Bugs Queue triage, usability tests, accessibility audits, **veto authority on releases** |
| `release-engineer` | Release pipeline (tagging, signing, GitHub Releases), Figma Community submissions, demo pipeline, external feedback intake, beta program, Figma plugin-policy correspondence |
| `product-researcher` | Desk research, active-listening synthesis, quarterly external signal review (co-produced with release-engineer) |

**Hierarchy:**
- `components/` — atomic Vue primitives + design tokens (atop Nuxt UI v4)
- `sections/` — composite reusable views built from components
- `plugins/<slug>/` — per-plugin: `code/` (Figma sandbox), `ui/` (Vue iframe), `shared/` (message-bus contract), `tests/`, `docs/`, `validation/`

**Editor type scope:** `["figma", "figjam", "slides"]` by default. Widgets out of scope for now; if reintroduced, requires a new ADR.

**Monday workspace:** workspace **6325546** (Figma Plugins) at `larsvdloo-team.monday.com/`. Each plugin lives in its own folder containing Monday's standard **Scrum Team** template (6 boards: Epics / Sprints / Tasks / Retrospectives / Bugs Queue / Capacity). No PR Inbox board — shared-code PRs without an explicit `Resolves MON-<id>` are not tracked.

## Alternatives considered

1. **Per-plugin repos with a shared `figma-plugin-toolkit` package.**
   Rejected because: every per-repo setup duplicates the Monday-sync secret, GitHub Actions config, agent prompts, and shared code. The audio-plugins team explicitly tried this and consolidated to a monorepo for the same reason. For a solo dev with one plugin shipping at a time, monorepo wins.

2. **Different stack: React + Radix UI / Mantine instead of Vue + Nuxt UI v4.**
   Rejected because: per the user's stated tech stack preference (Vue 3 + Nuxt UI v4 — recorded in user memory). React's ecosystem is bigger but the team's focus is on consistent, accessible, themed UI built on Nuxt UI v4's primitives.

3. **Custom Plugin Project Template board with PR Inbox cross-plugin board (audio-plugins style).**
   Rejected because: Monday ships a standard "Scrum Team" template that already covers Epics / Sprints / Tasks / Retrospectives / Bugs Queue / Capacity in one folder. Riding on Monday's defaults means future template improvements flow in for free, dashboards work out of the box, and there's no custom column schema to maintain. The PR Inbox board added overhead without commensurate value for a solo-dev workflow.

4. **9-agent roster mapped 1:1 from audio-plugins (figma-api-specialist + plugin-architect + plugin-engineer + nuxt-ui-developer + performance-engineer + audit-curator + demo-engineer + project-pm + product-researcher).**
   Rejected after the Scrum Team Monday boards were set up with a 6-agent Owner Agent dropdown. The 6-agent roster reflects how the work actually splits in a Figma-plugin context: Figma's plugin runtime is small enough that one engineer (`figma-api-engineer`) can own API surface + architecture + code-side implementation; UI is its own discipline (`ui-engineer`); validation needs its own veto-bearing role (`plugin-tester`); release pipeline + community + demos consolidate into `release-engineer`. Splitting further produces ceremony without distinct accountability, especially for a solo dev. The detail from the original 9 agents is preserved inside the 6 prompts, not lost.

## Consequences

**Positive:**
- Single secret/variable setup for Monday sync.
- Shared `components/` and `sections/` libraries reused across plugins via pnpm workspace links.
- Cross-plugin refactors are single-PR.
- Agent prompts live alongside code.
- Agent roster matches Monday's Owner Agent dropdown exactly — no impedance mismatch.
- Scrum Team's standard 6-board structure plus standard column schema means dashboards / burndown / velocity widgets all work out of the box.

**Negative:**
- Independent plugin release cadences are awkward in a monorepo (per-plugin tags help, but main is shared).
- Workspace tooling (pnpm) adds a learning curve for contributors used to npm.
- The 6-agent ceremony is moderate for a solo dev with one plugin; the framework will feel intentional once the second plugin lands.

**Mitigations:**
- Per-plugin tags scoped by slug (`welder-editor-v0.2.0`) decouple release cadences within the monorepo.
- pnpm is well-documented and the `runbooks/local-development.md` covers the workflow.
- The 6 agents are well-scoped — agent invocation is light when only one is needed.

**Reversibility:**
- Splitting to per-plugin repos later is straightforward via `git filter-repo --subdirectory-filter plugins/<slug>`.
- Stack migrations (Vue 4, future Nuxt UI versions) follow the standard ADR process.
- Agent roster adjustments require an ADR; no agent is locked in. Adding a 7th agent or splitting an existing one should be evaluated against whether it changes the Monday Owner Agent dropdown (which would be the same ADR scope).

## References

- audio-plugins repo: `/Users/lars/Documents/GitHub/audio-plugins/` (the 9-agent reference setup)
- User memory: `figma-plugins-ui-stack.md` (Vue 3 + Nuxt UI v4)
- `CLAUDE.md` for the canonical structure and agent ownership map.
- `runbooks/monday-workflow.md` for workspace 6325546 + Scrum Team layout.
