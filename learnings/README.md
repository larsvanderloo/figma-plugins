# Cross-plugin learnings

This directory collects patterns, anti-patterns, gotchas, and post-mortems that span more than one plugin or feature. Plugin-specific decisions belong in `plugins/<slug>/docs/adr/` instead.

See `runbooks/cross-plugin-learnings.md` for the full process: when to add, how to write, how curation works.

## When to add to this directory

- A bug or pitfall has bitten two or more plugins (or is likely to)
- A technique that worked beautifully in one plugin should be considered for others
- A performance optimisation with cross-cutting impact
- A post-mortem on something that broke in production
- A reference pattern (e.g., "how to handle multi-editor-type state") that's relevant to multiple plugin families

## Layout

```
learnings/
├── README.md                          (this file)
├── patterns/                          What worked — recommend reusing
│   └── NNNN-<title>.md
├── anti-patterns/                     What didn't work — recommend avoiding
│   └── NNNN-<title>.md
└── post-mortems/                      What broke and what we changed
    └── YYYY-MM-DD-<title>.md
```

Numbered files use 4-digit zero-padded sequence (0001, 0002, …) within each subdirectory.

## Format

Each entry is a short markdown doc with these sections:

```markdown
# <Title>

**Status:** active | superseded | obsolete
**Date:** YYYY-MM-DD
**Origin:** <plugin slug or "general">
**Related:** <links to ADRs, PRs, items>

## Context

What was the situation? What constraints applied?

## Pattern / anti-pattern / failure mode

The thing itself, in concrete terms. Code or screenshots if useful.

## Recommendation

What should other plugins do or avoid based on this?

## Why this matters

The cost of getting it wrong, or the value of getting it right.
```

Keep entries to a single page. Link out to longer artifacts (ADRs, PRs, demos) rather than duplicating.

## Curation

`release-engineer` reviews this directory weekly during the team's audit pipeline (see `runbooks/audit-pipeline.md`) and decides:

- Should new entries be added based on recent PRs / external feedback?
- Should existing entries be marked superseded by newer practice?
- Are there cross-references to add?

`project-pm` refers to this directory during sprint planning to flag known landmines.
