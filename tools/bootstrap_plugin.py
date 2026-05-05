#!/usr/bin/env python3
"""Scaffold a new Figma plugin in this monorepo.

Copies plugins/_template/ into plugins/<slug>/, substituting placeholders
in known text-file extensions.

The Monday workspace template is the standard "Scrum Team" — duplicate
that template into a new folder under workspace 6325546 (Figma Plugins)
and pass the folder ID here. The 6 board IDs (Tasks/Sprints/Epics/Bugs
Queue/Retrospectives/Capacity) are left as placeholders in plugin.toml
for you to fill in once after scaffolding.

Usage:
    python tools/bootstrap_plugin.py <slug> "<Display Name>"
        [--folder-id FOLDER_ID] [--no-monday]
        [--editor-types figma,figjam,slides]

Examples:
    python tools/bootstrap_plugin.py welder-editor "Welder Editor" --folder-id 2990413
    python tools/bootstrap_plugin.py token-extract "Token Extract" --no-monday
    python tools/bootstrap_plugin.py figjam-only "FigJam Only" --editor-types figjam

After running:
    1. Edit plugins/<slug>/plugin.toml — fill in the 6 board IDs from your
       duplicated Scrum Team folder (Tasks, Sprints, Epics, Bugs Queue,
       Retrospectives, Capacity).
    2. cd plugins/<slug> && look around — adjust code/, ui/, shared/, tests/, docs/ as needed.
    3. pnpm install (workspace pulls in the new plugin).
    4. git add plugins/<slug>/ && git commit -m "feat(<slug>): scaffold"
    5. The first PR you push touching plugins/<slug>/ will sync to that
       plugin's Tasks board if its body has `Resolves MON-<id>`.
"""

from __future__ import annotations

import argparse
import shutil
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
TEMPLATE_DIR = REPO_ROOT / "plugins" / "_template"
PLUGINS_DIR = REPO_ROOT / "plugins"

# File extensions in which we substitute placeholders.
SUBSTITUTABLE = {
    ".toml",
    ".md",
    ".json",
    ".jsonc",
    ".ts",
    ".tsx",
    ".js",
    ".mjs",
    ".cjs",
    ".vue",
    ".html",
    ".css",
    ".yml",
    ".yaml",
    ".txt",
    ".py",
    ".sh",
    ".gitignore",
}

VALID_EDITOR_TYPES = {"figma", "figjam", "slides"}


def to_pascal_case(slug: str) -> str:
    """welder-editor → WelderEditor, token_extract → TokenExtract."""
    return "".join(part.capitalize() for part in slug.replace("_", "-").split("-") if part)


def to_pkg_name(slug: str) -> str:
    """welder-editor → welder-editor (already kebab-case)."""
    return slug.replace("_", "-")


def validate_slug(slug: str) -> None:
    if not slug:
        sys.exit("error: slug must not be empty")
    if not slug.replace("-", "").replace("_", "").isalnum():
        sys.exit(f"error: slug {slug!r} must contain only letters, digits, hyphens, underscores")
    if slug.startswith(("-", "_")):
        sys.exit(f"error: slug {slug!r} must not start with a hyphen or underscore")
    if slug == "_template":
        sys.exit("error: '_template' is reserved")


def parse_editor_types(raw: str | None) -> list[str]:
    """`figma,figjam,slides` → ["figma", "figjam", "slides"]."""
    if raw is None:
        return ["figma", "figjam", "slides"]
    types = [t.strip() for t in raw.split(",") if t.strip()]
    bad = [t for t in types if t not in VALID_EDITOR_TYPES]
    if bad:
        sys.exit(
            f"error: unknown editor types {bad!r}. Valid: {sorted(VALID_EDITOR_TYPES)}"
        )
    if not types:
        sys.exit("error: --editor-types must list at least one type")
    return types


