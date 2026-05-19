# Current Repository Structure

This is the current source-of-truth for where new Welder Editor code should go.
Older files in `docs/product/specs/` are historical backlog notes and can contain
old `plugin-src/`, Journey, or chart terminology.

## Runtime Split

The plugin has two isolated runtimes:

- `src/code.ts` and `src/editors/**`: Figma sandbox code. This side may use
  `figma.*` APIs and must keep document mutations here.
- `src/ui/**`: Vue 3 iframe code. This side owns Nuxt UI, Pinia stores,
  local draft state, and user interaction. It must not call `figma.*`.
- `src/types.ts`: typed message-bus contract between the two runtimes.

Anything shared between the runtimes must be serializable over the Figma plugin
message bridge.

## UI Design System

The iframe uses Nuxt UI v4 through `@nuxt/ui/vite` and
`@nuxt/ui/vue-plugin`.

- Use `U*` components directly when Nuxt UI already models the behavior.
- Use `W*` wrappers only when Welder adds behavior, layout semantics, or a
  reusable product surface.
- Current Welder primitives live in `src/ui/components/ui/`.
- Global Nuxt UI theme overrides live in `src/ui/theme/nuxt-ui.ts`.
- The app root must stay wrapped in `UApp`.

Do not create wrapper components just to rename Nuxt UI components. Prefer
theme configuration, semantic Nuxt UI tokens, and direct `U*` composition.

## Generated Files And Caches

Tracked generated files:

- `dist/code.js`
- `dist/ui.html`
- `src/ui/generated/app-version.ts`
- `src/ui/auto-imports.d.ts`
- `src/ui/components.d.ts`

Ignored local caches:

- root `node_modules/`
- root `node_modules/.nuxt-ui/`
- `manifest-cache/`
- `.local/`

`src/ui/node_modules/` is not allowed. The Vite root is the repository root so
Nuxt UI writes its generated `.nuxt-ui` cache into the normal root
`node_modules/` tree.

Run `npm run workspace:assert` before debug or release work when the workspace
looks suspicious.

## Where New Code Goes

- New Figma mutations: add a focused helper under `src/editors/<domain>/` and
  call it from the sandbox message handler.
- New UI controls: prefer a domain editor under `src/ui/components/editors/`
  plus a composable under `src/ui/composables/` when it needs local draft or
  bridge state.
- New shared bridge shapes: add to `src/types.ts`, then update both sender and
  receiver in the same change.
- New release/debug safety checks: add a script under `scripts/` and wire it
  into `package.json`.

## Known Refactor Targets

- `src/code.ts` should become a thin bootstrap around focused sandbox modules.
- `src/ui/App.vue` should keep shrinking into shell components and composables.
- `src/ui/components/editors/TableEditor.vue` and
  `src/editors/table/renderer.ts` are the largest domain modules and should be
  split before adding more table behavior.
- `src/types.ts` and `src/constants.ts` should be split by domain once the
  current UI cleanup stabilizes.
