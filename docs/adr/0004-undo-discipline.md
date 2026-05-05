# ADR 0004 — Undo discipline: rely on Figma native undo; no transaction wrapping

**Status:** Accepted
**Date:** 2026-05-05
**Decision-makers:** Lars (project-pm), figma-api-engineer
**References:** ADR-0001; `welder-slide-editor/spec.md` §2; Figma Plugin API docs (commitUndo)

---

## Context

Figma's plugin runtime records every mutation to the document (character writes, fill replaces, node appends, property sets) as individual undo steps. Plugins can optionally group mutations into a single user-visible undo step by calling `figma.commitUndo()` at logical transaction boundaries.

`welder-editor` makes a variety of mutations across three tabs:

- **Atomic edits** — single text node write (`setCharacters` on a heading or cell) triggered by a debounced input field.
- **Composite edits** — table render (20–60 frame/text node operations for a full re-render), journey render (~10–30 operations), image fill replace (one `createImage` + one `fills` write).
- **Persistence side-effects** — `setPluginData` and `setRelaunchData` on every save.

The question is whether these should be grouped under a single `figma.commitUndo()` boundary or left as individual undo steps.

**What Figma native undo gives for free:**

Each `node.characters = value` write, each `node.fills = [paint]` write, each `frame.appendChild(child)` call is independently undoable. In practice, for a user who types a heading and then presses Cmd-Z, Figma will undo the last character batch (Figma groups rapid same-node writes). For composite operations like table render, each frame creation is a separate undo step — pressing Cmd-Z 40 times after rendering a 6×10 table would disassemble it one node at a time.

**The existing build's approach (`spec.md` §2):**

> "Geen eigen undo/redo-management — we leunen volledig op Figma's native undo."
> ("No own undo/redo management — we rely entirely on Figma's native undo.")

This was an explicit design decision in v0.2.1. User feedback has not flagged undo behavior as a problem. Granular undo is a valid UX pattern for inline editing — it matches how native Figma text editing works.

---

## Decision

**Rely on Figma's native undo. Do not wrap mutations in `figma.commitUndo()` by default.**

Each individual mutation (`setCharacters`, `setRangeFills`, `setPluginData`, `setRelaunchData`, `fills =`, `setProperties`) is a separate undo step. This is the behavior users experience when editing directly in Figma — granular and predictable.

**Exception — explicit `atomic` option:**

The helper API in `packages/figma-api/src/mutate.ts` (to be implemented in Sprint 1) exposes an optional `atomic: true` parameter. When set, the helper wraps the mutation sequence in a `figma.commitUndo()` call before and after. This opt-in path exists for:

- Full table re-renders (the table renderer applies 20–60 node operations in one `apply-table` message; collapsing these into one undo step may be desirable for UX).
- Full journey re-renders (same reasoning as table).
- Image replacement (create image + set fills — two steps that make no sense individually).

Callers that do NOT use `atomic: true` get the default granular behavior.

**`setPluginData` and `setRelaunchData` are not undoable.**

Per Figma's documentation, `setPluginData` and `setRelaunchData` are not included in Figma's undo history. They are fire-and-forget persistence calls. This means a user can undo a text write but the `pluginData` will not revert. This is acceptable — persisted data is the plugin's internal representation and the user never sees it directly.

---

## Alternatives considered

### Wrap all mutations in a single `figma.commitUndo()` per message handler

Every message handler (apply-title-description, apply-card, apply-table, etc.) starts with an implicit `figma.commitUndo()` call to open a transaction, applies all mutations, and closes with another `figma.commitUndo()` call.

Rejected because:
- For simple text edits (one `setCharacters` call), this adds ceremony with no benefit.
- Figma's native undo already groups rapid same-node writes from debounced inputs.
- The external build explicitly decided against this and users have not reported problems with it.
- Incorrect `commitUndo()` usage (e.g., calling it without a prior mutation) can cause unexpected behavior.

### Per-mutation `figma.commitUndo()` for table/journey renderers

Wrap only the composite renderers in a transaction, not atomic edits.

This is a subset of the "explicit `atomic` option" approach above. Accepted and encoded in the `packages/figma-api/src/mutate.ts` `atomic` parameter — callers opt in per-call.

### No `figma.commitUndo()` at all (pure native undo)

Simpler. Rejected because composite renderers (table, journey) produce 20–60 undo steps for a single user action. A user who renders a table and immediately presses Cmd-Z would see one column disappear instead of the whole table reverting. The `atomic: true` escape hatch exists to handle this case correctly when the caller decides it matters.

---

## Consequences

**Positive:**

- Granular undo matches user expectations for inline text editing (identical to native Figma behavior).
- No `figma.commitUndo()` call to misuse or forget in atomic single-mutation handlers.
- Simplifies the default code path for all `apply-*` message handlers.

**Negative:**

- Table and journey re-renders produce multiple undo steps unless callers opt in to `atomic: true`. Sprint 4 must decide per-renderer whether `atomic` is appropriate.
- `setPluginData` and `setRelaunchData` are not undoable — persisted state can diverge from visible canvas state after an undo. This is an inherent Figma API limitation, not a plugin bug.

**Sprint 1 action item:**

`packages/figma-api/src/mutate.ts` must document the `atomic: true` option and which renderers are expected to use it. The table renderer (`code/editors/table/renderer.ts`) and journey renderer (`code/editors/journey/renderer.ts`) are the primary candidates.

---

## References

- `welder-slide-editor/spec.md` §2 — explicit "geen eigen undo/redo-management" decision
- Figma Plugin API: `figma.commitUndo()` — https://www.figma.com/plugin-docs/api/figma/#commitundo
- ADR-0001 — monorepo structure (establishes `packages/figma-api/` as the home for shared wrappers)
- Plan §Sprint 1 — `packages/figma-api/src/mutate.ts` with `commitUndo` discipline helper
