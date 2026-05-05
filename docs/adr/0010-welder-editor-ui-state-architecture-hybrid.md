# ADR 0010 — welder-editor: ui-state architecture — hybrid (v0.1.0)

**Status:** Accepted
**Date:** 2026-05-05
**Decision-maker:** ui-engineer
**Supersedes:** [ADR-0009](./0009-welder-editor-ui-state-architecture.md)
**References:** ADR-0001 (monorepo structure); ADR-0003 (bundle budget); ADR-0009 (superseded); approved plan §"Plugin-thread rules"; `learnings/anti-patterns/0001-figma-api-engineer-app-vue-cross-domain.md` line 33

---

## 1. Context

ADR-0009 (2026-05-05) established Vue composables only as the ui-state architecture for v0.1.0. The primary concerns driving that choice were:

- **Plan alignment.** The approved plan states: "the ui is a render of message-bus-derived state, not a parallel store." A Pinia store was read as a "parallel store" that the plan explicitly disavows.
- **Bundle cost.** The external build baseline already exceeds ADR-0003's 250 KB gzipped budget. Spending 5–10 KB on a state-management runtime before any budget recovery work competes with the budget pressure documented in ADR-0003.
- **Drift risk.** A Pinia store without strict mutation governance could become a source of stale state relative to the Figma canvas, violating the plan's canonical model.

This ADR is reopened after user-led revisit on 2026-05-05. The user's reasoning (verbatim):

> "if this is fixable i would prefer pinia … because it would speed up loading states"

The specific performance benefit in view is `pinia-plugin-persistedstate` caching the last-known slide list and per-slide payloads in `localStorage`. On warm opens (plugin closed and reopened within a session), the store hydrates from the cache instantly; the message-bus init reconciles in the background. The measured expectation is a ~200 ms improvement in perceived load time on warm opens — a meaningful improvement in a tool that designers open and close repeatedly per working session.

The drift concern that motivated the composables-only decision is not eliminated, but it is **engineerable**. Three disciplines (detailed in §3) constrain the store's mutation surface tightly enough that the drift risk is comparable to the composable singleton pattern, not worse. With those disciplines in place, the hybrid approach satisfies the plan's intent — the ui remains a render of message-bus-derived state — while capturing the warm-open speedup that the composable pattern structurally cannot provide (module-scoped `reactive()` resets on every plugin open; there is no persistence path without reaching for `localStorage` directly, which would re-introduce the same architectural questions in a less explicit form).

ADR-0009's original analysis (composables-only rationale) remains valid as the baseline argument against naïve Pinia use. This ADR is the engineered version.

---

## 2. Decision

**Hybrid: Pinia for cached cross-section state + composables for section-local ephemeral state.**

### Pinia (`useEditorStore.ts`) — cached cross-section state

The single Pinia store holds state that must survive across sections and benefit from warm-open caching:

| Slice         | Contents                                                                                            |
| ------------- | --------------------------------------------------------------------------------------------------- |
| `slides`      | `SlideSummary[]` — the current file's slide list, keyed by `figma.fileKey`                          |
| `activeSlide` | `string \| null` — current slide id                                                                 |
| `general`     | `GeneralPayload \| null` — per-slide general-panel payload                                          |
| `content`     | `ContentPayload \| null` — per-slide content-panel payload                                          |
| `graphs`      | `GraphsPayload \| null` — per-slide graphs-panel payload                                            |
| `sync`        | `{ lastKnownAt: number; fileKey: string; inFlightRequestId: string \| null; reconciling: boolean }` |

`pinia-plugin-persistedstate` persists the `slides`, `activeSlide`, `general`, `content`, and `graphs` slices to `localStorage`. The `sync` slice is not persisted (it is always reconstructed from the message-bus reconciliation on open).

### Composables — section-local ephemeral state

State that does not need to cross section boundaries and does not benefit from persistence stays in composables co-located with the section SFC:

- Form drafts (field values in progress before dispatch).
- Popover / modal open-close flags.
- Field-level validation state.
- Debounce timers.
- Transient UI flags (loading spinners scoped to a single user action, hover state, focus tracking).

This is the same pattern established in ADR-0009 for local state. It is unchanged.

### What "render of message-bus-derived state" means under the hybrid

