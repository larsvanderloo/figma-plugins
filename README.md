# figma-plugins

Single repo for the Figma-plugins team. Each plugin is a directory under `plugins/`, sharing a common toolchain (Vue 3 + Nuxt UI v4 + TypeScript), agent prompts, runbooks, and CI workflows. Targets Figma design, FigJam, and Figma Slides via the Plugin API. Widgets are out of scope for now.

## Layout

```
figma-plugins/
├── plugins/                  One directory per plugin
│   ├── _template/            Canonical plugin skeleton (copied by bootstrap-plugin)
│   ├── welder-editor/        First plugin
│   └── ...
├── components/               Shared library: atomic Vue primitives + design tokens (atop Nuxt UI v4)
├── sections/                 Shared library: composite reusable views built from components
├── packages/
│   └── figma-api/            Typed wrappers around figma.* + message-bus router
├── runbooks/                 Team-wide process docs
├── learnings/                Cross-plugin patterns, anti-patterns, post-mortems
├── tools/
│   ├── bootstrap_plugin.py   Scaffold a new plugin (console script: `bootstrap-plugin`)
│   ├── monday-sync/          GitHub → Monday.com sync
│   ├── demos/                Demo-pipeline source files and headless demo tool
│   └── perf/                 Bundle-size + perf benchmark helpers
├── .claude/agents/           Six agent prompt files (matches Monday Owner Agent labels)
├── .github/
│   ├── workflows/
│   │   ├── validate.yml      Lint + vue-tsc + vitest + build matrix
│   │   └── monday-sync.yml   PR events → Monday columns (path-filtered per plugin)
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── CODEOWNERS
├── .githooks/commit-msg      Auto-injects [#MON-<id>] suffix on commit subjects
├── CLAUDE.md                 Team-wide agent operating instructions
├── package.json              Root workspace config (pnpm)
├── pnpm-workspace.yaml       pnpm workspace member list
├── tsconfig.base.json        Shared strict TypeScript config
├── pyproject.toml            Python tooling (monday-sync, bootstrap, perf)
└── README.md                 This file
```

## Getting started (first-time setup)

1. **Clone this repo** to your machine.

2. **Install Node tooling deps** (Node 20+, pnpm 9+):
   ```bash
   pnpm install
   ```

3. **Install Python tooling deps** (Python 3.11+ for `tomllib`):
   ```bash
   pip install -e .
   ```
   (macOS: `brew install python@3.11` if not already.)

4. **Set the GitHub repo secret** for Monday sync:
   - GitHub repo → Settings → Secrets and variables → Actions → New repository secret
   - Name: `MONDAY_API_TOKEN`
   - Value: your Monday API token (Monday avatar → Developers → My Access Tokens)

That's the entire org-level setup.

The Figma Plugins workspace is **6325546** at `larsvdloo-team.monday.com/`. Each plugin lives in its own folder containing the standard **Scrum Team** template (6 boards). There is no PR Inbox board.

## Adding a new plugin

```bash
bootstrap-plugin <slug> "<Display Name>" --folder-id <monday-folder-id>
```

Example:
```bash
bootstrap-plugin token-extract "Token Extract" --folder-id <id>
```

This creates `plugins/<slug>/` from the `plugins/_template/` skeleton. After scaffolding, edit `plugins/<slug>/plugin.toml` to fill in the 6 Monday board IDs from the duplicated Scrum Team folder.

To set up Monday for a new plugin:

1. Open [workspace 6325546 (Figma Plugins)](https://larsvdloos-team.monday.com/workspaces/6325546).
2. "+" → "Add folder from template" → select **"Scrum Team"** → name the folder `<plugin-slug>`.
3. The 6 boards (Epics, Sprints, Tasks, Retrospectives, Bugs Queue, Capacity) appear in the new folder. Open each, copy the numeric ID from the URL.
4. Paste the IDs into `plugins/<slug>/plugin.toml` under `[monday]`.

Skip Monday entirely with `--no-monday` for offline/experimental plugins.

## How the sync works

`tools/monday-sync/sync.py` is the single source of truth for GitHub→Monday updates. It detects which `plugins/<slug>/` directories the PR touched (via `git diff --name-only`), reads each affected plugin's `plugin.toml` to find the Tasks board ID, and updates that item's `task_status` and `link` columns when the PR body has `Resolves MON-{id}`. Cross-plugin PRs update each touched plugin's Tasks board.

PRs that only touch shared code (`components/`, `sections/`, `packages/`, `tools/`, `runbooks/`) and don't have a `Resolves MON-{id}` line are not tracked.

There are two ways to invoke it.

**Default — CI on self-hosted runner.** `monday-sync.yml` runs on every PR open / ready-for-review / close / review-submitted event. The runner is the local Mac (`runs-on: [self-hosted, macOS, ARM64]`), so there's no GitHub Actions billing exposure.

**Fallback — local CLI.** If the runner is offline:
```bash
sync-pr <pr-number> [event]    # event: opened (default) | ready_for_review | closed
```
Reads `MONDAY_API_TOKEN` from `.monday-token` (gitignored) at the repo root, or the env var. Reads `GITHUB_TOKEN` from `gh auth token`. Same `tools/monday-sync/sync.py` code path as the workflow.

## Conventions

- **Item names** in Monday: `[TYPE] <slug>` — e.g. `[FEAT] Toolbar redesign`, `[BUG] Selection lost on undo`
- **Branch names**: `<type>/MON-{id}-<slug>` — e.g. `feature/MON-1234-toolbar-redesign`
- **Commit subjects**: `<type>(<scope>): <subject> [#MON-{id}]`
- **PR descriptions** must contain `Resolves MON-{id}` to link back to Monday
- **Sprint names**: `S{year}-W{start}-W{end}` — e.g. `S2026-W18-W19`

## Why monorepo

For a solo dev shipping multiple plugins, monorepo wins on:

- **Single secret/variable setup** — `MONDAY_API_TOKEN` once, not per-repo.
- **Shared library imports as workspace packages** — `@figma-plugins/ui-components` instead of versioned npm packages.
- **Cross-plugin refactors are single-PR** — no multi-repo coordination.
- **Agent prompts live alongside code** — the `.claude/agents/` directory is shared; agents see the whole picture.

The trade-off: independent plugin release cadences are awkward in a monorepo. When you reach that point — multiple plugins shipping on independent cycles, or a second engineer joining — split with `git filter-repo --subdirectory-filter plugins/<slug>` into a per-plugin repo. Until then, this is simpler.

## Reference docs

- `runbooks/monday-workflow.md` — canonical Monday-first workflow
- `runbooks/audit-pipeline.md` — external feedback intake
- `runbooks/demo-pipeline.md` — release-engineer's pipeline
- `runbooks/decision-discipline.md` — anti-pleasing-loop protocol for agents
- `runbooks/e2e-gauntlet.md` — manual e2e validation in design + FigJam + slides
- `learnings/` — cross-plugin patterns and post-mortems

The Monday workspace at `https://larsvdloo-team.monday.com/` is the system of record for plan state. This repo is the system of record for code state. They sync via `monday-sync.yml`.
