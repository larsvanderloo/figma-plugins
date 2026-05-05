# @figma-plugins/components

Atomic Vue primitives + design tokens for Figma plugins, built atop Nuxt UI v4.

Owned by `ui-engineer`. Adding a component goes through the discipline in `.claude/agents/ui-engineer.md` §"Designing a component".

## Layout

```
components/
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── src/
    ├── index.ts            Barrel — re-exports every component
    ├── tokens/             Design tokens (color, spacing, typography)
    │   └── index.ts
    └── _template/          Component skeleton (copy to src/<Name>/)
        ├── Component.vue
        ├── Component.test.ts
        └── README.md
```

## Usage from a plugin

```ts
import { Button } from '@figma-plugins/components';
import { tokens } from '@figma-plugins/components/tokens';
```

## Adding a component

1. Copy `src/_template/` to `src/<Name>/`.
2. Rename `Component.vue` → `<Name>.vue`, `Component.test.ts` → `<Name>.test.ts`.
3. Implement per the discipline in `.claude/agents/ui-engineer.md`.
4. Re-export from `src/index.ts`.
5. Add tests, README. Run `pnpm test`, `pnpm typecheck`, `pnpm lint` from the package or the repo root.
