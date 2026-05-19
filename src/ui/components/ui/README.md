# Welder UI Primitives

Use Nuxt UI components directly when they already express the right behavior.
Use a `W*` wrapper only when Welder adds product behavior, layout semantics, or
a reusable surface pattern.

- `U*`: raw Nuxt UI components, themed globally in `src/ui/theme/nuxt-ui.ts`.
- `W*`: Welder primitives that wrap Nuxt UI or encode Welder-specific behavior.
- Domain components: editor and panel components that compose `U*` and `W*`.

Current wrappers:

- `WCard`, `WCardSection`, `WCardSectionGroup`: Welder card surface and grouped
  section structure.
- `WInsetPanel`: nested surface for repeated editor subpanels.
- `WInput`, `WTextarea`: text controls that keep local draft state and commit on
  blur/Enter to avoid sandbox round-trips per keystroke.

Do not add a wrapper just to rename a Nuxt UI component. For global styling,
prefer the Nuxt UI theme config and semantic tokens. Add wrappers only when they
remove repeated product logic or make a Welder-specific contract explicit.
