# Handoff — initial repo scaffold

This file documents the state of the repo at the moment the canonical structure was put in place. Subsequent work happens via Monday items, PRs, and ADRs.

## What was scaffolded

- `CLAUDE.md` — agent operating instructions, ownership map, validation thresholds, plugin-thread rules.
- `README.md` — getting-started, scaffold workflow, conventions.
- `.claude/agents/` — 6 agent definitions matching the Monday Owner Agent dropdown: `project-pm`, `figma-api-engineer`, `ui-engineer`, `plugin-tester`, `release-engineer`, `product-researcher`.
- `runbooks/` — process docs (setup, monday-workflow, decision-discipline, audit-pipeline, demo-pipeline, release-candidate-checklist, e2e-gauntlet, cross-plugin-learnings, local-development).
- `docs/adr/`, `docs/perf/`, `docs/threading/`, `docs/conventions.md` — decisions, budgets, threading notes, conventions.
- `learnings/` — patterns / anti-patterns / post-mortems index.
- `.github/` — CODEOWNERS, PR template, validate + monday-sync workflows.
- `.githooks/commit-msg` — auto-injects `[#MON-<id>]` suffix from branch slug.
- `tools/` — Python tooling (monday-sync, sync_pr, bootstrap_plugin, conftest), Node tooling stubs (perf, demos).
- `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `eslint.config.ts`, `vitest.config.ts` — Node/TS workspace.
- `pyproject.toml` — Python tooling deps and console scripts.
- `plugins/_template/` — canonical plugin skeleton (manifest, package.json, vite config, code/, ui/, shared/, tests/).
- `components/_template/`, `sections/_template/` — shared-library templates.

## What was NOT scaffolded (intentionally)

- **Welder-editor implementation.** The plugin is scaffolded from `plugins/_template/` via `bootstrap-plugin welder-editor "Welder Editor"`, but its actual brief, design, and code land via the standard workflow (Monday item → branch → PR).
- **Monday boards.** Workspace 6325546 (Figma Plugins) is the home; each plugin lives in its own folder containing the standard **Scrum Team** template (6 boards). For a new plugin: workspace 6325546 → "+" → "Add folder from template" → "Scrum Team" → name the folder `<plugin-slug>`. Then copy the 6 board IDs into `plugins/<slug>/plugin.toml`. There is no PR Inbox board.
- **Self-hosted runner config.** Runner registration and launchd config are operator-side, not in the repo.
- **Signed commits.** Branch protection currently does not require signed commits — there's no signing key yet. When a key is in place, supersede the relevant ADR and enable the rule.
- **Storybook for components/sections.** Planned but deferred until the first component lands.

## First-day checklist for a new collaborator

1. Read `CLAUDE.md` end-to-end.
2. Read `runbooks/setup.md` and complete the per-developer setup.
3. Read `runbooks/monday-workflow.md` and `runbooks/decision-discipline.md`.
4. Skim the agent definitions in `.claude/agents/` for the agents you'll be invoking most.
5. Pick a Monday item from the workspace's Backlog, branch as `<type>/MON-<id>-<slug>`, and follow the workflow contract in `CLAUDE.md`.

## Open follow-ups

Filed as Monday items in the Figma-plugins workspace; tracked here as a backstop:

- Storybook for `components/` and `sections/`.
- Bundle-size budget enforcement in `validate.yml` (currently informational).
- axe-core CI integration in `validate.yml`.
- Signed commits + branch protection upgrade once a signing key is set up.
- E2E automation in Figma desktop (manual gauntlet only at scaffold time).