def render_editor_types_for_manifest(types: list[str]) -> str:
    """Render a JSON array literal for the manifest's editorType field.

    `["figma", "figjam", "slides"]` — formatted on one line for readability
    in a generated manifest.
    """
    quoted = ", ".join(f'"{t}"' for t in types)
    return f"[{quoted}]"


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Scaffold a new Figma plugin from plugins/_template/",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument("slug", help="kebab-case slug, e.g. 'welder-editor' or 'token-extract'")
    ap.add_argument(
        "display_name",
        help="human-readable display name, e.g. 'Welder Editor'",
    )
    ap.add_argument(
        "--folder-id",
        help=(
            "Monday folder ID containing this plugin's duplicated Scrum Team "
            "boards (in workspace 6325546). The 6 board IDs are left as "
            "placeholders; fill them in plugin.toml once after scaffolding."
        ),
    )
    ap.add_argument(
        "--no-monday",
        action="store_true",
        help="disable Monday sync for this plugin (offline/experimental)",
    )
    ap.add_argument(
        "--editor-types",
        help=(
            "Comma-separated list of editor types. Valid: figma, figjam, slides. "
            "Default: all three."
        ),
    )
    args = ap.parse_args()

    validate_slug(args.slug)
    editor_types = parse_editor_types(args.editor_types)

    target = PLUGINS_DIR / args.slug
    if target.exists():
        sys.exit(f"error: plugins/{args.slug}/ already exists")
    if not TEMPLATE_DIR.exists():
        sys.exit(f"error: {TEMPLATE_DIR} does not exist — cannot scaffold")

    # Copy template
    shutil.copytree(TEMPLATE_DIR, target)

    # Build placeholder map. The 6 board-ID placeholders stay as
    # REPLACE_WITH_<NAME>_BOARD_ID strings — fill them in plugin.toml once
    # after scaffolding by reading the IDs off the duplicated Scrum Team
    # folder in Monday.
    placeholders = {
        "{{plugin_slug}}": args.slug,
        "{{plugin_name}}": args.display_name,
        "{{plugin_class}}": to_pascal_case(args.slug),
        "{{plugin_pkg}}": to_pkg_name(args.slug),
        "{{plugin_folder_id}}": args.folder_id or "REPLACE_WITH_FOLDER_ID",
        "{{plugin_tasks_board_id}}": "REPLACE_WITH_TASKS_BOARD_ID",
        "{{plugin_sprints_board_id}}": "REPLACE_WITH_SPRINTS_BOARD_ID",
        "{{plugin_epics_board_id}}": "REPLACE_WITH_EPICS_BOARD_ID",
        "{{plugin_bugs_board_id}}": "REPLACE_WITH_BUGS_BOARD_ID",
        "{{plugin_retros_board_id}}": "REPLACE_WITH_RETROS_BOARD_ID",
        "{{plugin_capacity_board_id}}": "REPLACE_WITH_CAPACITY_BOARD_ID",
        "{{monday_enabled}}": "false" if args.no_monday else "true",
        "{{editor_types_json}}": render_editor_types_for_manifest(editor_types),
        "{{editor_types_toml}}": "[" + ", ".join(f'"{t}"' for t in editor_types) + "]",
    }

    # Substitute in all eligible files
    substituted_files = 0
    for path in target.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix not in SUBSTITUTABLE and path.name not in {".gitignore"}:
            continue
        try:
            content = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        original = content
        for k, v in placeholders.items():
            content = content.replace(k, v)
        if content != original:
            path.write_text(content, encoding="utf-8")
            substituted_files += 1

    print(f"✓ Created plugins/{args.slug}/  ({substituted_files} files customised)")
    print(f"  Editor types: {editor_types}")

    if args.no_monday:
        print("  Monday sync disabled for this plugin (--no-monday).")
    else:
        print()
        print(f"  ⚠ Fill in the 6 Monday board IDs in plugins/{args.slug}/plugin.toml.")
        print("    Workflow:")
        print("      1. In Monday workspace 6325546 (Figma Plugins), duplicate the standard")
        print(f"         Scrum Team template into a new folder named '{args.slug}'.")
        print("      2. Open each of the 6 boards (Tasks, Sprints, Epics, Bugs Queue,")
        print("         Retrospectives, Capacity) and copy each board's numeric ID from its URL.")
        print(f"      3. Paste each ID into plugins/{args.slug}/plugin.toml under [monday].")
        if args.folder_id:
            print(f"    (Folder ID already set to {args.folder_id}.)")

    print()
    print("Next:")
    print(f"  cd plugins/{args.slug}")
    print("  # adjust code/, ui/, shared/, tests/, docs/ as needed")
    print(f"  cd {REPO_ROOT}")
    print("  pnpm install")
    print(f"  git add plugins/{args.slug}/")
    print(f"  git commit -m 'feat({args.slug}): scaffold plugin'")


if __name__ == "__main__":
    main()
