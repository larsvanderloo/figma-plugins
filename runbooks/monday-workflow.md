# Monday workflow — Scrum Team edition

Owned by `project-pm`. Every plugin in this monorepo uses this workflow. Deviations require an ADR.

This document is the single source of truth for: workspace structure, board template, status workflow, GitHub sync rules, naming conventions, onboarding playbook.

---

## 1. The mental model

Monday.com is the system of record for **plan state**. GitHub is the system of record for **code state**. The two are kept in sync by `tools/monday-sync/sync.py`, which runs from `.github/workflows/monday-sync.yml` on the self-hosted macOS arm64 runner.

When Monday and GitHub disagree, GitHub is right for code state, Monday is right for plan state. Reconcile weekly and document drift.

## 2. Workspace and folder layout

Workspace ID: **6325546** ([Figma Plugins](https://larsvdloos-team.monday.com/workspaces/6325546))

Each plugin gets its own folder containing 6 boards from Monday's standard **Scrum Team** template — duplicated as-is. No custom per-plugin board template; we ride on Monday's defaults so future template improvements flow in for free.

```
workspace 6325546 (Figma Plugins)
├── welder-editor/                 (folder)
│   ├── Epics                      strategic tracks (multi-sprint goals)
│   ├── Sprints                    sprint container (one item per sprint)
│   ├── Tasks                      work items — sync target for PRs
│   ├── Retrospectives             sprint retro notes + action items
│   ├── Bugs Queue                 bug intake (form-fed) + triage
│   └── Capacity                   per-sprint capacity planning
└── <next-plugin>/                 (one folder per plugin going forward)
    ├── Epics
    ├── Sprints
    ├── Tasks
    ├── Retrospectives
    ├── Bugs Queue
    └── Capacity
```

There is **no PR Inbox board.** Shared-code PRs without an explicit `Resolves MON-<id>` are not tracked in Monday — file an item explicitly if the work needs visibility.

## 3. The 6 boards — what each one is for

### Tasks (sync target for PRs)

Work items at the sprint-or-smaller granularity. The board the PR sync touches.

Standard columns (from Scrum Team template, untouched):

- **Name** — task subject (`<verb> <object>` style)
- **Owner** — the human responsible
- **Status** (`task_status`) — `Ready to start` / `In Progress` / `Waiting for review` / `Pending Deploy` / `Done` / `Stuck`
- **Priority** — Critical / High / Medium / Low / Best Effort / Missing
- **Type** — Feature / Bug / Quality / Test / Security / Other
- **Estimated SP / Actual SP** — story points
- **GitHub link** (`link`) — auto-set by sync on PR open
- **Unplanned?** — flag for tasks added mid-sprint
- **Task ID** — auto with `TDEV` prefix
- **Epic** (board_relation) — the parent epic on the Epics board
- **Sprint** (board_relation) — the parent sprint on the Sprints board
- **Active sprint / Sprint Completed?** — mirror columns from Sprints
- **Size** (custom dropdown) — XS / S / M / L / XL
- **Owner Agent** (custom dropdown) — `project-pm` / `figma-api-engineer` / `ui-engineer` / `plugin-tester` / `release-engineer` / `product-researcher`

The custom dropdowns (`Size`, `Owner Agent`) are the only added-value columns on top of the standard template. Don't add more without an ADR.

### Sprints

One item per sprint. Standard columns: name, sprint goals, active sprint checkbox, sprint timeline (date range), connected tasks, completed checkbox, start/end dates, link to Capacity, plus a custom **Operating Mode** dropdown (`manual` / `sprint-task` / `sprint-auto`) for sprint-level agent autonomy settings.

### Epics

Strategic tracks spanning multiple sprints. Standard columns: name, owner, planned timeline, Phase status (Backlog → Product discovery → Ready to design → Design WIP → Dev discovery → Dev WIP → Dev deploy → Beta → Full release), priority (Critical/Must Have/Nice to Have/Best Effort), product requirements doc, connected tasks (sum of estimated effort), Epic ID (`EDEV` prefix), plus the custom **Owner Agent** dropdown.

### Retrospectives

Sprint-end retro notes. Standard columns: name, action items (subitems), submitter, type (Discussion/Keep/Improve), repeating?, vote, owner, linked sprint, spawned tasks (board_relation back to Tasks).

### Bugs Queue

Bug intake. The board's built-in **Bug Reporting Form** ([Monday's "Bug Reporting Form" view](https://larsvdloos-team.monday.com/boards/5095865858)) lets reporters file bugs without Monday access. Columns: name, reporter, time tracking, status (Awaiting Review → Ready for Dev → Fixing → Fixed / Move to Sprints / Known Bug / Duplicated / Pending Deploy / Missing Info), priority, connected tasks, Bug ID (`BDEV` prefix), custom **Severity** dropdown (P0/P1/P2/P3), **Owner Agent** dropdown, **Found in version** text, **Repro confirmed** checkbox.

Bugs that need engineering work get linked to a Task on the Tasks board (via the `Connected tasks` column) and that Task carries the work in the sprint.

### Capacity

Per-sprint capacity planning. Standard columns: name, owner, vacation days, team days off, avg velocity, sprint working days (formula), capacity (formula), sprint relation, approved checkbox, hidden checkbox, actual velocity, sprint timeline mirror.

For a solo dev, this board is light — one row per sprint with `velocity` set and `approved` checked. Becomes valuable when a second person joins.

## 4. Status workflow on the Tasks board

The `task_status` column transitions:

```
 Ready to start → In Progress → Waiting for review → Pending Deploy → Done
                                       ↓
                                    Stuck (manual; needs comment)
```

**Transitions on `In Progress`, `Waiting for review`, `Done` are automated by `monday-sync.yml`, not manual.** Manual changes to `Stuck` require a comment with reason.

| Status             | Trigger                                                                         | Set by                   |
| ------------------ | ------------------------------------------------------------------------------- | ------------------------ |
| Ready to start     | Item created and planned into a sprint                                          | Manual (sprint planning) |
| In Progress        | PR opened referencing `Resolves MON-<id>`                                       | `monday-sync.yml`        |
| Waiting for review | PR moves out of draft (`ready_for_review`) OR a review is submitted             | `monday-sync.yml`        |
| Pending Deploy     | Manual — between merge and deploy/release if a separate deploy step is involved | Manual                   |
| Done               | PR merged                                                                       | `monday-sync.yml`        |
| Stuck              | Manual; requires Notes comment                                                  | Manual                   |

`Pending Deploy` is a Scrum Team default state we don't drive automatically — release tooling can flip it manually if a deploy is gated separately from the merge.

## 5. GitHub sync rules

`tools/monday-sync/sync.py` triggers on:

- `pull_request` events: `opened`, `ready_for_review`, `closed`
- `pull_request_review` events: `submitted`

Logic:

1. Parse `Resolves MON-<id>` from the PR body. Multiple Resolves lines allowed.
2. Detect which `plugins/<slug>/` directories the PR touched via `git diff --name-only`.
3. For each touched plugin, read `plugins/<slug>/plugin.toml` for its `monday.tasks_board_id` and `monday.enabled`.
4. Update the matching item on each plugin's Tasks board: `task_status` and `link` columns.

Cross-plugin PRs update each touched plugin's Tasks board for each MON id. Shared-only PRs with `Resolves MON-<id>` look up the home board via the Monday API. Shared-only PRs **without** `Resolves MON-<id>` are silently skipped.

## 6. Sprint cadence

Two-week sprints, fixed:

- **Day 1 (Mon):** sprint planning. Select Tasks from Backlog, set Sprint, set Owner / Owner Agent / Size / Estimated SP. Roll the Sprints item to "Active sprint" and set the timeline.
- **Daily:** brief standup notes in `docs/standups/YYYY-MM-DD.md` — one paragraph per agent, what shipped, what's blocked.
- **Day 9 (Wed):** code freeze. Cut release branch (or freeze main if hotfix-only).
- **Day 10 (Thu):** RC validation by `ui-engineer` + e2e gauntlet.
- **Day 11 (Fri):** retrospective. Add items to the Retrospectives board (Discussion / Keep / Improve). Vote, identify action items, link spawned tasks back to the Tasks board.

Sprint name format: `S<year>-W<start>-W<end>` — e.g. `S2026-W18-W19`.

## 7. Naming conventions

- **Task name**: `<verb> <object>` style — e.g. `Add toolbar redesign for compact width`, `Fix selection lost on undo`. Keep crisp; surface details in the task body.
- **Branch name**: `<type>/MON-<id>-<slug>` — e.g. `feature/MON-1234-toolbar-redesign`. Type ∈ `{feature, bugfix, chore, hotfix}`.
- **Commit subject**: `<type>(<scope>): <subject> [#MON-<id>]` — type ∈ `{feat, fix, chore, docs, refactor, test, perf}`; scope ∈ plugin slug (e.g. `welder-editor`) or shared dir (`components`, `sections`, `packages`, `tools`, `runbooks`, `docs`).
- **PR title**: same as the canonical commit message — `<type>(<scope>): <subject> [#MON-<id>]`.
- **PR description**: must contain `Resolves MON-<id>` (one line per item resolved by this PR). The numeric `<id>` is the Monday item ID — visible in the URL when you open the task on the Tasks board, e.g. `https://larsvdloos-team.monday.com/boards/5095865862/pulses/<id>` → `<id>` is the MON id.

## 8. Cross-plugin reporting

Workspace-level dashboards (built atop the Scrum Team boards):

- **Active sprint progress** — items by status, by plugin, this sprint.
- **Burndown** — Scrum Team's standard burndown widget per sprint.
- **Bugs by severity** — open bugs across plugins, grouped by P0/P1/P2/P3.
- **Cross-plugin epic timeline** — Epics across all plugins on a Gantt view.
- **Velocity trend** — actual vs estimated SP per sprint per plugin.

Dashboards depend on every plugin folder using the standard Scrum Team template untouched. Custom columns added to one plugin's boards don't break the dashboard; missing standard columns do.

## 9. Onboarding playbook (new plugin)

When a new plugin starts:

1. **Duplicate the Scrum Team template into a new folder.** In Monday, workspace 6325546 → "+" → "Add folder from template" → "Scrum Team" → name the folder `<plugin-slug>`.
2. **Open each of the 6 boards** in the new folder and copy the numeric ID from each URL.
3. **Run `bootstrap-plugin <slug> "<Display Name>" --folder-id <folder-id>`** to scaffold the local plugin directory.
4. **Edit `plugins/<slug>/plugin.toml`** — paste the 6 board IDs (Tasks, Sprints, Epics, Bugs Queue, Retrospectives, Capacity) under `[monday]`.
5. **Verify the GitHub repo integration is set on the Tasks board** (Integrate → GitHub → Connect repo → `larsvanderloo/figma-plugins`).
6. **Add the new plugin's boards to any cross-plugin dashboards** in the workspace home.
7. **Create the first sprint** on the Sprints board with goal "Scaffold and first feature."
8. **Commit the local scaffold**: `git checkout -b feature/MON-<id>-scaffold-<slug>`, `git add plugins/<slug>/`, follow normal commit + PR flow.

## 10. Shared-code work without a plugin

PRs touching only `components/`, `sections/`, `packages/`, `tools/`, `runbooks/`, `docs/`, or `.github/` don't have a default plugin board. Two options:

- **Track it on a plugin's Tasks board** if the work is being done in service of a single plugin. Use that plugin's MON id in the PR.
- **Don't track it in Monday** if the work is genuinely cross-cutting and not tied to a sprint goal. The PR still goes through the normal review and merge flow.

There is no PR Inbox board for the second case. If a piece of cross-cutting work needs sprint visibility, file a Task on a plugin's board (or open a new shared "platform" plugin folder if cross-cutting work becomes a regular thing).

## 11. Drift handling

Weekly reconciliation (Friday afternoon, by `project-pm`):

- Audit any items in `In Progress` for > 14 days. Either still in flight (update with comment) or dropped (move to `Stuck` with reason).
- Audit any open PRs without a corresponding `Resolves MON-<id>`. File a Task retroactively or close the PR.
- Audit any merged PRs whose Tasks board items aren't in `Done`. Manually advance with a `[reconcile]` comment.

Drift in either direction is normal; uncorrected drift is what loses the audit trail.
