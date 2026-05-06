# Changelog — Welder Editor

All notable changes to this plugin will be documented in this file.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] — onboarding to monorepo

### Added

- Imported v0.2.1 working build from external scaffold zip (non-destructive). Pre-existing files (`manifest.json`, `package.json`, `package-lock.json`, `vite.config.ts`, `esbuild.config.mjs`, `tsconfig.json`, `tsconfig.ui.json`, `app.config.ts`, `spec.md`, `widget-src/`, `.reviews/`, `.gitignore`) carried over unchanged.
- `plugin.toml` with slug, name, version (0.2.1), editor types, owner agent, placeholder Monday IDs, placeholder bundle budgets, and `[message_bus] version = 1`.
- `README.md` with build instructions for the interim npm workflow and explicit onboarding-debt callouts (lockfile migration, layout refactor, Monday folder, gzipped budget re-measure).
- `CHANGELOG.md` (this file).
- `docs/api-spec/overview.md`, `docs/threading/overview.md`, `docs/perf/budget.md` — org-bookkeeping pointers; full content lives in `spec.md` and `widget-src/types.ts` until the layout refactor lands.
- `tests/` and `validation/` directories with `.gitkeep` markers as plugin-tester landing zones.
- ADR in top-level `docs/adr/` documenting the temporary retention of `widget-src/` layout and the planned `T_REFACTOR_LAYOUT` task.

### Changed

- The pnpm workspace `plugins/*` glob in `pnpm-workspace.yaml` automatically picks this folder up; no edit to that file was needed. The `package.json` `name` is currently `welder-editor` (not `@figma-plugins/welder-editor`) and is excluded from pnpm dependency resolution today; rename is a follow-up.

### Fixed

- —

### Onboarding debt (tracked, not yet paid)

- `package-lock.json` (npm) → migrate to pnpm workspace + `@figma-plugins/welder-editor` rename.
- `widget-src/` → split into canonical `code/` + `ui/` + `shared/` (`T_REFACTOR_LAYOUT` per import ADR).
- ~~`[monday]` placeholders~~ Done — folder `placeholder-plugin team` (id 2996351) created from the standard Scrum Team template, IDs filled in `plugin.toml`, `enabled = true`. Tasks board id 5095985440.
- `[validation]` budgets → run gzipped re-measurement and ratify in a budget ADR (model after ADR-0003 / ADR-0014, both scoped to the deleted scaffold but still applicable per ADR-0018).

## [0.2.1] — 2026-04-25

Released externally before monorepo onboarding (see `spec.md` for full feature inventory). Predecessors `welder-table` v0.2.0 and `chart-builder` v0.3.0 remain available as rollback. v0.2.2 (T39 responsive table) is in flight in the external scaffold and will be merged into the monorepo flow once onboarding debt is paid down.
