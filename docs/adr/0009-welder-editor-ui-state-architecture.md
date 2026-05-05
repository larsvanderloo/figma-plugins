# ADR 0009 — welder-editor: ui-state architecture (v0.1.0)

**Status:** Accepted
**Date:** 2026-05-05
**Decision-maker:** ui-engineer
**References:** ADR-0001 (monorepo structure); approved rebuild plan §"Plugin-thread rules"; Risk register R8 (library-first sequencing); `learnings/anti-patterns/0001-figma-api-engineer-app-vue-cross-domain.md` line 33

---

## Context

The approved rebuild plan states: "All state that depends on Figma comes through the message bus; the ui is a render of message-bus-derived state, not a parallel store."

The external build (`welder-slide-editor` v0.2.1) implements this model using two composables — `usePluginBridge.ts` (typed `postMessage` wrapper with auto-unsubscribing listeners) and `usePluginView.ts` (a module-scoped `reactive()` singleton that holds slide list, active slide, active tab, and per-tab payloads). Neither composable imports Pinia. The pattern works at the full feature scope of the external build.

During Wave 2 of Sprint 0, the post-mortem at `learnings/anti-patterns/0001-figma-api-engineer-app-vue-cross-domain.md` inadvertently referenced "the planned Pinia store architecture" (line 33) — language that implied a Pinia baseline that was never decided. That reference has since been softened to point at this ADR. This ADR pins the decision before Sprint 1 begins so Sprint 2 inherits an unambiguous baseline.

---

## Options considered

### A. Vue composables only (existing-build pattern)

`usePluginBridge.ts` — typed, auto-unsubscribing wrapper over the `postMessage` / `window.message` boundary.

`useEditorState.ts` — module-scoped `reactive()` singleton holding all cross-section state: slide list, active slide id, active tab (`general | content | graphs`), per-tab payloads (`general | null`, `content | null`, `graphs | null`), and a top-level `ready` flag.

`useSlideList.ts` — thin composable over the slide-list slice of `useEditorState`, provides filtering and selection helpers without duplicating state.

Each section ships its own `useXxx` composable for local form state (`ref` / `reactive` scoped to the section). Cross-section state flows from `useEditorState` imported as a singleton or injected via `provide` / `inject` at the App level.

### B. Pinia store

A single `useEditorStore` (Pinia) holding all cross-section state. Sections consume state via `storeToRefs`. The message-bus listener dispatches into Pinia actions rather than composable setters.

### C. Hybrid

Pinia for cross-section state (slide list, active tab, per-tab payloads). Section-local form state stays in composables. Pinia is added as a dependency but its surface is bounded.

---

## Trade-offs

| Criterion | A. Composables only | B. Pinia store | C. Hybrid |
|---|---|---|---|
| **Bundle cost** | ~0 KB added | ~5–10 KB gzipped (Pinia runtime + @pinia/nuxt glue) | ~5–10 KB gzipped (same Pinia runtime) |
| **Alignment with plan** | Explicit match: "ui is a render of message-bus-derived state, not a parallel store" | Introduces a parallel store layer the plan explicitly disavows | Partial match; the plan's language does not distinguish store shape |
| **Existing-build proof** | Full feature scope runs on this pattern today | Untested at this scope | Untested |
| **Test ergonomics** | Composable returns a plain object; stub by replacing the module or passing a factory; no setup boilerplate | `setActivePinia(createPinia())` in every test file; Pinia devtools noise in Vitest output | Split: Pinia tests need setup; composable tests do not |
| **DevTools visibility** | None in Vue DevTools (state in module scope, not component tree) | Full Pinia DevTools timeline | Mixed |
| **Reversibility** | High: if composables become unwieldy the composable boundary maps 1-to-1 to a Pinia store | Low: removing Pinia requires rewriting all `storeToRefs` consumers | Medium |
| **`package.json` change** | None | Adds `pinia` + `@pinia/nuxt` to plugin deps | Same as B |

**Bundle note:** ADR-0003 sets the ui-side budget at ≤ 250 KB gzipped with a stretch target of ≤ 200 KB. The external build baseline is already 331 KB — there is active budget pressure from Sprint 2 onward. Adding 5–10 KB for a state-management runtime before any feature work begins consumes budget that the icon-manifest and lazy-split strategies are working to recover.

