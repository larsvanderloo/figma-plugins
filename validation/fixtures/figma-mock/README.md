# figma-mock — mock figma.* global for code-side vitest tests

Owner: `plugin-tester` (harness contract) / `figma-api-engineer` (implementation)

This directory provides the `createFigmaMock()` factory that code-side tests use
to install a structural `figma` global in the Node/vitest environment.

See `validation/fixtures/README.md` §1 for the full contract and usage pattern.

---

## Status

Sprint 0: directory and conventions created.
Sprint 1: `figma-api-engineer` implements `index.ts` and `types.ts`.

## Files (Sprint 1 fills these)

- `index.ts` — exports `createFigmaMock(options)` and `captureNodeTree(node)`.
- `types.ts` — DeepPartial types so stubs typecheck without the full `@figma/plugin-typings` surface.

## Surfaces to mock at Sprint 1

| Call | Notes |
|---|---|
| `figma.currentPage.selection` | Settable array |
| `figma.currentPage.findAll(pred)` | Filter over pre-loaded node array |
| `figma.getNodeByIdAsync(id)` | Async Map lookup |
| `figma.ui.postMessage(msg)` | Captured for assertion |
| `figma.on('selectionchange', cb)` / `figma.on('close', cb)` | Register/fire |
| `figma.closePlugin()` | No-op spy |
| `figma.commitUndo()` | No-op spy |
| `node.getPluginData(key)` / `node.setPluginData(key, value)` | In-memory Map |
| `node.setRelaunchData(data)` | Spy |
| `figma.loadFontAsync(font)` | Resolves immediately |
| `figma.importComponentByKeyAsync(key)` | Returns minimal INSTANCE stub |
| INSTANCE shape: `type`, `name`, `width`, `height`, `children` | Plain object |

## `captureNodeTree(node)` contract

Returns a plain JSON-serializable tree of every property explicitly set on the
mock node and its descendants. Used by renderer golden-snapshot tests in Sprint 4.
Only records properties that were written by the renderer — Figma defaults are
not included (no noise from the mock's zero-value fields).

Output shape (example):
```json
{
  "type": "FRAME",
  "name": "table-container",
  "width": 1280,
  "height": 600,
  "layoutMode": "VERTICAL",
  "children": [
    { "type": "FRAME", "name": "row-0", "children": [...] }
  ]
}
```
