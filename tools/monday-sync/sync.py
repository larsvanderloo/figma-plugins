"""GitHub → Monday.com sync (figma-plugins, Scrum Team edition).

Triggered by GitHub Actions on PR/review/workflow_run events. For each
plugins/<slug>/ directory the PR touched:
  1. Read plugins/<slug>/plugin.toml for the Tasks board ID.
  2. If the PR body has "Resolves MON-{id}", update that item on the
     Tasks board's `task_status` and `link` columns.

Cross-plugin PRs update each affected plugin's Tasks board.

Shared-only PRs (touching only components/, sections/, packages/, tools/,
docs/, ...) that resolve a `MON-{id}` reference look up the item's home
board via the Monday API and update there. Without `Resolves MON-{id}`,
shared-only PRs are silently skipped (no PR Inbox in this monorepo).

Targeted boards: Monday's standard "Scrum Team" Tasks board per plugin
folder, in workspace 6325546 (Figma Plugins). Each plugin has its own
folder with the 6-board template (Epics, Sprints, Tasks, Retrospectives,
Bugs Queue, Capacity); only Tasks is the sync target.
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
import tomllib
from pathlib import Path
from typing import Any

import requests

MONDAY_API_URL = "https://api.monday.com/v2"

# Accepts both `Resolves MON-1234` and the markdown-link form
# `Resolves [MON-1234](https://...)`. Bare `MON-NNNN` mentions WITHOUT the
# `Resolves` prefix are intentionally NOT matched — PR bodies routinely
# mention follow-up items in prose and matching those would accidentally
# update them.
MON_ID_PATTERN = re.compile(r"Resolves\s+\[?MON-(\d+)", re.IGNORECASE)

# Column IDs on Monday's standard Scrum Team Tasks board. Stable across
# duplications of the template.
COL_TASK_STATUS = "task_status"  # status column: "Ready to start", "In Progress",
                                  # "Waiting for review", "Pending Deploy", "Done", "Stuck"
COL_GITHUB_LINK = "link"          # link column: GitHub PR URL

# task_status labels we drive from PR events. Names must match the labels
# configured on the Scrum Team Tasks board exactly (case-sensitive).
STATUS_IN_PROGRESS = "In Progress"
STATUS_WAITING_REVIEW = "Waiting for review"
STATUS_DONE = "Done"

REPO_ROOT = Path(__file__).resolve().parents[2]


def gql(query: str, variables: dict | None = None, retry: int = 2) -> dict[str, Any]:
    """Call Monday GraphQL API with simple retry on transient failure."""
    token = os.environ["MONDAY_API_TOKEN"]
    headers = {"Authorization": token, "Content-Type": "application/json", "API-Version": "2024-10"}
    payload = {"query": query, "variables": variables or {}}
    last_err: Exception | None = None
    for attempt in range(retry + 1):
        try:
            resp = requests.post(MONDAY_API_URL, json=payload, headers=headers, timeout=20)
            resp.raise_for_status()
            data = resp.json()
            if "errors" in data:
                # RuntimeError (not sys.exit) so the outer try/except in main()
                # catches it and the rest of the dispatch can proceed for
                # multi-Resolves PRs and multi-plugin updates.
                error_blob = json.dumps(data["errors"])
                print(f"::error::Monday GraphQL errors: {error_blob}", file=sys.stderr)
                raise RuntimeError(f"Monday GraphQL errors: {error_blob}")
            return data["data"]
        except (requests.HTTPError, requests.Timeout, requests.ConnectionError) as e:
            last_err = e
            if attempt < retry:
                time.sleep(1.5**attempt)
                continue
            raise
    raise last_err  # type: ignore[misc]


def parse_all_mon_ids(text: str | None) -> list[int]:
    """Return every MON id resolved by the body, in source order.

    A PR body may legitimately resolve multiple Monday items (e.g. a
    refactor that closes two parent tickets). Each `Resolves MON-NNNN`
    line is honoured; bare `MON-NNNN` mentions without the `Resolves`
    prefix are ignored.

    Duplicates are de-duplicated while preserving first-seen order.
    """
    if not text:
        return []
    seen: set[int] = set()
    out: list[int] = []
    for m in MON_ID_PATTERN.finditer(text):
        mid = int(m.group(1))
        if mid not in seen:
            seen.add(mid)
            out.append(mid)
    return out


def load_event() -> dict[str, Any]:
    path = os.environ.get("GITHUB_EVENT_PATH")
    if not path or not os.path.exists(path):
        print("::error::GITHUB_EVENT_PATH not set or missing")
        sys.exit(1)
    with open(path) as f:
        return json.load(f)


def gh_get(url: str) -> dict | None:
    """GET from GitHub API using GITHUB_TOKEN."""
    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        return None
    resp = requests.get(
        url,
        headers={"Authorization": f"token {token}", "Accept": "application/vnd.github+json"},
        timeout=15,
    )
    if resp.status_code != 200:
        return None
    return resp.json()


def list_pr_files(pr_number: int) -> list[str]:
    """List files touched by a PR, paginated."""
    repo = os.environ.get("GITHUB_REPOSITORY", "")
    if not repo:
        return []
    files: list[str] = []
    page = 1
    while True:
        url = (
            f"https://api.github.com/repos/{repo}/pulls/{pr_number}/files?per_page=100&page={page}"
        )
        data = gh_get(url)
        if not data:
            break
        if not isinstance(data, list) or not data:
            break
        files.extend(f["filename"] for f in data)
        if len(data) < 100:
            break
        page += 1
    return files


def affected_plugin_slugs(changed_files: list[str]) -> list[str]:
    """Extract unique plugin slugs from changed file paths."""
    slugs: set[str] = set()
    for f in changed_files:
        parts = f.split("/")
        if len(parts) >= 2 and parts[0] == "plugins" and parts[1] != "_template":
            slugs.add(parts[1])
    return sorted(slugs)


def load_plugin_config(slug: str) -> dict[str, Any] | None:
    """Read plugins/<slug>/plugin.toml. Returns None if missing or malformed."""
    path = REPO_ROOT / "plugins" / slug / "plugin.toml"
    if not path.exists():
        return None
    try:
        with open(path, "rb") as f:
            return tomllib.load(f)
    except tomllib.TOMLDecodeError as e:
        print(f"::warning::failed to parse {path}: {e}", file=sys.stderr)
        return None


def plugin_tasks_board_id(slug: str) -> str | None:
    """Look up Monday Tasks board ID for a plugin slug from its plugin.toml."""
    cfg = load_plugin_config(slug)
    if not cfg:
        return None
    monday = cfg.get("monday", {})
    if not monday.get("enabled", True):
        return None
    bid = monday.get("tasks_board_id")
    if not bid or str(bid).startswith("REPLACE_WITH_"):
        return None
    return str(bid)


def update_item_on_board(board_id: str, item_id: int, column_values: dict[str, Any]) -> None:
    """Update columns on a specific Monday board item."""
    query = """
    mutation Update($boardId: ID!, $itemId: ID!, $values: JSON!) {
      change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $values) { id }
    }
    """
    gql(
        query,
        {
            "boardId": str(board_id),
            "itemId": str(item_id),
            "values": json.dumps(column_values),
        },
    )
    print(f"  → updated MON-{item_id} on board {board_id} ({list(column_values.keys())})")


def all_plugin_tasks_board_ids() -> list[str]:
    """Enumerate Tasks board IDs from every plugins/<slug>/plugin.toml.

    Used as a fallback discovery list when a PR resolves a MON item but
    its file paths only touch shared (non-plugin) directories.
    """
    plugins_dir = REPO_ROOT / "plugins"
    if not plugins_dir.exists():
        return []
    boards: list[str] = []
    for sub in sorted(plugins_dir.iterdir()):
        if not sub.is_dir() or sub.name == "_template":
            continue
        bid = plugin_tasks_board_id(sub.name)
        if bid:
            boards.append(bid)
    return boards


def discover_board_for_mon_item(mon_id: int) -> str | None:
    """Return the board ID hosting `mon_id`, or None if it can't be found.

    First asks Monday directly via the `items` query (cheapest, exact).
    Falls back to scanning every known Tasks board if the API path
    fails — slower, but resilient to API hiccups.
    """
    query = """
    query ItemBoard($itemId: ID!) {
      items(ids: [$itemId]) {
        id
        board { id }
      }
    }
    """
    try:
        data = gql(query, {"itemId": str(mon_id)})
        items = data.get("items") or []
        if items and items[0].get("board"):
            return str(items[0]["board"]["id"])
    except (requests.HTTPError, requests.Timeout, requests.ConnectionError) as e:
        print(
            f"::warning::Monday items lookup for MON-{mon_id} failed ({e}); "
            "falling back to Tasks-board scan",
            file=sys.stderr,
        )
    item_query = """
    query BoardItem($boardId: ID!, $itemId: ID!) {
      boards(ids: [$boardId]) {
        items_page(query_params: {ids: [$itemId]}) {
          items { id }
        }
      }
    }
    """
    for bid in all_plugin_tasks_board_ids():
        try:
            data = gql(item_query, {"boardId": bid, "itemId": str(mon_id)})
            boards = data.get("boards") or []
            items = (boards[0].get("items_page") or {}).get("items") if boards else []
            if items:
                return bid
        except (requests.HTTPError, requests.Timeout, requests.ConnectionError):
            continue
    return None


def update_each_affected_plugin(pr: dict[str, Any], column_values: dict[str, Any]) -> None:
    """For each plugin the PR touched, update its Monday Tasks board item.

    Behaviour for `Resolves MON-NNNN`:
      - Multiple `Resolves` lines all get updated (multi-resolution PRs).
      - If the PR's files touch one-or-more plugins/<slug>/ paths, each
        item is updated on every affected slug's Tasks board.
      - If the PR's files touch only shared code (no plugin paths), we
        ask Monday which board the MON item lives on and update there.
        Shared-only PRs without `Resolves MON-{id}` are skipped silently
        (no PR Inbox in this monorepo).
    """
    mon_ids = parse_all_mon_ids(pr.get("body") or "")
    if not mon_ids:
        print("  (no Resolves MON-{id} in PR body — skipping Tasks board updates)")
        return

    files = list_pr_files(pr["number"])
    slugs = affected_plugin_slugs(files)

    if slugs:
        for mon_id in mon_ids:
            for slug in slugs:
                bid = plugin_tasks_board_id(slug)
                if not bid:
                    print(f"  (plugin {slug!r} has no tasks_board_id configured — skipping)")
                    continue
                try:
                    update_item_on_board(bid, mon_id, column_values)
                except Exception as e:
                    print(
                        f"::warning::failed to update {slug!r} (board {bid}, MON-{mon_id}): {e}",
                        file=sys.stderr,
                    )
        return

    # Shared-only PR with explicit Resolves intent. Discover each item's
    # home board via the Monday API and update there.
    print(
        "  (PR touches no plugins/<slug>/ paths — discovering home boards "
        f"for {len(mon_ids)} MON item(s) via Monday API)"
    )
    for mon_id in mon_ids:
        bid = discover_board_for_mon_item(mon_id)
        if not bid:
            print(
                f"::warning::could not locate a Monday board for MON-{mon_id} "
                "(item may not exist, token may lack scope, or item is on a "
                "non-Tasks board) — skipping",
                file=sys.stderr,
            )
            continue
        try:
            update_item_on_board(bid, mon_id, column_values)
        except Exception as e:
            print(
                f"::warning::failed to update MON-{mon_id} on board {bid}: {e}",
                file=sys.stderr,
            )


# ------------- Event handlers -------------


def handle_pull_request(event: dict[str, Any]) -> None:
    action = event["action"]
    pr = event["pull_request"]

    if action == "opened":
        update_each_affected_plugin(
            pr,
            {
                COL_TASK_STATUS: {"label": STATUS_IN_PROGRESS},
                COL_GITHUB_LINK: {"url": pr["html_url"], "text": f"PR #{pr['number']}"},
            },
        )

    elif action == "ready_for_review":
        update_each_affected_plugin(
            pr,
            {COL_TASK_STATUS: {"label": STATUS_WAITING_REVIEW}},
        )

    elif action == "closed":
        if pr.get("merged"):
            update_each_affected_plugin(
                pr,
                {COL_TASK_STATUS: {"label": STATUS_DONE}},
            )
        # If closed without merging, leave status as-is. Use the Stuck
        # label on Tasks board manually if the work is genuinely abandoned.


def handle_review(event: dict[str, Any]) -> None:
    """When a review is submitted, advance status to Waiting for review.

    Scrum Team's Tasks board has no separate Approved / Changes Requested
    state — both stay at Waiting for review until the PR is merged. The
    Tasks board's task_status column is intentionally lean.
    """
    action = event.get("action")
    if action != "submitted":
        return
    pr = event["pull_request"]
    update_each_affected_plugin(
        pr,
        {COL_TASK_STATUS: {"label": STATUS_WAITING_REVIEW}},
    )


def main() -> None:
    event_name = os.environ.get("GITHUB_EVENT_NAME", "")
    event = load_event()

    handlers = {
        "pull_request": handle_pull_request,
        "pull_request_review": handle_review,
    }
    handler = handlers.get(event_name)
    if not handler:
        print(f"No handler for event '{event_name}'; nothing to do.")
        return

    print(f"monday-sync: handling {event_name}.{event.get('action', '?')}")
    try:
        handler(event)
    except Exception as e:
        # Don't fail the workflow on sync hiccups — surface as warning instead.
        print(f"::warning::Monday sync failed: {type(e).__name__}: {e}", file=sys.stderr)


if __name__ == "__main__":
    main()
