# Welder Editor — Figma plugin

A single-plugin repo. Targets **Figma design** and **Figma Slides** (see `manifest.json`). Vue 3 + Nuxt UI v4 for the iframe; TypeScript + esbuild for the plugin sandbox.

## Layout

```
manifest.json                    Figma plugin manifest (also: manifest.dev.json / manifest.debug.json variants)
src/
  code.ts                        plugin-sandbox entry (runs figma.*)
  ui/                            iframe Vue app (Vue 3 + Nuxt UI v4)
  editors/                       feature editors composed by the UI (shared helpers in editors/_shared/)
  csv/                           CSV tokenizer (consumed by table editor)
  slide-machine.ts               slide-build state machine
  debug.ts                       debugLog helpers, active only in PLUGIN_DEBUG=1 builds
  ...
scripts/                         build/release/debug tooling (shared helpers in scripts/lib.mjs)
docs/
  architecture/                  architecture notes
  perf/                          perf investigations
  product/specs/spec.md          full product spec (Dutch, ~2300 lines)
vite.config.ts                   builds the iframe UI to dist/ui.html
esbuild.config.mjs               builds the plugin sandbox to dist/code.js
generate-lucide-aliases.mjs      build-time codegen for icon-alias map
generate-lucide-svgs.mjs         build-time codegen for lucide-svgs.ts + lucide-icon-names.ts
```

Generated files (committed, never hand-edited): `src/lucide-aliases.ts`, `src/ui/lucide-svgs.ts`, `src/ui/lucide-icon-names.ts`, `src/ui/generated/app-version.ts`, `dist/` (tracked so a fresh clone loads in Figma without building).

## Build commands

```
npm run build          # full build: version → aliases → svgs → ui (vite) → code (esbuild)
npm run watch          # all builders concurrently in watch mode (skips codegen)
npm run dev:ui         # vite dev server for the iframe (UI-only iteration)
npm run typecheck      # tsc (sandbox) + vue-tsc (UI), both strict
npm run debug:session  # debug-build watch + local log collector on :4789 (see scripts/)
npm run release:check  # full release gate: guards + typecheck + build + bundle asserts
```

Loadable via Figma → Plugins → Development → Import plugin from manifest → point at `manifest.json` (debug/dev variants load from `manifest-cache/` written by `npm run debug:manifests`). Smoke-test in both design and Slides editor types before tagging.

## Plugin-thread rules (non-negotiable)

The Figma plugin runtime has two threads with strict separation. Crossing them outside the message bus is a blocking review comment.

**`src/code.ts` (Figma sandbox, runs `figma.*`)**

- No DOM — no `document`, `window`, `localStorage`, `fetch` against arbitrary URLs (only `allowedDomains` from manifest; currently `["none"]`).
- ES2017 target only — no optional chaining, nullish coalescing, or catch-without-binding in the sandbox bundle. The UI bundle (Vite) may use ES2020+.
- No silent error-eats — operations return typed results through the message bus.
- Document mutations grouped under a single user-visible undo step where possible (`figma.commitUndo()` discipline).

**`src/ui/` (iframe, runs Vue)**

- No `figma.*` imports — the iframe has no Figma API surface.
- No direct DOM mutation outside Vue's reactivity.
- All state that depends on Figma comes through the message bus; the UI is a render of message-bus-derived state, not a parallel store.
- Long ops show progress, are cancellable, and don't block first paint.

**Across the bus**

- Versioned, typed schema. Breaking schema changes ship a migration.
- Validated at the boundary on both sides; reject malformed input rather than crashing.

## Two-audience model

- **Designers** work in Figma. They control variants, layouts, component sizing, and visual styling — those are designer-locked surfaces.
- **Editors** work in the plugin. They control content only.

Don't flag designer-locked surfaces as "missing plugin features." If a structural or naming mismatch can be resolved by renaming in Figma OR by adding plugin code, prefer the Figma-side fix — less code surface, less drift.

When investigating visual or structural bugs, query the Figma MCP for ground truth first. Speculative fixes on design-system-shaped bugs cost more than the MCP query.

## Validation expectations

Before tagging a release:

- `npm run typecheck` clean (zero errors, both sandbox and UI configs).
- `npm run build` produces `dist/code.js` and `dist/ui.html`.
- Manual smoke in Figma design and Slides on desktop (primary), then web.
- Accessibility scan on the iframe should be axe-clean at WCAG 2.1 AA. No axe wiring in CI yet — run manually via DevTools axe extension when touching UI.
- Bundle-size sanity check: `dist/ui.html` should stay under the per-build target documented in `docs/perf/`.

## Releases

No CI. To cut a release:

1. Bump `version` in `package.json`.
2. `npm run release:check` (guards against debug builds and stale bundle versions).
3. The loadable bundle is `manifest.json` + `dist/code.js` + `dist/ui.html` — zip those three (preserving the `dist/` path) and hand it off.
4. Optionally tag the commit (`git tag welder-editor@v<version>`) for history.

## Where things live

- Figma Plugin API references: https://www.figma.com/plugin-docs/
- Nuxt UI v4 component docs: see the `nuxt-ui` skill / Nuxt UI MCP.
- Figma MCP — primary source of truth for design-system shape.