The plan's language is preserved: the Pinia store is not an independent source of truth — it is a **cache of message-bus results**. The only legal writers to the store are message-bus result handlers. The store's cached value is always a projection of what the message bus last delivered, plus a `lastKnownAt` timestamp and reconciliation flags that make the staleness visible and correctable. This is structurally different from a "parallel store" that accumulates state from user actions directly; no user action writes to the store without first going through the bus.

---

## 3. Drift-mitigation discipline

This section defines the engineering that makes the hybrid safe. All three disciplines are required; any deviation is a blocking review comment.

### 3.1 Mutation rule

**The only allowed writers to Pinia state slices are message-bus result handlers wired in `useEditorStore.ts` actions.**

Sections call composables that _dispatch_ through the message bus. Composables call `usePluginBridge` to send the message. The message-bus result handler in `useEditorStore` receives the `apply-X:result` envelope and writes the new state. Sections never call `store.$patch(...)` directly. Sections never assign to `store.<slice>` directly.

This rule is enforced by:

1. A **custom ESLint rule** (Sprint 1 task — see §8) that statically flags `store.$patch(...)`, `store.<x> = ...`, and `storeToRefs(useEditorStore())<ref>.value = ...` outside `useEditorActions.ts` and `useEditorStore.ts` action methods.
2. **Code review.** Every PR touching `ui/` is checked by `ui-engineer` for direct store mutation.

The ESLint rule is non-optional. PRs that disable it with `// eslint-disable` in a section file are blocked.

### 3.2 Versioning and reconciliation

Every cached slice carries `sync.lastKnownAt: number` (ms epoch). On the following events, the ui dispatches a reconcile request and marks `sync.reconciling = true`:

- `selectionchange` — Figma selection changed; active slide may have changed.
- Page change (message from `code/` on `figma.currentPage` change).
- File change (message from `code/` on `figma.fileKey` change).

On reconcile response, canvas-derived data from the message-bus result wins unconditionally over the cached value. The `sync.lastKnownAt` is updated to the response timestamp. If `sync.fileKey !== figma.fileKey` (cross-file mismatch), the cache is cleared before hydrating with the fresh result — cross-file leakage is impossible because the `localStorage` cache key includes `figma.fileKey` (see §3.4).

The `sync.reconciling` flag drives a lightweight "syncing" indicator in the UI so users see that the warm-open state is being verified rather than finalized.

### 3.3 Optimistic UI with rollback

For user-initiated mutations (`apply-general`, `apply-content`, `apply-graphs`):

1. The composable that wraps the dispatch (`useEditorActions.ts`) captures a **prior snapshot** of the relevant store slice before dispatching.
2. The store is updated optimistically to the expected new value (immediate UI feedback, ≤ 16 ms).
3. On `apply-X:result === { ok: false }`, the action rolls back the store to the prior snapshot and surfaces the error to the section via a composable-returned reactive flag.
4. On `apply-X:result === { ok: true }`, the snapshot is discarded and `sync.lastKnownAt` is updated to the result timestamp.

The rollback is implemented inside `useEditorStore` actions — not in the section or composable — so the section never manages snapshot state directly.

### 3.4 Persistence scope

`pinia-plugin-persistedstate` is configured with:

- **`key`:** `welder-editor:${figma.fileKey}` — cache entries are file-scoped. A user working across multiple Figma files will never see slide data from file A hydrate into file B.
- **`paths`:** `['slides', 'activeSlide', 'general', 'content', 'graphs']` — the `sync` slice is excluded from persistence.
- **TTL:** 7 days. The plugin checks `sync.lastKnownAt` on hydration; entries older than 7 days are treated as stale and cleared before the reconcile request fires. (TTL is enforced in the `useEditorStore` `$onAction` hook, not by the persistence plugin itself, which does not support native TTL.)

---

## 4. Bundle impact

**Additive cost versus ADR-0009 (composables-only):**

| Dependency                    | Version   | Gzipped delta |
| ----------------------------- | --------- | ------------- |
| `pinia` v3                    | latest v3 | +5–7 KB       |
| `pinia-plugin-persistedstate` | latest    | +1–2 KB       |
| **Net**                       | —         | **+6–9 KB**   |

**Against ADR-0003's ≤ 250 KB ui-side budget:** the net delta of 6–9 KB consumes roughly 3–4% of the headroom between baseline (331 KB) and target (250 KB). The reduction gap to close is ~81 KB; the Pinia addition reduces that headroom to ~72–75 KB. The per-layer reduction levers in ADR-0003 §"Per-layer reduction targets — ui-side" (icon manifest ~60–80 KB, Nuxt UI tree-shaking ~15–25 KB, Tailwind purge ~5–10 KB, cropperjs lazy-load ~25 KB, journey/table lazy-load ~25–35 KB) remain more than sufficient to reach budget even with this addition.

