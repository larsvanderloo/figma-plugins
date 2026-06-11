# `stores/` — Pinia state stores

Plugin-local Pinia stores for the welder-editor iframe. One store per cross-component reactive state surface.

## Convention

- **One file per store.** Filename starts with `use<Name>Store.ts` (or `use<Name>.ts` for view-state stores like `usePluginView`).
- **Setup syntax** (`defineStore('id', () => { ... })`) — keeps the existing composable feel, lets us return a nested `state` reactive when the shape is large.
- **Store id** is the camelCase name without `use` prefix: `pluginView`, `iconRecents`. Used by Pinia devtools.
- **Return shape** is `{ state, ...actions }` where `state` is a `reactive<...>` object. Consumers access via `view.state.X` and `view.someAction()`. Keeping `state` nested means future schema changes only touch the store file, not every consumer.
- **No async in actions.** Bridge-sends (postMessage to the Figma sandbox) live in components or composables, not stores. Stores stay thread-agnostic and easy to test.
- **Scope.** These stores hold state that lives only in the iframe. State that needs to round-trip to the sandbox goes through the message-bus contract in `src/shared/types.ts`, not through the stores.

## When to add a third store

When two or more components share state that doesn't naturally fit into `usePluginView` (slide-level view state) or an existing focused store. Otherwise, prefer a local `ref()` in the component or a composable in `composables/`.

## Devtools

Vue DevTools' Pinia panel shows each store's state tree under its id. The nested `state` reactive expands one level deeper than canonical Pinia (where state would be top-level refs) — this is intentional and documented above.
