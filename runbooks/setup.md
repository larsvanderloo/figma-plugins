# Setup — joining the figma-plugins monorepo

This is the per-developer setup runbook for an existing clone of the monorepo. If you're scaffolding the repo from scratch, see `HANDOFF.md` instead.

Owned by `project-pm`. ~10 minutes end-to-end.

---

## 1. Prereqs

- macOS arm64 (canonical platform) or Linux for non-canonical work.
- **Node.js 20+** (`brew install node@20` or use `nvm install 20`).
- **pnpm 9+** (`brew install pnpm` or `corepack enable`).
- **Python 3.11+** (required for `tomllib`). On macOS: `brew install python@3.11` if not already.
- **`gh` CLI** authenticated to GitHub (`gh auth login`).
- **`uv`** recommended for venv management (`brew install uv`).
- **Figma desktop** for canonical e2e testing (download from figma.com/downloads).

## 2. Clone and install tooling

```bash
git clone https://github.com/larsvanderloo/figma-plugins.git
cd figma-plugins
pnpm install
uv venv && uv pip install -e .
```

Verify the console scripts resolve:

```bash
source .venv/bin/activate
bootstrap-plugin --help
sync-pr --help
```

Verify the workspace builds (no plugins yet, but the workspace shape should resolve):

```bash
pnpm -r typecheck
```

## 3. GitHub secret (one-time per clone of the repo)

The `figma-plugins` repo already has this set in production. If you fork it or set up a parallel test repo:

```bash
gh secret set MONDAY_API_TOKEN     # paste token from Monday → Avatar → Developers → My Access Tokens
```

`MONDAY_API_TOKEN` may also live as `.monday-token` (gitignored) at the repo root for local `sync-pr` invocations.

There is no `MONDAY_PR_INBOX_BOARD_ID` variable — this monorepo uses Monday's standard Scrum Team template per plugin folder, and shared-code PRs are not tracked unless they explicitly resolve a plugin task.

## 4. Scaffold a plugin (when starting a new one)

```bash
bootstrap-plugin <slug> "<Display Name>" --folder-id <monday-folder-id>
```

Example:

```bash
bootstrap-plugin token-extract "Token Extract" --folder-id <id>
```

To set up Monday for a new plugin:

1. Open the [Figma Plugins workspace (6325546)](https://larsvdloos-team.monday.com/workspaces/6325546).
2. Click "+" → "Add folder from template" → select **"Scrum Team"** → name the new folder `<plugin-slug>`.
3. The folder URL contains the folder ID. Pass that to `--folder-id`.
4. After scaffolding, open each of the 6 boards in your new folder (Tasks, Sprints, Epics, Bugs Queue, Retrospectives, Capacity) and copy each numeric board ID from its URL into `plugins/<slug>/plugin.toml` under `[monday]`. ~2 minutes.

Without `--folder-id`, the scaffold still works — it just leaves all the Monday IDs as placeholders. Fill them in later, or pass `--no-monday` to disable sync entirely (offline/experimental plugins).

## 5. Monday-side automations (optional)

If you want auto-promotion from the **Bugs Queue** board into the Tasks board on triage, set up these recipes per-plugin folder (Monday's automation engine, no public API):

1. **On `Bugs Queue` status change to `Move to 'Sprints'` → create a Task on the Tasks board.** Connect the bug as a `Connected tasks` link.
2. **On `Tasks` status change to `In Progress` → create a GitHub Issue** (if you want issues separate from PRs).

These are workflow conveniences, not required for the GitHub→Monday PR sync. The PR sync runs from `tools/monday-sync/sync.py` (CI on the self-hosted runner, or `sync-pr` locally) and doesn't need them.

## 6. Day-to-day workflow

See `runbooks/monday-workflow.md` for the canonical lifecycle: pick a Task from the Tasks board (status `Ready to start`), branch as `<type>/MON-<id>-<slug>`, open a PR with `Resolves MON-<id>` in the body, watch status flip through `In Progress` → `Waiting for review` → `Done`.

For agent ownership, validation thresholds, plugin-thread rules, and the decision-discipline protocol agents follow when you push back, see `CLAUDE.md`.

## 7. Git hooks + commit signing (one-time per clone)

Git hooks are managed by **Lefthook** and install automatically when you run `pnpm install` (via the `prepare` script). No manual `git config` step is needed for new clones.

The pre-commit hook runs two jobs in parallel on every `git commit`:

- **prettier-write** — auto-formats staged `*.{ts,vue,md,json,yml}` files and re-stages the result. Deterministic and silent when nothing changes.
- **eslint** — lints staged `*.{ts,tsx}` files. Blocks the commit on any error (zero-warnings policy). No auto-fix; keeps changes deliberate.

The commit-msg hook runs the MON-id script at `.githooks/commit-msg-script.sh`: it auto-appends `[#MON-<id>]` to the commit subject when the branch slug contains a Monday ID (per the `<type>/MON-<id>-<slug>` convention in `runbooks/monday-workflow.md` §9), and warns (does not block) when no MON id is found.

To skip hooks in an emergency (e.g., a WIP stash during an interactive rebase): set `LEFTHOOK=0` before the git command. Use this sparingly — the hooks exist to catch the failures that burned Sprint 0.

If you are setting up a worktree (`git worktree add`) and `pnpm install` is not re-run in the worktree, run:

```bash
pnpm exec lefthook install --reset-hooks-path
```

from the worktree root to wire up the hooks there.

### Commit signing (optional, recommended once a key exists)

The canonical project-pm spec calls for signed commits as a hard branch-protection gate. Current branch protection does **not** require this gate — there's no signing key configured yet, so requiring signatures would block every merge.

When you set up a key (GPG or SSH), wire it up here:

```bash
# GPG path
gpg --full-generate-key                      # one-time, follow prompts
KEY_ID=$(gpg --list-secret-keys --keyid-format LONG | awk '/^sec/ {split($2,a,"/"); print a[2]; exit}')
git config user.signingkey "$KEY_ID"
git config commit.gpgsign true

# SSH path (alternative)
git config gpg.format ssh
git config user.signingkey ~/.ssh/id_ed25519.pub
git config commit.gpgsign true
```

Once a key is in place, file an ADR enabling the `signedCommits` branch protection rule on `main`.

## 8. Loading a plugin in Figma desktop

For local e2e testing during development:

1. Build the plugin: `pnpm --filter @figma-plugins/welder-editor build` (or run dev mode: `pnpm --filter @figma-plugins/welder-editor dev`).
2. Open Figma desktop.
3. `Plugins → Development → Import plugin from manifest…`
4. Select `plugins/welder-editor/manifest.json`.
5. The plugin appears under `Plugins → Development → Welder Editor` and can be run from there.

For dev-mode hot reload, run `pnpm --filter @figma-plugins/welder-editor dev` in one terminal; the plugin re-loads on rebuild via Figma's dev plugin mechanism.

The full e2e gauntlet (running across design + FigJam + slides + web) lives in `runbooks/e2e-gauntlet.md`.