**Defensibility:** the ~200 ms warm-open improvement is user-visible on every plugin open after the first. Given that Figma designers open and close plugins repeatedly per session, this is a high-frequency payoff. A 6–9 KB cost for a per-session UX improvement at this frequency is defensible against the budget math above.

> **ADR-0003 bundle-table note:** ADR-0003's status remains `Accepted`; no budget revision is required. This ADR footnotes the delta. When the Sprint 2 build is measured with `rollup-plugin-visualizer`, the `pinia` + `pinia-plugin-persistedstate` contribution must be visible in `dist/stats.html` and recorded in the Sprint 2 RC PR description alongside the total gzipped size. If the total at Sprint 2 RC exceeds 250 KB, the Nuxt UI tree-shaking (ADR-0003 §2) must be completed before the Sprint 2 PR merges — it is the highest-confidence lever to recover the headroom.

---

## 5. Test ergonomics

**Section-local state (composable):** unchanged from ADR-0009. The composable is the unit of test. Tests import the composable directly and call its actions without mounting the component. No Pinia setup required.

**Cross-section state (Pinia store):** tests that exercise store-reading sections require:

```typescript
import { setActivePinia, createPinia } from 'pinia';
import { beforeEach } from 'vitest';

beforeEach(() => {
  setActivePinia(createPinia());
});
```

This setup is extracted into `tests/helpers/store.ts` as a shared factory (see §8, Sprint 1 action item). Tests import and call `setupTestPinia()` from that helper rather than duplicating the boilerplate. The `vitest.config.ts` `setupFiles` array includes this helper for any test file under `ui/` that imports `useEditorStore`.

**Message-bus boundary:** mocked per the fixture conventions in `validation/fixtures/figma-mock/`. Tests never reach through to the real message bus. `usePluginBridge` is stubbed at the module level via `vi.mock`.

**Store hydration in tests:** `pinia-plugin-persistedstate` is disabled in the test environment (`NODE_ENV=test`). The persistence plugin is configured to skip serialization when `import.meta.env.TEST === 'true'`. This prevents `localStorage` leakage between test runs and removes the need to clear `localStorage` in `afterEach`.

---

## 6. Sprint 2 implementation surface

The following files are the Sprint 2 scaffolding targets for this decision. All are under `plugins/welder-editor/ui/` (ui-engineer domain).

| File                              | Description                                                                                                                                                                                                                                                                                             |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stores/useEditorStore.ts`        | Pinia store. Slices: `slides`, `activeSlide`, `general`, `content`, `graphs`, `sync`. Persistence plugin configured here. Actions: one per message-bus result type (e.g. `onSlideListResult`, `onApplyGeneralResult`). Rollback helpers.                                                                |
| `composables/usePluginBridge.ts`  | Typed `postMessage` wrapper with auto-unsubscribing listeners. Lifted from the external build's `usePluginBridge.ts` and adapted to the v0.1.0 message-bus contract in `shared/messages.ts`. The only file in `ui/` that calls `parent.postMessage` or `window.addEventListener('message', ...)`.       |
| `composables/useEditorActions.ts` | Per-feature dispatch composable. Wraps each `apply-X` send: captures store snapshot, dispatches through `usePluginBridge`, wires the result handler that calls the appropriate `useEditorStore` action. Sections import from this composable — they never import `useEditorStore` for write operations. |

**Dependency additions (Sprint 2, ui-engineer):**

```
plugins/welder-editor/package.json
  dependencies:
    pinia: "^3.0.0"
    pinia-plugin-persistedstate: "^4.0.0"