**DevTools note:** The composable singleton pattern loses Pinia DevTools timeline inspection. This is an acceptable trade-off at v0.1.0 scope: the plugin has three tabs and one primary data flow (message received → state updated → template re-renders). Browser Vue DevTools component inspection and `console.log` in composable setters are sufficient for debugging at this scale. Revisit at the condition below.

---

## Decision

**Option A — Vue composables only** for v0.1.0.

The plan is explicit that the ui is a render of message-bus-derived state. A Pinia store is a parallel store; it is exactly what the plan asks the team not to build. The external build proves the composable pattern works at the full feature scope of this plugin. The bundle cost of Pinia is real and competes against the budget pressure documented in ADR-0003. The test ergonomics advantage of composables (no per-test Pinia setup) is genuine and will be felt in Sprint 2 when the first section tests are written. Reversibility is high: each composable's return-value interface maps to a Pinia store slice without rewriting consumers.

---

## Consequences

**Section authoring template:** each section ships with a `use<SectionName>.ts` composable next to its SFC that owns local form state for that section. The composable is the unit of test — tests import the composable directly and call its actions without mounting the component.

**Cross-section state:** lives in `plugins/welder-editor/ui/composables/useEditorState.ts`. This is a module-scoped `reactive()` singleton following `usePluginView.ts` from the external build. It holds: `slides`, `currentSlideId`, `activeTab`, `general | null`, `content | null`, `graphs | null`, `ready`. Sections read from it; only the message-bus listener (in `usePluginBridge`) writes to it via the exported actions.

**Message-bus wiring:** `plugins/welder-editor/ui/composables/usePluginBridge.ts` is lifted directly from the external build and adapted to the v0.1.0 message-bus contract in `shared/messages.ts`. It is the only place `window.addEventListener('message', ...)` and `parent.postMessage(...)` appear in the ui.

**No Pinia dependency:** `pinia` and `@pinia/nuxt` are not added to `plugins/welder-editor/package.json` in v0.1.0. Any PR that adds them is blocked at ui-engineer review until this ADR is reopened and superseded.

**App.vue stub:** the current Sprint 0 stub in `plugins/welder-editor/ui/App.vue` uses flat `ref`s and an inline `window.addEventListener`. This is acceptable for the stub. Sprint 2 replaces it with composition via `usePluginBridge` and `useEditorState`.

**The post-mortem** at `learnings/anti-patterns/0001-figma-api-engineer-app-vue-cross-domain.md` line 33 references this ADR as the source of the architecture decision. No further edits to that file are needed.

---

## Action items

| Sprint | Owner | Action |
|---|---|---|
| Sprint 1 | figma-api-engineer | Establish message-bus router in `code/`. No ui-state work. |
| Sprint 2 | ui-engineer | Scaffold `plugins/welder-editor/ui/composables/` with `usePluginBridge.ts` (lifted + adapted), `useEditorState.ts`, `useSlideList.ts`. Wire `App.vue` to these composables. Each section in Sprint 2 ships with its own `use<Section>.ts` beside its SFC. |
| Sprint 2+ | ui-engineer | Every new section follows the authoring template: SFC + co-located composable + test that imports the composable directly. |
| Ongoing | ui-engineer | Every PR touching `plugins/welder-editor/package.json` is checked against this ADR; any addition of `pinia` triggers the revisit condition below. |

No changes are needed to `package.json`, `vite.config.ts`, or any build tooling.

---

## Revisit conditions

Reopen this ADR if any of the following become true:

1. Cross-section coordination via `provide`/`inject` or singleton import becomes genuinely brittle — symptoms are: more than three composables importing `useEditorState`, or sections mutating shared state directly rather than via the exported actions.
2. A second plugin in this monorepo wants to share ui-state architecture conventions; at that point a consistent Pinia baseline across plugins may outweigh the per-plugin bundle cost.
3. The team grows past one human developer; Pinia DevTools timeline becomes a meaningful collaboration tool.
4. ADR-0003 budgets are comfortably met and a 5–10 KB Pinia addition falls within headroom.

The revisit threshold is reached when at least two of the above conditions apply simultaneously.
