#!/usr/bin/env bash
# scripts/install-merge-driver.sh
#
# Registers a custom git merge driver for pnpm-lock.yaml so concurrent feature
# branches don't pile up trivial lockfile conflicts. Without this, every
# parallel section/feature PR conflicts on pnpm-lock.yaml the moment any one
# of them merges first — even when their package.json deltas are independent.
#
# Strategy: when git encounters a pnpm-lock.yaml conflict during merge or
# rebase, this driver discards both sides' lockfile content and runs
# `pnpm install --lockfile-only` to regenerate the lockfile from the current
# (merged) package.json files. The result is then written back to the merge
# target. Since package.json files merge cleanly almost always (sections live
# in separate files), this resolves the lockfile automatically.
#
# Idempotent: safe to run multiple times. Required once per repo clone — the
# `prepare` script in root package.json invokes it on every `pnpm install`.

set -euo pipefail

# Only register if we're inside a git repo and have pnpm available.
if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "scripts/install-merge-driver.sh: not in a git repo, skipping" >&2
  exit 0
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "scripts/install-merge-driver.sh: pnpm not on PATH, skipping" >&2
  exit 0
fi

# Driver definition. Git invokes the driver as:
#   <driver> %O %A %B %L %P
# where %A is the path to the "ours" version (which we overwrite with the
# regenerated lockfile). We don't need the others.
DRIVER='pnpm install --lockfile-only --no-frozen-lockfile --silent && cp pnpm-lock.yaml "$2"'

git config --local merge.pnpm-lockfile.name "Auto-regenerate pnpm-lock.yaml via pnpm install"
git config --local merge.pnpm-lockfile.driver "$DRIVER"
# %A position is $2 in the driver shell; %O=$1, %B=$3.

echo "✓ pnpm-lockfile merge driver registered (per-clone .git/config)"