```

These are iframe-side deps. They have no effect on `manifest.json` and do not require `figma-api-engineer` coordination. `figma-api-engineer` owns `manifest.json`; `package.json` deps that are ui-bundle-only are ui-engineer authority. This has been verified: the deps affect only `dist/ui.html`, not `dist/code.js` or manifest fields.

`@pinia/nuxt` is **not** added. The plugin's `ui/` does not use Nuxt's app context; it is a standalone Vite-built Vue 3 app inside a Figma iframe. Pinia is installed and configured directly in `ui/main.ts` via `app.use(pinia)`.

---

## 7. Revisit conditions

Reopen this ADR if any of the following become true:

1. **Bundle pressure forces the +6–9 KB out.** If a Sprint 3 or Sprint 4 feature exhausts the remaining headroom under ADR-0003's 250 KB budget and the Pinia runtime is the only lever available, this decision reopens. First resolution attempt: verify all ADR-0003 reduction levers have been applied before attributing the overage to Pinia.
2. **Drift incidents traced to a bypassed mutation rule.** If a post-mortem identifies a section that wrote to the store directly (bypassing the bus-result handler), the ESLint rule was either absent or suppressed. Fix the rule first; if bypasses recur, this decision reopens.
3. **Multi-plugin shared store needs emerge.** If a second plugin in this monorepo wants shared cross-plugin Pinia state, a shared Pinia plugin (workspace package) makes more sense than per-plugin stores. At that point, the architecture revisits at the monorepo level, not the per-plugin level.

---

## 8. Action items

| Sprint    | Owner       | Action                                                                                                                                                                                                                                                                                                                                                       |
| --------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sprint 1  | ui-engineer | Write custom ESLint rule rejecting `store.$patch(...)`, `store.<x> = ...`, and direct `storeToRefs` value assignment outside `useEditorActions.ts` and `useEditorStore.ts` action methods. Add to `plugins/welder-editor/.eslintrc` (or the monorepo ESLint config if the rule is shared). Rule must be enabled as `error`, not `warn`.                      |
| Sprint 1  | ui-engineer | Add `setupFiles` to `vitest.config.ts` for two helpers: (a) `@testing-library/vue` cleanup after each test; (b) Pinia setup helper (`setActivePinia(createPinia())` in `beforeEach`). Extract the Pinia helper as `tests/helpers/store.ts` with an exported `setupTestPinia()` function. Configure `pinia-plugin-persistedstate` to skip in `NODE_ENV=test`. |
| Sprint 2  | ui-engineer | Scaffold `plugins/welder-editor/ui/stores/useEditorStore.ts`, `composables/usePluginBridge.ts`, and `composables/useEditorActions.ts` per the contracts in §6. Add `pinia` and `pinia-plugin-persistedstate` to `plugins/welder-editor/package.json`. Wire `App.vue` to `usePluginBridge` and `useEditorStore`.                                              |
| Sprint 2  | ui-engineer | Run `rollup-plugin-visualizer` on the first Sprint 2 build. Confirm `pinia` + `pinia-plugin-persistedstate` gzipped contribution matches the +6–9 KB estimate. Record in Sprint 2 RC PR description. If total gzipped size exceeds 250 KB, apply Nuxt UI tree-shaking (ADR-0003 §2) before PR merges.                                                        |
| Sprint 2+ | ui-engineer | Every new section follows the authoring template from ADR-0009: SFC + co-located `use<Section>.ts` composable + test. Sections import `useEditorActions.ts` for dispatch; sections import `useEditorStore` (via `storeToRefs`) for read-only state. Sections never write to the store directly.                                                              |

---

## Consequences

**Positive:**

- Warm opens hydrate instantly from the `localStorage` cache. Message-bus reconciliation runs in background; `sync.reconciling` flag communicates the verification state to the user. Expected ~200 ms improvement in perceived load time on repeated opens.
- Pinia DevTools timeline is available for debugging cross-section state flows in development. This was explicitly traded away in ADR-0009; it is recovered here.
- The mutation-rule discipline (§3.1) makes the state flow more auditable than the composable singleton: every write to cross-section state is traceable to a named Pinia action with a named message-bus result trigger.

**Negative:**

- +6–9 KB gzipped against the budget. Manageable but not free.
- Every test file that reads cross-section state needs `setActivePinia(createPinia())` in `beforeEach`. Mitigated by the shared `setupTestPinia()` helper and `vitest.config.ts` `setupFiles` configuration.
- The ESLint rule (§3.1) must be written and maintained. It is not optional — without it, the mutation discipline is advisory rather than enforced.
- The reversibility of the decision is reduced compared to the composable-only pattern. The composable-to-Pinia mapping is still clean (each composable slice maps to a Pinia store slice), but the persistence layer (`pinia-plugin-persistedstate`) adds migration surface if the schema changes: serialized `localStorage` entries from an older store shape must be handled gracefully (either migrated or cleared). The `sync` slice's `fileKey` check on hydration is the primary guard; a store-schema version field (`sync.storeVersion`) should be added if slice shapes change between plugin releases.
