"""Local CLI wrapper for tools/monday-sync/sync.py.

Runs Monday sync from your dev machine instead of GitHub Actions. Useful
for solo work where the CI billing overhead isn't justified, or any time
you want to push state to Monday without waiting on Actions.

Usage:
  sync-pr <pr-number> [event]

Events:
  opened (default)     first-time sync: flips Tasks-board status to "In
                       Progress" and sets the GitHub PR link
  ready_for_review     when leaving draft state: status to "Waiting for
                       review"
  closed               after merge: status to "Done". After close
                       without merge: no change.

Token sources, in order:
  1. MONDAY_API_TOKEN environment variable
  2. ./.monday-token file at the repo root (gitignored)
  3. exit with error
GITHUB_TOKEN is read from `gh auth token` if not in env.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
SUPPORTED_EVENTS = ("opened", "ready_for_review", "closed")


def gh(*args: str) -> str:
    return subprocess.check_output(["gh", *args], text=True).strip()


def repo_slug() -> str:
    return gh("repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner")


def load_monday_token() -> str:
    token = os.environ.get("MONDAY_API_TOKEN")
    if token:
        return token
    token_file = REPO_ROOT / ".monday-token"
    if token_file.exists():
        return token_file.read_text().strip()
    sys.exit(
        "MONDAY_API_TOKEN not set and .monday-token not found.\n"
        "Either: export MONDAY_API_TOKEN=<token>  in your shell,\n"
        "or:     write the token to .monday-token  (gitignored) at the repo root."
    )


def load_github_token() -> str:
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        return token
    return gh("auth", "token")


def main() -> None:
    parser = argparse.ArgumentParser(description="Local Monday-sync CLI for a single PR.")
    parser.add_argument("pr_number", type=int)
    parser.add_argument(
        "event",
        nargs="?",
        default="opened",
        choices=SUPPORTED_EVENTS,
        help="event to simulate (default: opened)",
    )
    args = parser.parse_args()

    repo = repo_slug()
    pr = json.loads(gh("api", f"repos/{repo}/pulls/{args.pr_number}"))
    event = {"action": args.event, "number": pr["number"], "pull_request": pr}

    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
        json.dump(event, f)
        event_path = f.name

    env = os.environ.copy()
    env.update(
        {
            "MONDAY_API_TOKEN": load_monday_token(),
            "GITHUB_TOKEN": load_github_token(),
            "GITHUB_REPOSITORY": repo,
            "GITHUB_EVENT_NAME": "pull_request",
            "GITHUB_EVENT_PATH": event_path,
        }
    )

    sync_script = REPO_ROOT / "tools" / "monday-sync" / "sync.py"
    try:
        rc = subprocess.call([sys.executable, str(sync_script)], env=env)
    finally:
        Path(event_path).unlink(missing_ok=True)
    sys.exit(rc)


if __name__ == "__main__":
    main()
