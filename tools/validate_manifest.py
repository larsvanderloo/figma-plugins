#!/usr/bin/env python3
"""Validate a Figma plugin manifest.json against a minimal schema.

Catches typos in editorType, missing required fields, or unknown editorType
values before the plugin fails to load in Figma. Called from
.github/workflows/validate.yml for every plugins/<slug>/manifest.json.

Optionally validates build artifacts when --build-artifacts is passed:
  - dist/code.js must start with an IIFE (no 'import' / 'export' at top-level)
  - dist/ui.html (or dist/ui/index.html) must be a single self-contained file
    with no external <script src=...> or <link href=...> references

Usage:
    python tools/validate_manifest.py <path-to-manifest.json>
    python tools/validate_manifest.py --build-artifacts <path-to-manifest.json>

Exit codes:
    0  manifest (and artifacts, when --build-artifacts) are valid
    1  manifest is missing required keys, has unknown editorType, malformed JSON,
       or (with --build-artifacts) an artifact regression is detected
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

REQUIRED_KEYS = ("name", "id", "api", "main", "ui", "editorType")
ALLOWED_EDITORS = {"figma", "figjam", "slides"}

# Patterns that indicate a non-IIFE JS module (ES module leak into code.js)
_ES_MODULE_PATTERN = re.compile(r"^\s*(import\b|export\b)", re.MULTILINE)

# Patterns that indicate external resource references in ui.html
_EXTERNAL_SCRIPT_PATTERN = re.compile(r"<script[^>]+src\s*=", re.IGNORECASE)
_EXTERNAL_LINK_PATTERN = re.compile(r"<link[^>]+href\s*=", re.IGNORECASE)

_SAMPLE_BYTES = 100


def validate_manifest(path: Path) -> int:
    """Check manifest schema. Returns 0 on success, 1 on failure."""
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

    print(f"  ✓ manifest {path}")
    return 0


def validate_build_artifacts(manifest_path: Path) -> int:
    """Check that dist/code.js is an IIFE and dist/ui.html is self-contained.

    Resolves artifact paths relative to the plugin directory (parent of
    manifest.json).

    Returns 0 if all checks pass, 1 if any check fails.
    """
    plugin_dir = manifest_path.parent
    errors: list[str] = []

    # --- code.js: must be IIFE (no top-level import/export) ---
    code_js = plugin_dir / "dist" / "code.js"
    if not code_js.exists():
        errors.append(f"ARTIFACT ERROR: {code_js} does not exist (run `pnpm build` first)")
    else:
        with code_js.open(encoding="utf-8", errors="replace") as f:
            head = f.read(_SAMPLE_BYTES)
        if _ES_MODULE_PATTERN.match(head):
            errors.append(
                f"ARTIFACT ERROR: {code_js} starts with 'import' or 'export' — "
                "code.js must be an IIFE with no ES module statements at the top level. "
                f"First {_SAMPLE_BYTES} chars: {head!r}"
            )
        else:
            print(f"  ✓ code.js IIFE check ({code_js})")

    # --- ui artifact: must be self-contained (no external src= / href=) ---
    # Accept both dist/ui.html (vite-plugin-singlefile output, preferred) and
    # dist/ui/index.html (Vite multi-entry HTML shell, legacy).
    ui_candidates = [
        plugin_dir / "dist" / "ui.html",
        plugin_dir / "dist" / "ui" / "index.html",
    ]
    ui_file: Path | None = next((p for p in ui_candidates if p.exists()), None)
    if ui_file is None:
        errors.append(
            f"ARTIFACT ERROR: neither {ui_candidates[0]} nor {ui_candidates[1]} exists "
            "(run `pnpm build` first)"
        )
    else:
        content = ui_file.read_text(encoding="utf-8", errors="replace")
        if _EXTERNAL_SCRIPT_PATTERN.search(content):
            errors.append(
                f"ARTIFACT ERROR: {ui_file} contains a <script src=...> reference. "
                "ui.html must be fully self-contained (vite-plugin-singlefile must inline "
                "all scripts). External script references will silently fail inside the "
                "Figma plugin iframe sandbox."
            )
        elif _EXTERNAL_LINK_PATTERN.search(content):
            errors.append(
                f"ARTIFACT ERROR: {ui_file} contains a <link href=...> reference. "
                "ui.html must be fully self-contained (vite-plugin-singlefile must inline "
                "all stylesheets). External link references will silently fail inside the "
                "Figma plugin iframe sandbox."
            )
        else:
            print(f"  ✓ ui.html self-contained check ({ui_file})")

    for err in errors:
        print(err, file=sys.stderr)
    return 1 if errors else 0


def main() -> int:
    args = sys.argv[1:]
    build_artifacts = False

    if "--build-artifacts" in args:
        build_artifacts = True
        args = [a for a in args if a != "--build-artifacts"]

    if len(args) != 1:
        print(
            f"usage: {sys.argv[0]} [--build-artifacts] <manifest.json>",
            file=sys.stderr,
        )
        return 1

    path = Path(args[0])

    rc = validate_manifest(path)
    if rc != 0:
        return rc

    if build_artifacts:
        rc = validate_build_artifacts(path)

    return rc


if __name__ == "__main__":
    sys.exit(main())
