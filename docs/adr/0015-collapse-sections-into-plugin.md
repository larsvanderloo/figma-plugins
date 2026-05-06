# ADR-0015 — Collapse sections/\* into plugin/ui/components/

**Status:** Accepted
**Date:** 2026-05-05
**Supersedes:** The "components → sections → plugin" hierarchy clause of ADR-0001 for the v0.1.x lifecycle of `welder-editor`.

---

## Context

The original monorepo hierarchy (from CLAUDE.md / ADR-0001) was:

```
components/ → sections/* → plugins/<slug>/
```

Sprint 5 (Waves 2 and 3) operated on this hierarchy: each UI section (`SlidePicker`, `BadgeEditor`, `ImageEditor`, etc.) was a standalone npm workspace package under `sections/<Name>/` with its own `package.json`, `tsconfig.json`, `vite.config.ts`, and `vitest.config.ts`.

### What went wrong

Sprint 5 opened 6+ parallel PRs for Wave 2 + Wave 3 sections, plus one for the App.vue chrome rewrite. Each section PR required:

- Bootstrapping a Vite config + tsconfig for a standalone package (1–2 hrs per section).
- Wiring `vi.mock('@figma-plugins/components')` and `vi.mock('@figma-plugins/sections-*')` in every test setup file (brittle: stubs got out of sync with real components).
- Managing workspace-level `@figma-plugins/sections-*` npm dependencies that were never consumed by any plugin other than `welder-editor`.
- Handling cross-PR import failures when a section being PR'd depended on another section still under review.

**The overhead: 13× story points (XL) for what is fundamentally a file-move + import-path update.**

### Core finding

There is currently ONE plugin (`welder-editor`). The sections layer was a forecast bet on cross-plugin reuse that may materialize at v1.x when a second plugin is filed. Until that point, every section package exists solely to be consumed by one plugin — the abstraction boundary provides no actual reuse.

The canonical reference (`/plugins/welder-slide-editor/widget-src/ui/`) demonstrates that a production-quality Welder plugin works perfectly with a flat `ui/components/` folder containing all components.

---

## Decision

**Collapse `sections/*` and `components/src/{InputField,FormGroup,StatusMessage}` into `plugins/welder-editor/ui/components/`.**

Structure after consolidation:

```
plugins/welder-editor/ui/
  App.vue
  main.ts
  main.css
  index.html
  shims-vue.d.ts
  components/
    PropertyPanel.vue
    SlidePicker.vue
    TitleDescriptionEditor.vue
    BadgeEditor.vue
    IconPicker.vue
    ImageEditor.vue
    CardList.vue
    CardEditor.vue
    TimelineEditor.vue
    TableEditor.vue
    JourneyEditor.vue
    StatusMessage.vue
    csv-schema.ts        ← TableEditor's CSV parser
    types.ts             ← Consolidated local type declarations
  composables/
    usePluginBridge.ts
    useEditorActions.ts
    …
  stores/
    useEditorStore.ts
```

**`sections/*` and `components` are removed from `pnpm-workspace.yaml`.**

Tests move from `sections/*/tests/*.test.ts` to `plugins/welder-editor/tests/ui/components/*.test.ts`. Import paths in tests update from `@figma-plugins/sections-*` mocks to relative `vi.mock('../../ui/components/ComponentName.vue')`.

---

## Consequences

### Positive

- **Sprint 5 closes.** 6 stale PRs (#56, #57, #59, #60, #61, #62) are superseded by a single consolidation PR.
- **No more bootstrap overhead** per section. New components drop into `ui/components/` with zero workspace config.
- **Tests are simpler.** Per-component test setup no longer needs to mock workspace package boundaries.
- **Import graph is local.** `vue-tsc` and Vite see the entire component tree in a single pass; no inter-package resolution.
- **Mirrors v0.2.1.** The reference implementation at `welder-slide-editor/widget-src/ui/components/` is now matched exactly.

### Negative / Risks

- **Future cross-plugin reuse requires re-extraction.** When a second plugin needs, e.g., `PropertyPanel`, it must be moved back into a shared workspace package. This is straightforward (SFCs are self-contained) but requires an ADR and a migration PR at that point.
- **CLAUDE.md hierarchy clause is now inaccurate** for `welder-editor`. CLAUDE.md is updated to state that the sections layer is OPTIONAL until ≥2 plugins exist.

---

## Cross-cutting effects

- `pnpm-workspace.yaml`: `sections/*` and `components` entries removed.
- `plugins/welder-editor/package.json`: all `@figma-plugins/sections-*` and `@figma-plugins/components` deps removed.
- `plugins/welder-editor/ui/App.vue`: imports rewritten from `@figma-plugins/sections-*` to `./components/ComponentName.vue`.
- Individual components: imports of sibling sections rewritten to relative paths.
- `tests/ui/components/setup.ts`: per-section `vi.mock('@figma-plugins/…')` replaced by relative path mocks in individual test files.
- `CLAUDE.md`: "components → sections → plugin" clause updated to note the sections layer is optional for single-plugin lifecycles.

---

## Re-extraction criteria

Create a `sections/<Name>/` workspace package (and update this ADR to "Partially superseded") when:

1. A second plugin in this workspace needs the same component, AND
2. The component is stable enough that changes in the shared package won't require coordinated updates across both plugins simultaneously.
