# Section template

Composite views built from `components/`. Each section is a workspace package: copy this folder to `sections/<name>/`, rename in `package.json`, and implement.

Discipline (per `.claude/agents/ui-engineer.md` §"Designing a section"):

- Sections own their own state machine (Pinia store or local `reactive`). Props are config; events are output.
- Sections accept `loading` and `error` states in their props contract — there is no fetching inside a section.
- Reused-across-plugins sections live here. Plugin-specific screens live under `plugins/<slug>/ui/views/`.

## Adding a section

1. Copy `sections/_template/` to `sections/<name>/`.
2. Rename in `package.json` and `src/index.ts`.
3. Implement, test, document.
4. From a plugin, depend via `"@figma-plugins/sections-<name>": "workspace:*"`.
