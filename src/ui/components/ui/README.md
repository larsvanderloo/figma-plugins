# Welder UI Primitives

Use Nuxt UI components directly when they already express the right behavior.
Use a `W*` wrapper only when Welder adds product behavior, layout semantics, or
a reusable surface pattern.

- `U*`: raw Nuxt UI components.
- `W*`: Welder primitives that wrap Nuxt UI or encode Welder-specific behavior.
- Domain components: editor and panel components that compose `U*` and `W*`.

Current wrappers:

- `WInput`, `WTextarea`: text controls that keep local draft state and commit on
  blur/Enter to avoid sandbox round-trips per keystroke.

Do not add a wrapper just to rename a Nuxt UI component. Prefer Nuxt UI props
and semantic tokens before slot overrides. Add wrappers only when they remove
repeated product logic or make a Welder-specific contract explicit.
