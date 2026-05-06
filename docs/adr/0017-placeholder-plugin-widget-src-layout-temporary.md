# ADR 0017 — \_placeholder-plugin retains widget-src/ layout temporarily

**Status:** Accepted
**Date:** 2026-05-06
**Decision-makers:** project-pm
**Supersedes:** —
**References:** CLAUDE.md §"Hierarchical structure"; ADR-0001 (monorepo structure); `learnings/anti-patterns/0002-figma-plugin-load-debugging.md` (chunked-text-loader); `plugins/_placeholder-plugin/`; `plugins/_placeholder-plugin/spec.md`

---

## Context

`_placeholder-plugin` v0.2.1 was imported from an external scaffold zip on 2026-05-06. The import is intentionally **non-destructive**: every file from the zip (`manifest.json`, `package.json`, `package-lock.json`, `vite.config.ts`, `esbuild.config.mjs`, `tsconfig.json`, `tsconfig.ui.json`, `app.config.ts`, `spec.md`, `widget-src/`, `.reviews/`, `.gitignore`) is preserved unchanged. The org bookkeeping (`plugin.toml`, `README.md`, `CHANGELOG.md`, `docs/api-spec/`, `docs/threading/`, `docs/perf/`, `tests/.gitkeep`, `validation/.gitkeep`) is added alongside.

The repository convention established in `CLAUDE.md` §"Hierarchical structure" and ADR-0001 mandates a three-way split for every plugin:

```
plugins/<slug>/
├── code/      # main-thread sandbox (figma.*, no DOM) — owned by figma-api-engineer
├── ui/        # iframe Vue 3 app (DOM, no figma.*) — owned by ui-engineer
└── shared/    # types + message-bus schema — owned by figma-api-engineer
```

The imported scaffold uses a different layout — a single `widget-src/` directory containing `code.ts` (the main-thread bundle), `ui/` (the iframe Vue app), `types.ts` + `constants.ts` + `slide-machine.ts` (de-facto shared contract), `editors/` (per-editor logic crossing both threads), and `chart-core/csv/` (CSV parsing). The build is wired around this layout: `vite.config.ts` builds `widget-src/ui/` to `dist/ui.html`, and `esbuild.config.mjs` bundles `widget-src/code.ts` to `dist/code.js` with a custom `chunkedTextLoader` plugin that splits `dist/ui.html` into ~60 KB string chunks and inlines them into `dist/code.js` (the chunked-text-loader pattern, originally referred to in the import brief as "anti-pattern 0004" — the actual canonical reference is `learnings/anti-patterns/0002-figma-plugin-load-debugging.md`, which `welder-editor` resolved by switching to `__html__` + `vite-plugin-singlefile`).

A refactor to canonical layout would touch:

- ~50+ files moved between directories
- `vite.config.ts` rewritten (or split) to build `code/` and `ui/` separately
- `esbuild.config.mjs` rewritten (or removed) — the chunked-text-loader is the load-bearing piece and may or may not be retained depending on whether the plugin moves to `vite-plugin-singlefile` + `__html__` like `welder-editor`
- `tsconfig.json` and `tsconfig.ui.json` rewired to new path globs
- All cross-file imports inside the moved files updated
- Tests rewritten against new module paths (none currently exist; `tests/` is empty as of import)

Doing the refactor during the import would conflate "fit into monorepo" with "restructure" and lose the audit trail of the import. The rollback path for the import would become "untangle a refactor", which is materially harder.

## Decision

**Import as-is.** The `widget-src/` layout is retained for `_placeholder-plugin` for a bounded deviation window. The canonical bookkeeping (`plugin.toml`, `README.md`, `CHANGELOG.md`, `docs/`, `tests/`, `validation/`) is added alongside.

A follow-up task **`T_REFACTOR_LAYOUT`** is created (to be filed on the `_placeholder-plugin` Tasks board once the Monday folder is provisioned per `plugin.toml [monday]` TODOs). Its scope:

