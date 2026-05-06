# Welder Editor

Figma plugin for editing existing Welder-branded slides in Figma Design and Figma Slides. The user picks a slide on the current page from a dropdown, then edits its content across three tabs (General / Content / Graphs) wiring up sub-editors for TitleDescription, Badge, Image, Card list, Chart, Table, and Journey/Timeline. Consolidates the predecessors `welder-table` v0.2.0 (plugin) and `chart-builder` v0.3.0 (widget) — those tags remain in their respective repos as a rollback path.

The full product specification is in [`spec.md`](./spec.md) (Dutch, ~2300 lines). The org bookkeeping (api-spec, threading, perf) is under [`docs/`](./docs/).

## Imported from external scaffold

This plugin was imported from an external zip carrying the working v0.2.1 Welder Editor build, then fitted with the canonical org bookkeeping non-destructively. The original `plugin-src/` layout is retained pending a follow-up refactor to the canonical `code/` + `ui/` + `shared/` split — see the import ADR in the top-level `docs/adr/` for the rationale and the planned `T_REFACTOR_LAYOUT` task.

Onboarding debt that still needs to be paid down:

- **Lockfile migration.** The zip ships `package-lock.json` (npm) and the `name` field in `package.json` is `welder-editor` — neither matches the org's pnpm workspace + `@figma-plugins/...` naming convention. Until migrated, build with `npm install && npm run build` from inside this folder. TODO(project-pm + ui-engineer): migrate to pnpm workspace member, rename to `@figma-plugins/welder-editor`, drop `package-lock.json`. The `pnpm-workspace.yaml` `plugins/*` glob already picks this folder up; only the per-plugin `package.json` and lockfile need to change.
- **Layout refactor.** Move `plugin-src/code.ts` → `code/main.ts`, `plugin-src/ui/` → `ui/`, `plugin-src/{types,constants,slide-machine}.ts` → `shared/`, and rewire `vite.config.ts` + `esbuild.config.mjs`. See the import ADR for scope.
- ~~**Monday folder + Scrum Team boards.**~~ Done — folder `placeholder-plugin team` (id 2996351) with the standard Scrum Team boards is wired in `plugin.toml [monday]`. Sync targets the Tasks board (id 5095985440) on PR events that carry `Resolves MON-<id>`.
- **Real (gzipped) bundle budgets.** The numbers in `plugin.toml` `[validation]` are raw-byte placeholders pulled from the imported zip. A measured gzipped pass is required before the next release; see `docs/perf/budget.md`.

## Layout (current — deviation from canonical, see import ADR)

```
welder-editor/
├── plugin.toml          # Plugin metadata (slug, owner_agent, monday, budgets, message-bus version)
├── manifest.json        # Figma plugin manifest (editorType: figma + slides; documentAccess: dynamic-page)
├── package.json         # npm-managed today; TODO migrate to pnpm workspace
├── package-lock.json    # npm — TODO drop after pnpm migration
├── vite.config.ts       # builds plugin-src/ui/ → dist/ui.html (single-file)
├── esbuild.config.mjs   # builds plugin-src/code.ts → dist/code.js (chunked-text-loader inlines dist/ui.html)
├── tsconfig.json        # code-side, ES2017
├── tsconfig.ui.json     # ui-side, ES2020
├── app.config.ts        # Nuxt UI palette
├── spec.md              # product spec (Dutch, ~2300 lines)
├── plugin-src/          # NON-CANONICAL layout — to be split into code/, ui/, shared/
│   ├── code.ts          # main-thread bundle entry
│   ├── types.ts         # message-bus types + domain models (the de-facto contract)
│   ├── constants.ts
│   ├── slide-machine.ts # wrapper detectors
│   ├── editors/         # per-editor logic (general, content, chart, table, journey, shared)
│   ├── chart-core/csv/  # CSV parser
│   └── ui/              # Vue 3 iframe app (components, composables, assets)
├── docs/                # org bookkeeping
│   ├── api-spec/overview.md
│   ├── threading/overview.md
│   └── perf/budget.md
├── tests/               # plugin-tester landing zone
├── validation/          # plugin-tester landing zone (e2e gauntlet, listening tests, submissions)
└── .reviews/            # prior perf investigation (carried over from external scaffold)
```

The agent ownership map from `CLAUDE.md` applies to `plugin-src/` paths during the deviation window: `plugin-src/code.ts` is owned by `figma-api-engineer`; `plugin-src/ui/` by `ui-engineer`; `plugin-src/types.ts` + `plugin-src/constants.ts` + `plugin-src/slide-machine.ts` (the contract) by `figma-api-engineer`. The chart-core CSV parser belongs to `figma-api-engineer` (data shape) with `ui-engineer` consultation when the parser is consumed in the iframe. Editors under `plugin-src/editors/` cross both — touch `code/` paths via `figma-api-engineer`, ui rendering via `ui-engineer`.

## Dev loop (interim — npm)

```bash
# From inside this folder
npm install                                          # installs from package-lock.json
npm run build                                        # build:ui (vite) + build:widget (esbuild)
npm run watch                                        # parallel watch mode (concurrently)
# In Figma desktop: Plugins → Development → Import plugin from manifest…
# Select plugins/welder-editor/manifest.json
# Plugin appears under Plugins → Development → Welder Editor
```

After the pnpm migration the canonical commands will be `pnpm --filter @figma-plugins/welder-editor build` etc.

## Validation

```bash
npm run typecheck:ui     # vue-tsc --noEmit -p tsconfig.ui.json
# Code-side typecheck and unit tests are TODO — they require the layout refactor
# (no shared/ or tests/ wiring exists in plugin-src/ yet).
```

Before tagging, run the e2e gauntlet per `runbooks/e2e-gauntlet.md` in each enabled editor type (Figma Design + Figma Slides) on Figma desktop.

## Editor types

This plugin's `manifest.json` declares `["figma", "slides"]`. FigJam is excluded — the Slide Machine library components are not hostable in FigJam (same rationale as ADR-0002, scoped to the deleted scaffold but still applicable per ADR-0018). Narrowing scope after launch requires an ADR.

## Workflow

See `CLAUDE.md` (repo root) for the agent ownership map, validation thresholds, and plugin-thread rules. See the import ADR in `docs/adr/` for the deviation window covering the `plugin-src/` layout.
