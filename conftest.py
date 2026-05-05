"""Pytest configuration for the figma-plugins monorepo.

Adds tooling source paths to sys.path so tests can import them without
requiring an editable install in CI's ephemeral venvs.
"""

from __future__ import annotations

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent

_extra_paths = [
    REPO_ROOT,
    REPO_ROOT / "tools",
]

for path in _extra_paths:
    spath = str(path)
    if path.exists() and spath not in sys.path:
        sys.path.insert(0, spath)