- Move `widget-src/code.ts` → `code/main.ts` (and split helper modules under `code/` as appropriate).
- Move `widget-src/ui/` → `ui/`.
- Move `widget-src/types.ts` + `widget-src/constants.ts` + `widget-src/slide-machine.ts` → `shared/` (these are the de-facto contract — `slide-machine.ts` is the wrapper-detector module shared by `code/` and `ui/`).
- Move `widget-src/editors/` — split per editor between `code/editors/<name>/` (sandbox-side logic) and `ui/sections/<name>/` or similar (iframe-side rendering). The `_shared/` and `shared/` editor utilities split the same way.
- Move `widget-src/chart-core/csv/` → `code/chart-core/csv/` if the parser runs in the sandbox, or `ui/chart-core/csv/` if it runs in the iframe (read the spec; current understanding: CSV parsing happens in the iframe, so this likely lives in `ui/`).
- Rewire `vite.config.ts` and `esbuild.config.mjs` accordingly. Decide as part of the same task whether to drop the chunked-text-loader and switch to `__html__` + `vite-plugin-singlefile` like `welder-editor` (recommended; cross-link to `learnings/anti-patterns/0002-figma-plugin-load-debugging.md`).
- Author the canonical `shared/messages.ts` carrying the discriminated unions currently in `widget-src/types.ts`, plus `MESSAGE_BUS_VERSION = 1`, plus typed error envelopes (`Result<T, WelderError>` per `welder-editor` precedent).
- Author the canonical api-spec brief in `plugins/_placeholder-plugin/docs/api-spec/_placeholder-plugin.md` modeled after `plugins/welder-editor/docs/api-spec/welder-editor.md`.

`T_REFACTOR_LAYOUT` is a Quality task (per `runbooks/monday-workflow.md` task types), size L, owned jointly by `figma-api-engineer` (code-side + shared) and `ui-engineer` (ui-side). It does not block any feature work that does not touch `widget-src/` cross-cuttingly, but it should land before any new top-level surface (toolbar, command, panel) is added.

## Constraints during the deviation window

These are blocking review constraints for any PR that touches `_placeholder-plugin`:

1. **No other plugin may copy this layout.** New plugins continue to follow `code/` + `ui/` + `shared/` per ADR-0001 and `plugins/_template/`. A new plugin that proposes the `widget-src/` layout requires an ADR explicitly superseding ADR-0001 for that plugin — `project-pm` will reject any such proposal absent compelling rationale.

