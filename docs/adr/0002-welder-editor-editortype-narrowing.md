# ADR 0002 — welder-editor: editorType narrowed to ["figma", "slides"]

**Status:** Accepted
**Date:** 2026-05-05
**Decision-makers:** Lars (project-pm), figma-api-engineer
**Supersedes:** Scaffold default `["figma", "figjam", "slides"]` in `plugins/welder-editor/manifest.json`
**References:** CLAUDE.md §"Primary host: Figma (web + desktop)"; ADR-0001 §"Editor type scope"

---

## Context

`CLAUDE.md` establishes `["figma", "figjam", "slides"]` as the default `editorType` for all plugins and explicitly requires an ADR for any per-plugin narrowing:

> "Manifest `editorType` is `["figma", "figjam", "slides"]` by default. Per-plugin narrowing requires an ADR."

The `welder-editor` scaffold (generated via `tools/bootstrap_plugin.py`) inherits this default. Before any Sprint 1 implementation begins, this ADR records the approved narrowing decision.

**Why FigJam cannot host Welder slides:**

The Slide Machine library (`kAZqxj4nxpafYjB5FhfOru`) publishes components that are designed for use in Figma Design and Figma Slides. FigJam's node graph is structurally different: it uses `STICKY`, `SHAPE_WITH_TEXT`, `CONNECTOR`, `STAMP`, `WIDGET`, and `SECTION` nodes. FigJam does not support:

- `INSTANCE` nodes (required by `isSlide` detection: `type === 'INSTANCE' && name === 'Slide' && width === 1920 && height === 1080`)
- Slide Machine component instances on the canvas
- The `SLIDE` parent node type used by `slideSummary` for `isSkippedSlide` detection
- Auto-layout FRAME nodes (used by table and journey renderers)

Running `figma.currentPage.findAll(isSlide)` in FigJam would return an empty array. The plugin would boot into a permanent empty state with no actionable content. Showing the plugin in FigJam's plugin browser would mislead users.

The external build (`welder-slide-editor` v0.2.1) already ships with `"editorType": ["figma", "slides"]` — confirmed at `manifest.json` line 7.

---

## Decision

**Narrow `manifest.editorType` to `["figma", "slides"]`.**

The `plugins/welder-editor/manifest.json` is updated accordingly (Sprint 0 manifest update). The `plugin.toml` `editor_types` field is updated to match (per plan item 0.13, owned by project-pm).

The plugin will appear in the plugin browser only in Figma Design and Figma Slides. FigJam users will not see the plugin.

---

## Alternatives considered

### Keep `["figma", "figjam", "slides"]` with a FigJam guard

Add a runtime check at plugin open: if `figma.editorType === 'figjam'`, immediately show an error UI ("This plugin works in Figma Design and Slides only") and call `figma.closePlugin()`.

Rejected because:
- The plugin still appears in FigJam's plugin browser, generating install attempts and confusion.
- The error-and-close pattern is poor UX.
- There is no feature roadmap for FigJam support in welder-editor; this is not a "not yet" situation, it is a "structural mismatch" situation.

### Build a FigJam-specific mode

Out of scope for v0.1.0 and no foreseeable roadmap. FigJam serves a fundamentally different use case (collaborative whiteboarding vs. slide creation). A FigJam version would be a separate plugin concept.

---

## Consequences

**Positive:**

- Plugin browser shows the plugin only where it can function. No "plugin opens and does nothing" support requests from FigJam users.
- Code paths do not need FigJam-specific guards (simplifies `code/main.ts` and `slide-machine.ts`).
- The manifest remains minimal; no capability flags needed for FigJam's alternative node types.

**Negative:**

- FigJam users cannot access the plugin even if they also work in Figma Design with Welder slides. They must switch to a Design or Slides file to use it.
- If a future version of Slide Machine ships a FigJam surface, the manifest and this ADR would need to be revisited.

**Reversibility:**

Expanding `editorType` back to include `"figjam"` is a manifest change (non-breaking MINOR release) and would require a new ADR justifying the addition plus `plugin-tester` validation in FigJam.

---

## References

- `CLAUDE.md` §"Primary host: Figma (web + desktop)" — default editorType and ADR gate for narrowing
- ADR-0001 — monorepo structure (establishes `["figma", "figjam", "slides"]` scaffold default)
- `plugins/welder-editor/manifest.json` — the file this ADR authorizes to change
- `welder-slide-editor/manifest.json` line 7 — external build confirmation: `"editorType": ["figma", "slides"]`
- `welder-slide-editor/spec.md` §4 — manifest spec: `"editorType": ["figma", "slides"]`
- Plan: `/Users/lars/.claude/plans/users-lars-documents-claude-figma-plugi-humble-lightning.md` §"Confirmed scope decisions"
