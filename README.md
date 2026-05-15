# Welder Editor

Figma plugin for editing existing Welder-branded slides in Figma Design and Figma Slides. The user picks a slide on the current page from a dropdown, then edits its content across three tabs (General / Content / Graphs) wiring up sub-editors for TitleDescription, Badge, Image, Card list, Chart, Table, and Journey/Timeline.

Consolidates the predecessors `welder-table` v0.2.0 (plugin) and `chart-builder` v0.3.0 (widget).

The full product specification is in [`docs/product/specs/spec.md`](./docs/product/specs/spec.md) (Dutch, ~2300 lines).

## Build

```bash
npm install
npm run build          # vite (UI) + esbuild (sandbox)
npm run watch          # parallel watch mode
npm run dev:ui         # vite dev server for UI iteration
npm run typecheck:ui   # vue-tsc strict
```

Load in Figma → Plugins → Development → Import plugin from manifest → point at `manifest.json`.

## Architecture

- `plugin-src/code.ts` — plugin-sandbox entry (runs `figma.*`, ES2017 target).
- `plugin-src/ui/` — iframe Vue 3 app (Nuxt UI v4, ES2020+ target).
- `plugin-src/types.ts` — message-bus contract between the two threads.
- `plugin-src/editors/` — per-editor logic.
- `plugin-src/chart-core/` — chart rendering + CSV parser.

The two threads are isolated; everything they share crosses the message bus. See `CLAUDE.md` for the non-negotiable thread rules.

## Editor types

`manifest.json` declares `["figma", "slides"]`. FigJam is excluded — the Slide Machine library components are not hostable there.
