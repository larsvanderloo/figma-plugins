# Welder Editor — Figma plugin

A single-plugin repo. Targets **Figma design** and **Figma Slides** (see `manifest.json`). Vue 3 + Nuxt UI v4 for the iframe; TypeScript + esbuild for the plugin sandbox.

## Layout

```
manifest.json                    Figma plugin manifest (also: manifest.dev.json / manifest.debug.json variants)
src/
  sandbox/                       everything bundled into dist/code.js (runs figma.*)
    main.ts                      entry: bootstrap, registry dispatch, figma.on listeners
    bridge.ts                    postToUI + self-write suppression window
    slides.ts                    slide page cache + finders
    runtime.ts                   editor-type/runtime info
    session.ts                   session state + emit helpers (postSlideContent, ...)
    handlers/                    message-handler registry, one module per domain
    scan/                        read side: slide-scan.ts composes per-domain scans over shared readers.ts
    editors/                     write side: feature editors (shared helpers in editors/_shared/)
    slide-machine.ts             slide-build state machine
    lucide-aliases.ts            generated icon-alias map
  shared/                        imported by BOTH bundles — must satisfy the sandbox constraints below
    types.ts                     message-bus schema barrel; domain files in types/
    constants.ts                 surface signatures, table limits
    debug.ts                     debugLog helpers, active only in PLUGIN_DEBUG=1 builds
    csv/                         CSV tokenizer (table editor sandbox-side + UI preview)
  ui/                            iframe Vue app (Vue 3 + Nuxt UI v4); plugin-message handling in composables/usePluginMessages.ts
scripts/                         build/release/debug tooling (shared helpers in scripts/lib.mjs)
docs/
  architecture/slide-machine.md  detection + wrapper-finder reference (verified against code; the why lives in git)
  debugging/                     local debug-session setup
vite.config.ts                   builds the iframe UI to dist/ui.html
esbuild.config.mjs               builds the plugin sandbox to dist/code.js
generate-lucide-aliases.mjs      build-time codegen for icon-alias map
generate-lucide-svgs.mjs         build-time codegen for lucide-svgs.ts + lucide-icon-names.ts
```

Generated files (committed, never hand-edited): `src/sandbox/lucide-aliases.ts`, `src/ui/lucide-svgs.ts`, `src/ui/lucide-icon-names.ts`. The app version is injected into the UI bundle at build time from `package.json` via Vite's `define` (`__APP_VERSION__`) — no generated file. `dist/` is build output and is **not** tracked (gitignored); Figma loads it from the local working tree, so run `npm run build` once after a fresh clone.

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

**Sandbox bundle (Figma sandbox, runs `figma.*`) — all of `src/sandbox/` (entry `main.ts`) plus `src/shared/` (shared code ships in both bundles, so it obeys the stricter sandbox rules)**

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
- Bundle-size sanity check: keep an eye on `dist/ui.html` size; large unexplained jumps warrant a look before shipping.

## Commits — the source of truth

There is no spec or backlog doc; **the git history is the single source of truth** for what changed and why. That only holds if commit messages carry the rationale, so the format is enforced by a `commit-msg` hook (commitlint + husky, installed via the `prepare` script on `npm install`):

- **Subject:** `type(scope): imperative summary` — type ∈ `feat | fix | refactor | perf | chore | docs | test | ci | bump | ui`. Max 90 chars. (`bump` = version bumps, `ui` = iframe-only changes — both repo-specific, not in stock conventional-commits.)
- **Body:** explain the **why** — the decision, the rejected alternative, the constraint that forced it. This is the part that replaces the old docs. A missing body warns (doesn't block) so trivial `bump`/`chore` commits still pass, but every substantive change should have one.
- **Trailer:** `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` on agent-authored commits.

The hook lives in `.husky/commit-msg`; rules in `commitlint.config.js`. A bad subject is rejected at commit time. Bypass only in genuine emergencies with `git commit --no-verify`.

### Comments

Same principle, one level down. A comment must justify itself by its own reasoning, never by citing an external doc, task-ID, or version:

- Explain the **why** / the non-obvious gotcha / the Figma-API constraint — not what the next line plainly does.
- **No dead citations.** Don't write `T39.1.1:` or `(v0.2.2)` — the spec is gone and version history lives in git. `npm run lint:comments` ([scripts/assert-no-spec-citations.mjs](scripts/assert-no-spec-citations.mjs)) fails the release gate on any new `T<n>` / `v0.x` citation in a comment.
- **`FIG-XXX-01` codes are allowed** — they're a living invariant taxonomy (e.g. `FIG-GUARD-01` = type-check before property-access, `FIG-FONT-01` = preload fonts before live events), not dead refs.

### The one architecture doc

`docs/architecture/slide-machine.md` is a **timeless structural map** of what the plugin looks for in Figma (surfaces, wrapper finders, slots, variables) — not a changelog. It must never carry dates, commit references, or fix/status notes ("deferred", "Phase-N", "was a bug"); the *when* and *why* live in commit messages. `npm run lint:doc` ([scripts/assert-doc-fresh.mjs](scripts/assert-doc-fresh.mjs)) enforces this: it rejects time-bound tokens and checks that every `find<Name>` finder and variable key the doc names still exists in `src/`, so the doc can't silently describe code that's gone.

Both guards run on **every commit** via the `pre-commit` hook (`npm run lint`) and again in `release:check`. To edit the doc: change the structural description to match the new code shape; put the rationale in the commit body.

## Releases

No CI, no zip/handoff step — Figma loads the plugin directly from `manifest.json` (→ `dist/code.js` + `dist/ui.html`) in the local working tree. "Releasing" a version is just building and committing the source:

1. Bump `version` in `package.json`.
2. `npm run release:check` (guards against debug builds, typechecks, builds `dist/`, and asserts the bundle version matches `package.json`).
3. Commit the source (`dist/` is gitignored — it's rebuilt locally, not committed).
4. Optionally tag the commit (`git tag welder-editor@v<version>`) for history.

## Where things live

- Figma Plugin API references: https://www.figma.com/plugin-docs/
- Nuxt UI v4 component docs: see the `nuxt-ui` skill / Nuxt UI MCP.
- Figma MCP — primary source of truth for design-system shape.

### Retired design docs

A larger `docs/` tree (product spec, several architecture notes, perf/release docs) was removed in favour of git history; only `docs/debugging/figma-plugin-debug-setup.md` and a rewritten, code-verified `docs/architecture/slide-machine.md` are kept. The full content of any removed doc is recoverable from the commit immediately preceding its deletion, e.g. `git show <deletion-commit>~1:docs/product/specs/spec.md`. The load-bearing rationale that lived in them is in commit bodies and code-file headers; the docs were the long-form companions, not the only record.
