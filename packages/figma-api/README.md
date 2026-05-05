# @figma-plugins/figma-api

Typed wrappers around `figma.*` + message-bus router for Figma plugins. Owned by `figma-api-engineer`.

## Exports

- `createRouter({ version })` — message-bus router. Code-side plugins wire it up to `figma.ui.onmessage`.
- (More wrappers as they land — selection helpers, document-mutation batchers, manifest helpers.)

## Usage

```ts
// In plugins/<slug>/code/main.ts
import { createRouter } from '@figma-plugins/figma-api';
import { MESSAGE_BUS_VERSION } from '@shared/messages';

const router = createRouter({ version: MESSAGE_BUS_VERSION });

router.on('apply-edit', async (payload) => {
  // mutate doc, return typed result
  return { ok: true, data: { applied: true } };
});

figma.ui.onmessage = router.handle;
```

## Adding a wrapper

1. Add the wrapper under `src/<topic>.ts`.
2. Export from `src/index.ts`.
3. Document the wrapper in this README.
4. If the wrapper exposes a new `figma.*` surface, file a brief in `packages/figma-api/docs/<topic>.md` per `figma-api-engineer`'s discipline.
