#!/usr/bin/env bash
# Clear a STALE manifest-cache/ before version:assert / release:check / build.
#
# Why: version:assert scans manifest-cache/*/dist (the local, gitignored debug
# bundles) and fails if they carry an old version. After a debug session you
# bump + build prod, leaving those debug copies behind at the old version — a
# false failure on artifacts that never ship. write-debug-manifests.mjs only
# refreshes them while debug mode runs.
#
# Two ways to invoke:
#   1. Claude Code PreToolUse(Bash) hook — the tool-call JSON arrives on stdin;
#      we act only when the command is a release/build command (that runs
#      version:assert).
#   2. Manually / by a teammate: `bash scripts/clear-stale-manifest-cache.sh --force`
#      skips the command gate and clears the cache directly.
# Either way it acts only when no debug session is live (log server on :4789),
# so an active session's cache is never destroyed. Always exits 0 — never blocks.
set -uo pipefail
cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)"

if [ "${1:-}" != "--force" ]; then
  # Hook path: extract the Bash command from the payload (robust JSON parse)
  # and only proceed for release/build commands.
  cmd="$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);process.stdout.write((j.tool_input&&j.tool_input.command)||"")}catch(e){}})' 2>/dev/null || true)"
  case "$cmd" in
    *release:check*|*release:assert*|*version:assert*|*"npm run build"*) : ;;
    *) exit 0 ;;
  esac
fi

[ -d manifest-cache ] || exit 0          # nothing to clear
lsof -i :4789 >/dev/null 2>&1 && exit 0  # live debug session owns the cache

rm -rf manifest-cache
echo "[clear-stale-manifest-cache] removed stale manifest-cache/ before release/build (no debug session live)" >&2
exit 0
