# Welder Editor

A Figma plugin that lets **editors change the content of Welder-branded slides without touching the design**. It runs in Figma Design and Figma Slides, detects the selected slide (or whitepaper page) built from the Welder Slide Machine component library, and opens the matching content editors in a side panel.

The split is deliberate:

- **Designers** own the design system in Figma — variants, layout, sizing, styling. The plugin never edits those surfaces.
- **Editors** work in the plugin — text, data, and content choices only. Everything they change stays inside what the design allows.

## What it edits

| Area | Editor |
| --- | --- |
| Title & description | Heading/paragraph text, visibility, heading size, accent dimming |
| Badge | Label, Lucide icon picker, visibility |
| Image | Image fill on the slide's image slot |
| Confidentiality label | Show/hide + kind (e.g. Vertrouwelijk / Intern) |
| Theme | Slide color theme switcher |
| Cards & instructor cards | Per-card text and options |
| Timeline | Per-item text |
| Tables | Cells with emphasis, checks, badges and delta chips; column footers (sums, €/%); CSV paste; live typing fast path |
| Charts | Bars, line, donut/pie, progress and matrix, rendered as native Figma nodes from editable data (CSV import, legends, delta badges) |

Charts and tables are drawn by the plugin as plain Figma frames/text inside designated slots, so the result is a normal Figma file — no plugin required to view, present or export it.

## How it works

Two strictly separated threads, connected by a versioned, typed message bus:

- `src/sandbox/` — runs inside Figma's plugin sandbox (`figma.*` API, ES2017). Scans the selected slide (`scan/`), applies edits (`editors/`), and finds the library's wrapper components via the slide-machine detection layer.
- `src/ui/` — the iframe panel, a Vue 3 + Nuxt UI v4 app. Pure render of message-bus state; no Figma API access.
- `src/shared/` — the message-bus schema, constants and helpers shipped in both bundles.

The non-negotiable thread rules, repo layout and conventions live in [`CLAUDE.md`](./CLAUDE.md). What the plugin structurally expects from the Figma library (surfaces, wrapper finders, slots, variables) is mapped in [`docs/architecture/slide-machine.md`](./docs/architecture/slide-machine.md). **The git history is the source of truth for decisions** — there is no separate spec or backlog; commit bodies carry the why.

## Getting started

```bash
npm install
npm run build
```

Then in Figma: **Plugins → Development → Import plugin from manifest…** and point at `manifest.json`. `dist/` is gitignored — Figma loads it from your local working tree, so build once after a fresh clone.

Common commands:

```bash
npm run build          # full production build (codegen → UI → sandbox)
npm run watch          # all builders in watch mode
npm run dev:ui         # vite dev server for UI-only iteration
npm run typecheck      # tsc (sandbox) + vue-tsc (UI), both strict
npm run release:check  # release gate: guards + typecheck + build + bundle asserts
```

## Debugging

`npm run debug:session` starts a debug-build watcher plus a local log collector on `http://localhost:4789/log`, streaming Figma runtime logs into the terminal and `.local/figma-debug.log`. Import `manifest-cache/debug/manifest.json` in Figma Desktop for that bridge (written by `npm run debug:manifests`); `manifest-cache/dev/manifest.json` runs the same bundle read-only in Dev Mode. Full setup: [`docs/debugging/figma-plugin-debug-setup.md`](./docs/debugging/figma-plugin-debug-setup.md).

Stop debug/watch processes (`npm run debug:stop`) before a production build — the watchers write oversized debug bundles into `dist/`.

## Releasing

Bump `version` in `package.json`, run `npm run release:check`, commit the source. The gate type-checks, builds a production `dist/`, and fails on debug leftovers (sourcemaps, localhost log endpoint) or a stale bundle version. See the Releases section of [`CLAUDE.md`](./CLAUDE.md).

## Editor types

`manifest.json` declares `["figma", "slides"]`. FigJam is excluded — the Slide Machine library components are not hostable there.
