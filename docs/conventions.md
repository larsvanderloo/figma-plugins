# Code conventions

Cross-plugin. Owned by `project-pm`. ADR required to override per-plugin.

## TypeScript

- **TypeScript 5+** with strict mode.
- `vue-tsc --noEmit` clean. Zero errors. No `any` (use `unknown` and narrow).
- Format: Prettier (config in repo root). Run before every commit; CI rejects unformatted code.
- Lint: ESLint with `@typescript-eslint`, Vue 3 plugin, accessibility plugin. Run before commit.
- 2-space indent, 100-col line limit. Single quotes for strings; double quotes only inside JSX/template attributes.
- `import type` for type-only imports. ESLint enforces.
- File suffixes: `.ts` for TypeScript, `.vue` for Single-File Components, `.test.ts` for tests, `.stories.ts` for Storybook (when wired).
- Path aliases via tsconfig — `@/components/...`, `@/composables/...`, `@/views/...` per plugin. Workspace packages imported by name, never via relative path across workspace boundaries.

## Vue 3

- **`<script setup>`** + Composition API for new components. No Options API.
- Props typed via `defineProps<T>()`. Emits typed via `defineEmits<E>()`. Expose typed via `defineExpose<X>()`.
- Reactivity: `ref` / `reactive` / `computed`. `shallowRef` for large data structures. `useTemplateRef` over manual ref capture.
- Composables in `ui/composables/`, named `use<Thing>()`, returning a frozen reactive object or a tuple.
- Pinia stores in `ui/stores/`, named `use<Name>Store()`. State / getters / actions clearly separated.
- No `localStorage` in `ui/` — persisted state goes through the message bus to `code/` and `figma.clientStorage`.

## Nuxt UI v4

- Use Nuxt UI primitives wherever a fit exists (`UButton`, `UInput`, `USelect`, `UTabs`, `UModal`, etc.).
- Theme overrides in per-plugin `app.config.ts` derived from `components/tokens/`.
- When a Nuxt UI component doesn't fit, build a wrapper in `components/` that composes it; don't fork.
- Component density default: compact (`xs` / `sm` sizes). Reach for `md`/`lg` only on marketing surfaces.
- Light + dark mode supported in every component. Mode comes from the plugin's message bus.
- Respect `prefers-reduced-motion`.

## Accessibility

- WCAG 2.1 AA bar. Zero axe violations to merge.
- Every interactive element keyboard-reachable; tab order matches visual flow.
- Focus styles always visible.
- ARIA labels on icon-only buttons. `aria-live` on async status updates.
- Color contrast ≥ 4.5:1 for text, ≥ 3:1 for UI components.
- Don't shadow Figma's host shortcuts (Cmd-Z, Cmd-D, Cmd-A, etc.) from the iframe.

## Code (`code/` bundle, runs in Figma sandbox)

- No DOM access — no `window`, `document`, `localStorage`, `XMLHttpRequest`, `WebSocket`.
- `fetch` only against `allowedDomains` from the manifest.
- Async-everywhere mindset: `getNodeByIdAsync`, `loadFontAsync`, etc., not deprecated sync variants.
- Bounded iteration on every traversal.
- Validated message handlers — every incoming message goes through a Zod schema at the boundary.
- Document mutations group under user-meaningful undo steps.

## Python (monday-sync, bootstrap, perf tooling)

- **Python 3.11+** (matches `pyproject.toml`).
- **Format**: `ruff format` (or `ruff format --check` in CI).
- **Lint**: `ruff check`.
- **Type-check**: `mypy` non-strict for now; tighten per-file as types land.
- **Tests**: `pytest`. Test files named `test_*.py`. Discovery configured in `pyproject.toml`.

## Commits

- **Subject**: `<type>(<scope>): <subject> [#MON-<id>]` — see `runbooks/monday-workflow.md` §7.
- **Types**: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`.
- **Scope**: plugin slug (`welder-editor`) or shared dir (`components`, `sections`, `packages`, `tools`, `runbooks`, `docs`).
- **Body**: `Resolves MON-<id>` line, plus rationale where the diff doesn't speak for itself.

## Branches

- `feature/MON-<id>-slug`, `bugfix/MON-<id>-slug`, `chore/MON-<id>-slug`, `hotfix/MON-<id>-slug`. See `runbooks/monday-workflow.md` §7.

## Reviews

- One reviewer for `main` (revisits when team grows).
- Validation gates per `CLAUDE.md` and `runbooks/monday-workflow.md`. Ready to Merge requires Validation Status = `All Pass`.

## Files in this repo

- `tsconfig.base.json` — shared strict TS config.
- `eslint.config.ts` — shared ESLint flat config.
- `vitest.config.ts` — vitest defaults.
- `.editorconfig` — cross-language editor consistency.
- `pyproject.toml` — Python: ruff, mypy, pytest configuration.

## Adding a new convention

If you want to add or change a rule here, open an ADR (`docs/adr/`) — conventions affect every plugin and every contributor, so they go through the standard discipline.
