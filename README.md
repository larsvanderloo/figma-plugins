# Welder Editor 

test
Figma plugin for editing existing Welder-branded slides in Figma Design and Figma Slides. The user selects a slide on the canvas, then edits its content via sub-editors for title/description, badge, image, cards, timeline items, and tables.

The current repository structure is documented in [`docs/architecture/current-structure.md`](./docs/architecture/current-structure.md). The older product/backlog specification lives in [`docs/product/specs/spec.md`](./docs/product/specs/spec.md) and can contain historical paths or queued ideas.

## Build

```bash
npm install
npm run build          # vite (UI) + esbuild (sandbox)
npm run watch          # parallel watch mode
npm run debug:session  # local log collector + debug watch
npm run debug:restart  # stop older debug/watch processes, then start debug session
npm run debug:stop     # stop repo-local debug/watch processes
npm run debug:watch    # watch mode with debug logs + inline sourcemaps
npm run debug:manifests # write manifest-cache/*/manifest.json for Figma import
npm run debug:logs     # local Figma runtime log collector only
npm run dev:ui         # vite dev server for UI iteration
npm run workspace:assert # fail on stale nested generated workspaces
npm run typecheck      # plugin sandbox + UI type checks
npm run typecheck:ui   # vue-tsc strict
npm run version:assert # verify built bundles contain package.json version
npm run release:check  # typecheck, production build, and debug-leak assertions
```

Load in Figma → Plugins → Development → Import plugin from manifest → point at `manifest.json`.

## Debugging

Use VS Code for source edits and the `Figma: debug session` task. That task runs `npm run debug:restart`: it first stops older repo-local debug/watch processes, then starts the build watcher and a local log collector at `http://localhost:4789/log`, so Figma runtime logs also stream into the VS Code terminal and `.local/figma-debug.log`.

For this terminal log bridge, import `manifest-cache/debug/manifest.json` in Figma Desktop. Figma requires the imported file to be named `manifest.json`, with `main` and `ui` inside that manifest directory; `manifest.debug.json` is only the checked-in source template. Use Figma Desktop Developer Tools for runtime inspection: open `Plugins → Development → Open Console...` (`Option+Cmd+I`), enable `Plugins → Development → Use Developer VM` only when stepping through source, and add temporary `debugger;` statements where needed. See [`docs/debugging/figma-plugin-debug-setup.md`](./docs/debugging/figma-plugin-debug-setup.md) for the full setup details.

For read-only Figma-for-VS-Code / Dev Mode diagnostics, import `manifest-cache/dev/manifest.json`. That manifest runs the same bundle with `editorType: ["dev"]`; document-mutating bridge commands are blocked with a `target-updated` error.

## Release

Before tagging or handing off a VS Code release, stop any active `npm run watch`, `npm run debug:session`, or `npm run debug:watch` terminals, then run:

```bash
npm run release:check
```

In VS Code, run the `Figma: release check` task. This gate type-checks, builds a production `dist/`, and fails if sourcemaps or the localhost debug endpoint are present. See [`docs/release/figma-plugin-release.md`](./docs/release/figma-plugin-release.md) for the full release checklist.

The UI version badge is generated from `package.json` by `npm run build:version`, which is called automatically by `npm run build`, `npm run build:ui`, and `npm run watch`. `npm run version:assert`, `npm run debug:manifests`, and `npm run release:assert` fail if `dist/` or generated debug bundles contain a stale `0.5.x` tag.

## Architecture

- `src/code.ts` — plugin-sandbox entry (runs `figma.*`, ES2017 target).
- `src/ui/` — iframe Vue 3 app (Nuxt UI v4, ES2020+ target).
- `src/types.ts` — message-bus contract between the two threads.
- `src/editors/` — per-editor logic.
- `src/csv/` — CSV tokenizer (used by the Table editor).

The two threads are isolated; everything they share crosses the message bus. See `CLAUDE.md` for the non-negotiable thread rules.

See [`docs/architecture/current-structure.md`](./docs/architecture/current-structure.md) for the current placement rules for Nuxt UI primitives, Figma API code, generated files, and known refactor targets.

## Editor types

`manifest.json` declares `["figma", "slides"]`. FigJam is excluded — the Slide Machine library components are not hostable there.
