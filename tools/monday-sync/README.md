# tools/monday-sync

GitHub → Monday.com sync. Triggered by GitHub Actions on PR/review events; updates the Tasks board for each plugin the PR touched.

Owned by `project-pm`. The board template is Monday's standard **Scrum Team** (workspace 6325546, **Figma Plugins**). Each plugin has its own folder containing the 6-board Scrum Team template; sync writes to the **Tasks** board.

## How it works

1. PR opened/updated/closed/reviewed event lands on the self-hosted runner.
2. `sync.py` parses `Resolves MON-<id>` lines from the PR body.
3. `git diff --name-only` identifies which `plugins/<slug>/` directories the PR touched.
4. For each touched plugin, `plugins/<slug>/plugin.toml` is read for `monday.tasks_board_id`.
5. Each MON item gets its `task_status` and `link` columns updated on the matching Tasks board.

Status transitions:

| Event                   | Status set                                      |
| ----------------------- | ----------------------------------------------- |
| PR opened               | `In Progress`                                   |
| PR ready_for_review     | `Waiting for review`                            |
| Review submitted        | `Waiting for review`                            |
| PR merged               | `Done`                                          |
| PR closed without merge | (no change — set `Stuck` manually if abandoned) |

## What's intentionally NOT here

- **No PR Inbox.** Shared-code PRs without `Resolves MON-<id>` don't get tracked. If you want to track shared work, file a Monday item explicitly.
- **No render-review pipeline.** Demos are deferred to v0.2 (`runbooks/demo-pipeline.md`).
- **No CI / validation status columns.** Scrum Team's Tasks board has a single `task_status` column. CI green / e2e gauntlet pass / etc. live as PR labels and comments, not as Monday columns.
- **No bug-triage automation.** Bugs Queue is a separate Scrum Team board; intake happens via the form on the Bugs Queue board, not this sync.

## Running locally

The CI workflow (`.github/workflows/monday-sync.yml`) calls `sync.py` on every PR event. For a manual one-off sync (runner offline, retroactive update):

```bash
sync-pr <pr-number> [event]    # event: opened (default) | synchronize | ready_for_review | closed
```

Reads `MONDAY_API_TOKEN` from `.monday-token` (gitignored) at the repo root, or the env var. Reads `GITHUB_TOKEN` from `gh auth token`. Same `sync.py` code path.

## Setup

Per-repo (one-time):

```bash
gh secret set MONDAY_API_TOKEN     # paste token from Monday → Avatar → Developers → My Access Tokens
```

Per-plugin (per scaffold):

1. Run `bootstrap-plugin <slug> "<Display Name>" --folder-id <folder-id>` after duplicating the Scrum Team template into a new folder in workspace 6325546.
2. Edit `plugins/<slug>/plugin.toml` and fill in the 6 board IDs (Tasks, Sprints, Epics, Bugs Queue, Retrospectives, Capacity) from the duplicated folder.
3. Confirm `monday.enabled = true` and `monday.workspace_id = "6325546"`.

That's it. The next PR you open touching `plugins/<slug>/` will sync to that plugin's Tasks board if its body has `Resolves MON-<id>`.