2. **Ownership map applies to `widget-src/` paths.**
   - `widget-src/code.ts` is owned by `figma-api-engineer`.
   - `widget-src/types.ts`, `widget-src/constants.ts`, `widget-src/slide-machine.ts` are the contract — owned by `figma-api-engineer`. Any change carries the same review weight as a `shared/messages.ts` change in `welder-editor`. A `MESSAGE_BUS_VERSION` bump must accompany any breaking change (the version is currently encoded only in `plugin.toml`'s `[message_bus] version = 1` — until the canonical `shared/messages.ts` is authored, treat the runtime contract in `widget-src/types.ts` as version 1 and bump in lockstep).
   - `widget-src/ui/` is owned by `ui-engineer`.
   - `widget-src/chart-core/csv/` — owned by `figma-api-engineer` (data shape) with `ui-engineer` consultation when the parser is consumed in the iframe.
   - `widget-src/editors/<name>/` — touch `code/`-side files via `figma-api-engineer`; touch ui-rendering via `ui-engineer`. The cross-domain action protocol in `CLAUDE.md` applies — agents may not silently reach across the boundary inside this folder.

3. **No incremental refactor toward canonical layout outside `T_REFACTOR_LAYOUT`.** Partial moves create a broken intermediate state and corrupt the audit trail. The whole layout move ships in one PR (or a tightly-scoped series with a single tracking task).

4. **The chunked-text-loader stays for the deviation window.** Replacing it is part of `T_REFACTOR_LAYOUT`. PRs that selectively replace the loader without doing the full layout move are rejected — see constraint 3.

5. **Lockfile and package-name mismatches stay flagged.** `package.json` `name` is `_placeholder-plugin` (not `@figma-plugins/_placeholder-plugin`) and `package-lock.json` is npm. Migration to pnpm workspace + `@figma-plugins/...` naming is a sibling task to `T_REFACTOR_LAYOUT` (call it `T_PNPM_MIGRATION`). It can ship before, after, or with `T_REFACTOR_LAYOUT` — `project-pm`'s call at the time of scheduling. The `pnpm-workspace.yaml` `plugins/*` glob already picks up this folder; the only required edits are this plugin's `package.json` and lockfile.

6. **Bundle budgets are placeholders.** `plugin.toml [validation]` carries raw-byte placeholders, not gzipped budgets. A gzipped re-measurement and budget ADR (model after ADR-0003 / ADR-0014) must land before the next release tag. This is `T_BUDGET_REMEASURE` and is independent of `T_REFACTOR_LAYOUT`.

## Alternatives considered

### Refactor the layout during the import

Move `widget-src/` to canonical layout in the same PR as the org-bookkeeping addition. Rejected because:

- Conflates two distinct kinds of work (import + restructure) in a single audit trail.
- Doubles the import PR's review surface from "new files added alongside intact zip contents" to "new files added + 50+ files moved + build configs rewritten + cross-imports updated".
- Increases the rollback cost. If the import needs to be unwound (e.g., a build issue surfaces), reverting a non-destructive import is trivial; reverting an import-plus-refactor is not.
- The user explicitly asked for non-destructive integration in the import brief.

### Defer all org bookkeeping until after the refactor

Skip `plugin.toml`, `README.md`, `CHANGELOG.md`, `docs/` until `T_REFACTOR_LAYOUT` lands. Rejected because:

- Leaves the plugin invisible to org tooling indefinitely (no Monday sync hook, no canonical perf doc, no ADR-discoverable threading model).
- The bookkeeping is needed regardless of layout — `plugin.toml` carries Monday IDs and budgets that are layout-independent.
- Other plugins that reference cross-plugin patterns (e.g., the chunked-text-loader callout in `learnings/anti-patterns/0002`) need a stable target to link to.

### Adopt the `widget-src/` layout monorepo-wide

Supersede ADR-0001 and switch every plugin to `widget-src/`. Rejected because:

- The canonical split is established in `welder-editor` and `plugins/_template/`. It works.
- The `widget-src/` layout fuses the contract (types, constants, slide-machine) with the code-side modules, which weakens the boundary between the sandbox-side logic and the schema. The org's review discipline is built around the contract being its own folder.
- The chunked-text-loader is a workaround for a specific Figma sandbox parser limit (`learnings/anti-patterns/0002`) that is cleaner to handle via `__html__` + `vite-plugin-singlefile`.

## Consequences

### Positive

- The import PR is small, reviewable, and trivially reversible.
- v0.2.1 functionality is preserved exactly; nothing about the working build changes.
- The audit trail clearly separates "imported v0.2.1 + bookkeeping" from "refactored to canonical layout" as two distinct events.
- Cross-references from other plugins (e.g., the chunked-text-loader anti-pattern callout) have a stable, discoverable home.

### Negative

- The repo carries a non-canonical layout for the duration of the deviation window. Anyone reading `CLAUDE.md` will see one rule and find a counter-example one folder over.
- Build tooling for this plugin diverges from `welder-editor` until `T_REFACTOR_LAYOUT` lands (npm vs pnpm, esbuild + chunked-text-loader vs vite + singlefile).
- Cross-domain actions inside `widget-src/editors/<name>/` are easier to commit by accident than in the canonical split, because the per-editor folders fuse code-side and ui-side files. Reviewers must be alert.
- If `T_REFACTOR_LAYOUT` slips indefinitely, the deviation hardens and the org pays a maintenance tax.

### Reversibility

The deviation is reversible by `T_REFACTOR_LAYOUT`. There is no breaking change to plugin users, manifest, or persisted state. The canonical layout is the target; this ADR documents only the timing.

If `T_REFACTOR_LAYOUT` is not feasible within two minor releases (i.e., not landed by v0.4.0), `project-pm` revisits this ADR — either by extending the deviation window with explicit justification or by pulling the refactor into the next sprint as a blocking item.

## References

- `CLAUDE.md` §"Hierarchical structure" — establishes `code/` + `ui/` + `shared/` as the canonical layout
- ADR-0001 — monorepo structure
- `plugins/_template/` — canonical scaffold (compare against `plugins/_placeholder-plugin/widget-src/`)
- `plugins/welder-editor/` — canonical-layout reference plugin
- `learnings/anti-patterns/0002-figma-plugin-load-debugging.md` — chunked-text-loader pattern and the `__html__` alternative
- `plugins/_placeholder-plugin/spec.md` — imported product spec (Dutch)
- `plugins/_placeholder-plugin/.reviews/perf-investigation-2026-04-26.md` — pre-import perf investigation
- `plugins/_placeholder-plugin/plugin.toml` — placeholders for Monday IDs and bundle budgets
- `plugins/_placeholder-plugin/CHANGELOG.md` — onboarding-debt list
