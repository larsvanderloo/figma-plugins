# API-spec overview — welder-editor

**Status:** Pointer (onboarding placeholder)
**Date:** 2026-05-06
**Owner:** figma-api-engineer

The canonical product spec for this plugin lives in [`../../spec.md`](../../spec.md). It was imported intact from the external scaffold zip and is the authoritative source for v0.2.1 behaviour: feature inventory, wrapper detection rules, persistence model, message-bus contract, and editor-by-editor behaviour. It is written in Dutch (~2300 lines).

This file is a stub. As features are touched in the monorepo flow, `figma-api-engineer` should add api-surface notes that follow the org template (see `plugins/welder-editor/docs/api-spec/welder-editor.md` for the canonical shape: purpose statement, manifest constraints, READ / MUTATE / UI bridge / NETWORK / STORAGE inventories, persistence model, risk flags, reuse opportunities, submission gates, measurement gaps).

Do not attempt a one-shot translation of `spec.md`. Increment per feature touched, and reconcile with `plugin-src/types.ts` (the de-facto contract — see `../threading/overview.md`).

## Pointers into the existing scaffold

- **Manifest constraints** — see `../../manifest.json`. Editor types: `["figma", "slides"]`. Document access: `dynamic-page`. Permissions: `teamlibrary`. Network access: `none`. Has `menu` (`Open slide editor`) and `relaunchButtons` (`Bewerk met Slide Editor`).
- **Wrapper detection rules** — `../../plugin-src/slide-machine.ts`.
- **Per-editor logic** — `../../plugin-src/editors/{general,content,chart,table,journey,shared,_shared}/`.
- **Domain models + message-bus contract** — `../../plugin-src/types.ts`.
- **Constants (variable keys, library file IDs, magic strings)** — `../../plugin-src/constants.ts`.
- **Prior perf investigation** — `../../.reviews/perf-investigation-2026-04-26.md`.

## Layout deviation

The current scaffold retains the imported `plugin-src/` layout instead of the canonical `code/` + `ui/` + `shared/` split. See the import ADR in the top-level `docs/adr/` directory for rationale and the planned `T_REFACTOR_LAYOUT` task. Until that refactor lands:

- Code-side API integration lives in `plugin-src/code.ts` (~58 KB) and is owned by `figma-api-engineer`.
- The contract types (`UIMessage`, plugin → ui messages, domain models) live in `plugin-src/types.ts` and are owned by `figma-api-engineer` — treat any change there with the same review weight as a `shared/messages.ts` change in `welder-editor`.
- The iframe Vue app lives in `plugin-src/ui/` and is owned by `ui-engineer`.

A canonical api-spec brief (in this folder) and a canonical `shared/messages.ts` will be authored as part of `T_REFACTOR_LAYOUT`. Until then, this overview plus `spec.md` plus `plugin-src/types.ts` are the contract.
