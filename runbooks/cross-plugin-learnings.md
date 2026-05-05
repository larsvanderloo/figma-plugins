# Cross-plugin learnings

Owned by `release-engineer` (curation) and all senior agents (contribution).

This runbook describes how the team captures patterns, anti-patterns, and post-mortems that span more than one plugin or one feature. The actual learnings live in `learnings/`.

---

## 1. When something belongs in `learnings/`

Add to `learnings/` when:

- A bug or pitfall has bitten two or more plugins (or is likely to).
- A technique that worked beautifully in one plugin should be considered for others.
- A performance optimization with cross-cutting impact lands.
- A post-mortem on something that broke in production.
- A reference pattern (e.g., "how to handle multi-editor-type state") that's relevant to multiple plugin families.

Single-plugin patterns belong in that plugin's `docs/adr/`, not in `learnings/`. If a single-plugin ADR turns out to apply more broadly, promote it to `learnings/` (and supersede the original with a pointer).

## 2. Layout

```
learnings/
├── README.md                          (overview + link index)
├── patterns/                          What worked — recommend reusing
│   └── NNNN-<title>.md
├── anti-patterns/                     What didn't work — recommend avoiding
│   └── NNNN-<title>.md
└── post-mortems/                      What broke and what we changed
    └── YYYY-MM-DD-<title>.md
```

Numbered files use 4-digit zero-padded sequence (0001, 0002, …) within each subdirectory.

## 3. Format

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

## 4. Self-triggered post-mortems

Per `CLAUDE.md`'s cross-domain action protocol, agents file a post-mortem in `learnings/anti-patterns/` when they:

1. Cross a domain boundary without authorization.
2. Skip a review gate (including under length pressure).
3. Treat a soft go-signal as broad authorization.
4. Bypass the challenge protocol (per `runbooks/decision-discipline.md` §2).

Post-mortems are filed before continuing other work. They follow the format above plus a "What I should have done" section.

## 5. Curation

`release-engineer` reviews `learnings/` weekly during the audit pipeline (see `runbooks/audit-pipeline.md`) and decides:

- Should new entries be added based on recent PRs / external feedback?
- Should existing entries be marked superseded by newer practice?
- Are there cross-references to add?

`project-pm` refers to `learnings/` during sprint planning to flag known landmines and to verify that recurring issues are getting addressed systemically.

## 6. Promotion to / from individual plugins

When a `plugins/<slug>/docs/adr/NNNN-*.md` becomes broadly applicable:

1. Open a PR moving (or referencing) the relevant content into `learnings/patterns/NNNN-<title>.md`.
2. Mark the original ADR as `Status: superseded` with a pointer to the learnings entry.
3. Update other plugins' docs that should now reference the cross-plugin pattern.

When a `learnings/` entry stops applying (technology changed, Figma deprecated the relevant API, a plugin pivoted away from the pattern):

1. Mark the entry `Status: obsolete` with a date and a reason.
2. Don't delete — the audit trail value persists even when the recommendation doesn't.

## 7. The shape of a good entry

A useful learnings entry:

- Is one page, max two.
- Names the failure mode in concrete terms — code snippet, screenshot, error message — not abstract description.
- Has a clear "do this" or "don't do this" recommendation.
- Links to the originating PRs / Monday items / ADRs as primary sources.
- Specifies status (active / superseded / obsolete) so readers know if it's still load-bearing.

A bad learnings entry:

- Is multi-page essay-form without a clear takeaway.
- Names the failure mode abstractly ("don't do bad things").
- Has no recommendation, just retrospection.
- Has no links — claims float free of evidence.
- Has stale status — the team has moved on but no one updated the entry.

The cost of bad entries is real: future agents trust the directory and act on it. Inaccurate entries cause real harm.
