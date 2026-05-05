# {{plugin_name}}

Figma plugin scaffolded from `plugins/_template/` via `bootstrap-plugin`.

## Layout

```
{{plugin_slug}}/
├── plugin.toml          # Plugin metadata (slug, owner_agent, monday board_id, budgets)
├── manifest.json        # Figma plugin manifest (editorType, capabilities)
├── package.json         # Per-plugin deps + scripts
├── vite.config.ts       # Build config: code/ → dist/code.js (IIFE), ui/ → dist/ui.html
├── tsconfig.json
├── code/                # Main-thread bundle (figma.* sandbox, no DOM)
│   └── main.ts
├── ui/                  # Iframe Vue 3 app (full DOM, no figma.*)
│   ├── index.html
│   ├── main.ts
│   └── App.vue
├── shared/              # Types + message-bus schema (the contract)
│   └── messages.ts
├── tests/
│   ├── code/
│   └── ui/
├── docs/
│   ├── adr/             # Plugin-specific ADRs
│   ├── api-spec/        # figma-api-engineer briefs
│   ├── perf/            # Bundle + render-perf budget
│   ├── threading/       # Code↔ui message-bus model
│   └── product/
│       ├── research/
│       └── specs/
└── validation/
    ├── e2e/             # Manual gauntlet checklists + golden snapshots
    ├── listening-tests/ # Usability test rounds
    └── submissions/     # Figma Community submission packages
```

## Dev loop

```bash
# From the repo root
pnpm install                                           # one-time
pnpm --filter @figma-plugins/{{plugin_pkg}} dev        # build + watch
# In Figma desktop: Plugins → Development → Import plugin from manifest…
# Select plugins/{{plugin_slug}}/manifest.json
# Plugin appears under Plugins → Development → {{plugin_name}}
```

## Validation

```bash
pnpm --filter @figma-plugins/{{plugin_pkg}} typecheck   # vue-tsc --noEmit
pnpm --filter @figma-plugins/{{plugin_pkg}} test        # vitest
pnpm --filter @figma-plugins/{{plugin_pkg}} lint        # eslint + prettier
pnpm --filter @figma-plugins/{{plugin_pkg}} build       # production bundles
```

Before tagging, run the e2e gauntlet per `runbooks/e2e-gauntlet.md` in each enabled editor type.

## Editor types

This plugin's `manifest.json` enables editor types from the bootstrap default. Adjust by editing `manifest.json` and `plugin.toml`'s `editor_types`. Narrowing scope after launch requires an ADR.

## Workflow

See `CLAUDE.md` (repo root) for the agent ownership map, validation thresholds, and plugin-thread rules.
