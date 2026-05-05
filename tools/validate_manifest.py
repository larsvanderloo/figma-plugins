#!/usr/bin/env python3
"""Validate a Figma plugin manifest.json against a minimal schema.

Catches typos in editorType, missing required fields, or unknown editorType
values before the plugin fails to load in Figma. Called from
.github/workflows/validate.yml for every plugins/<slug>/manifest.json.

Usage:
    python tools/validate_manifest.py <path-to-manifest.json>

Exit codes:
    0  manifest is valid
    1  manifest is missing required keys, has unknown editorType, or is malformed
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

REQUIRED_KEYS = ("name", "id", "api", "main", "ui", "editorType")
ALLOWED_EDITORS = {"figma", "figjam", "slides"}


def main() -> int:
    if len(sys.argv) != 2:
        print(f"usage: {sys.argv[0]} <manifest.json>", file=sys.stderr)
        return 1
    path = Path(sys.argv[1])
    if not path.exists():
        print(f"ERROR: {path} does not exist", file=sys.stderr)
        return 1
    try:
        with path.open() as f:
            m = json.load(f)
    except json.JSONDecodeError as e:
        print(f"ERROR: {path} is not valid JSON: {e}", file=sys.stderr)
        return 1

    missing = [k for k in REQUIRED_KEYS if k not in m]
    if missing:
        print(f"ERROR: {path} is missing required keys: {missing}", file=sys.stderr)
        return 1

    editors = m.get("editorType")
    if not isinstance(editors, list) or not editors:
        print(
            f"ERROR: {path} editorType must be a non-empty array (got {editors!r})",
            file=sys.stderr,
        )
        return 1
    unknown = set(editors) - ALLOWED_EDITORS
    if unknown:
        print(
            f"ERROR: {path} has unknown editorType values: {sorted(unknown)} "
            f"(allowed: {sorted(ALLOWED_EDITORS)})",
            file=sys.stderr,
        )
        return 1

    print(f"  ✓ {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
