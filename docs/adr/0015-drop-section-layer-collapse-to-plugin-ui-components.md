# ADR-0015 — Drop section layer; collapse to `plugins/<slug>/ui/components/`

**Status:** Accepted
**Date:** 2026-05-06
**Shepherded by:** project-pm
**Architectural authority:** ui-engineer (UI-side); figma-api-engineer (workspace + config side)
**Sprint:** Sprint 5 — structural change driving Wave 3
**Monday item:** [MON-2894494383](https://larsvdloos-team.monday.com/boards/5095865862/pulses/2894494383) (5.15 CONSOLIDATION)
**Approved plan:** `/Users/lars/.claude/plans/context-during-a-rushed-robust-feigenbaum.md`

---

## Context

CLAUDE.md defines a 3-layer UI hierarchy: `components/ → sections/ → plugin/`. Each layer was designed for reuse:

- `components/` — atomic UI primitives shared across plugins
- `sections/` — composite views shared across plugins
- `plugins/<slug>/ui/` — single plugin's iframe app

The reuse never materialized. Welder-editor is the only plugin in the repo. Every import of `@figma-plugins/sections-*` (12 packages) and `@figma-plugins/components` (1 package) is internal to welder-editor. The `sections/` layer adds workspace-package overhead, three layers of indirection, and one extra build target per section without benefit.

In addition, [ADR-0013](0013-welder-editor-nuxt-ui-v4-recovery.md) (Sprint 5 Wave 1, 2026-05-05) revealed that the v0.2.1 reference build (`/Users/lars/Documents/Claude/Figma_plugin/plugins/welder-slide-editor`, external) uses a **flat** `widget-src/ui/` structure with 130 `<U…>` Nuxt UI v4 component instances across 20 distinct components. v0.2.1 ships `@nuxt/ui` v4 inside plain Vite. The flat structure is the proven gold standard.

Sprint 5 is the Nuxt UI v4 rewire. Carrying the 3-layer hierarchy through that rewire would produce 12 workspace packages of Nuxt UI v4-migrated code with no consumer outside welder-editor — pure indirection cost.

## Decision

Drop the `sections/` layer for welder-editor. Collapse all UI primitives + composite views into a **single, flat `plugins/welder-editor/ui/components/`** directory.

- Each component is one `.vue` file in `ui/components/`. PascalCase. No nested folders, no `index.ts` barrels.
- Components are imported with explicit named imports via the `@/` alias (`import Foo from '@/components/Foo.vue'`). No `unplugin-vue-components` for local components — that auto-import is reserved for the `<U…>` Nuxt UI primitives auto-registered by `@nuxt/ui/vite`.
- Tests live in `plugins/welder-editor/tests/ui/components/<Name>.test.ts`, mirroring the existing `tests/ui/composables/` and `tests/ui/stores/` convention (separate-from-source).
- Repo-root `components/` and `sections/` directories are deleted. The 12 `@figma-plugins/sections-*` and 1 `@figma-plugins/components` workspace packages are removed from `pnpm-workspace.yaml` and from welder-editor's `package.json`.
- `packages/figma-api/` stays at repo root — it remains genuine cross-plugin code (typed `figma.*` wrappers, message-bus router) that the next plugin will consume.
- TabStrip is dropped. App.vue replaces it with stacked `<UCard>` panels (General / Content / Graphs). Sprint 5 Wave 2 (task 5.2) implements this; tasks 5.14 + 5.16 update the 84 plugin-level test queries that assumed TabStrip's hide-empty DOM behavior.

## Consequences

**Kept intact:**

- Pinia hybrid store ([ADR-0010](0010-welder-editor-ui-state-architecture-hybrid.md)): one `useEditorStore.ts`, composables for ephemeral state. Mutation discipline (custom ESLint rule) preserved unchanged.
- Bundle budget ([ADR-0014](0014-welder-editor-bundle-budget-revision.md)): `ui` ≤ 320 KB gzip. The collapse should reduce code (drop FormGroup / InputField / StatusMessage wrappers in favor of `<UFormField>` / `<UInput>` / `<UAlert>` primitives) and stay under budget.
- Custom PropertyPanel ([ADR-0011](0011-welder-editor-custom-collapsible.md), reaffirmed by Sprint 5 task 5.10 [PR #54](https://github.com/larsvanderloo/figma-plugins/pull/54)): kept as a custom collapsible; UCollapsible regresses T42.21.
- Workflow contract (api-spec → message-bus → code → ui → validation → release timing → tag): unchanged.
- Agent ownership: `ui-engineer` owns `plugins/*/ui/`; `figma-api-engineer` owns `code/`, `shared/`, manifest, and the workspace + config files. Cross-domain protocol unchanged.
- CI ordering (install → build → typecheck → test → lint per anti-pattern 0003): unchanged.

**Changed:**

- CLAUDE.md "Hierarchical structure" section needs revision after migration lands. The `components → sections → plugin` paragraph currently in CLAUDE.md is superseded for welder-editor; we either rewrite it (canonical = flat) or annotate it with this ADR's exception. Decision deferred until the migration is in main + CI green.
- Agent ownership table in CLAUDE.md retains rows for `components/` and `sections/` ownership (`ui-engineer`); those rows can be dropped after deletion lands. The `plugins/*/ui/components/` directory takes their place under the same owner.
- The `Workflow contract` step naming "section" loses its meaning — components compose components inside the plugin. The order of operations doesn't change.

**Re-extraction trigger:**

When a second plugin needs reuse of any component already living in `plugins/welder-editor/ui/components/`, the team extracts that component opportunistically back to a repo-root `components/` (or a more domain-specific shared dir). This is the v0.2.1 pattern (`extract on demand`, not `extract preemptively`). A new ADR documents the extraction at that point. Until then, the flat single-plugin structure stands.

## Supersession map

- **CLAUDE.md "Hierarchical structure" §**: this ADR partially supersedes the 3-layer description for welder-editor. Other plugins may adopt the same flat structure by default unless they have explicit cross-plugin reuse needs at scaffold time.
- **CLAUDE.md "Agent ownership map" §**: the rows `components/, components/tokens/, sections/` → `ui-engineer` remain valid for the lifetime of those directories. They are removed when the directories are deleted by Sprint 5 task 5.15.
- **[ADR-0001](0001-monorepo-structure.md) (monorepo structure)**: not superseded. The monorepo + 6-agent roster + pnpm workspaces all stand. Only the layout convention inside the workspace changes.
- **None of [ADR-0010](0010-welder-editor-ui-state-architecture-hybrid.md), [ADR-0011](0011-welder-editor-custom-collapsible.md), [ADR-0013](0013-welder-editor-nuxt-ui-v4-recovery.md), [ADR-0014](0014-welder-editor-bundle-budget-revision.md)** is superseded.

## Migration

Existing Sprint 5 Monday tasks carry the work — no new tasks needed:

1. [5.2](https://larsvdloos-team.monday.com/boards/5095865862/pulses/2894436938) — App.vue chrome (TabStrip → stacked panels)
2. [5.5](https://larsvdloos-team.monday.com/boards/5095865862/pulses/2894474937) – [5.9](https://larsvdloos-team.monday.com/boards/5095865862/pulses/2894437197) — per-component migrations to `ui/components/`
3. [5.15](https://larsvdloos-team.monday.com/boards/5095865862/pulses/2894494383) — workspace + repo-root cleanup (this ADR's structural change)
4. [5.16](https://larsvdloos-team.monday.com/boards/5095865862/pulses/2894636010) — 84 plugin App-level test query updates
5. [5.14](https://larsvdloos-team.monday.com/boards/5095865862/pulses/2894493454) — PR #62 conflict resolution + 7 stale plugin-level test queries

Order: 5.2 → 5.5–5.9 → 5.15 → 5.16 → 5.14. 5.15 is gated on the component migrations landing first (otherwise the workspace deletion would break the in-flight ui migrations).
