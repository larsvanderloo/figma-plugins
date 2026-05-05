# 0002 — Figma plugin "Syntax error on line 1: Unexpected token {" root cause and fix

**Date:** 2026-05-05
**Plugin:** welder-editor
**Trigger:** P0 — plugin won't load after IIFE fix (PR #28) shipped

---

## Symptom

After importing a plugin via `Plugins → Development → Import plugin from manifest...` and clicking the plugin entry, Figma desktop console shows:

```
Syntax error on line 1: Unexpected token {
    at ee (figma_app__react_profile-*.min.js.br:711:45)
    at async figma_app__react_profile-*.min.js.br:841:12341
```

The error fires every time the user clicks the plugin entry.

---

## Investigation path

### What was ruled out first

1. `dist/code.js` IIFE format — verified via `grep -cE "^(import|export)" dist/code.js` (returns 0). The PR #28 IIFE fix was confirmed effective: the dist/code.js starts with `var st=Object.defineProperty...` and passes `node --check`.
2. Manifest BOM / JSON validity — verified via `xxd | head` (0x7b 0x0a = `{` + newline) and `node -e "JSON.parse(...)"`.
3. Template literals and nullish coalescing in code.js — present in our build AND in the working external build. Not the cause.
4. `id` string format — the working external build has a numeric string id. Our `"welder-editor-dev"` is non-numeric. Not confirmed as a cause (the error fires identically regardless).

### Key comparative signal

The working external build at `/Users/lars/Documents/Claude/Figma_plugin/plugins/welder-slide-editor/` uses esbuild with a **chunked HTML text loader** that embeds the entire `dist/ui.html` as string chunks inside `code.js`. Its `dist/ui.html` is a Vite-built single-file HTML with everything inlined (`<script type="module" crossorigin>`, no external `src=`).

Our build used the standard Vite multi-file output:

- `dist/ui/index.html` (359 bytes) — just the HTML shell
- `dist/ui.js` (124 KB) — the JS bundle
- `dist/ui.css` (10.6 KB) — the CSS bundle

The `dist/ui/index.html` contained:

```html
<script type="module" crossorigin src="/ui.js"></script>
<link rel="stylesheet" crossorigin href="/ui.css" />
```

### Root cause

**Figma's plugin runtime loads `manifest.ui` as a raw HTML string**, injected as the `__html__` global into `figma.showUI(__html__, opts)`. This string is rendered in a sandboxed iframe. The sandbox iframe has **no origin server** — it runs in a `data:` URL context where fetch/XHR against relative paths is not possible.

When the iframe tried to parse `<script type="module" src="/ui.js">`, the module loader attempted to fetch `/ui.js` from origin `null` (data: URL context), which fails immediately. Figma's host-side code wraps this iframe load failure and surfaces it as `"Syntax error on line 1: Unexpected token {"` — the `{` is the first character of the JS file content that the runtime incorrectly attempted to evaluate as HTML or vice versa. The error message is misleading; the actual problem is a failed external resource fetch.

---

## Fix

Replace Vite's multi-file output with a single self-contained HTML file using `vite-plugin-singlefile`.

**Changes:**

1. `plugins/welder-editor/package.json` — add `"vite-plugin-singlefile": "^2.3.3"` to `devDependencies`.
2. `plugins/welder-editor/vite.config.ts` — add `viteSingleFile()` plugin; add `assetsInlineLimit: Infinity` and `cssCodeSplit: false` to build config.
3. `plugins/welder-editor/manifest.json` — `"ui"` stays as `"dist/ui/index.html"` (the single-file output lands there via Vite's named-entry behavior); add `"menu"` entry as belt-and-suspenders fix for hypothesis 1.

**Result:** `dist/ui/index.html` is now 144 KB raw / 49.7 KB gzip, fully self-contained. `<script type="module" crossorigin>` with all JS inlined. No external `src=` or `href=` references. The iframe needs no server to render the plugin UI.

---

## Verification

```
# After fix build:
grep -cE "^(import|export)" dist/code.js   # → 0
node --check dist/code.js                  # → passes
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8'))" # → passes
python3 tools/validate_manifest.py manifest.json  # → ✓
# Check no external script/link refs in ui:
grep 'src=' dist/ui/index.html              # → (empty)
grep '<link' dist/ui/index.html             # → (empty)
pnpm typecheck                             # → clean
pnpm test                                  # → 164/164 pass
```

---

## Rule going forward

**Every Figma plugin UI build must produce a single self-contained HTML file.** Figma's `manifest.ui` file is loaded as a raw HTML string with no server. Any external `<script src=>`, `<link href=>`, or dynamic `import()` that references a path outside the HTML will silently fail.

Use `vite-plugin-singlefile` (or equivalent post-build inlining) for every plugin in this monorepo. Add to the scaffolding template (`plugins/_template/vite.config.ts`) so new plugins don't repeat this mistake.

**The external build's chunked-text-loader approach** (embedding ui.html as JS string literals inside code.js) is an alternative but adds unnecessary complexity — the `__html__` global approach via `manifest.ui` is cleaner. The chunked approach was a workaround for a Figma sandbox parser limit on large string literals; with the single-file approach and Figma's own `__html__` injection, that limit is not relevant.

---

## Action items

- [ ] Update `plugins/_template/vite.config.ts` to include `vite-plugin-singlefile` by default (ui-engineer + figma-api-engineer, before next plugin scaffold)
- [ ] Add a CI check that verifies `dist/ui/index.html` (or whatever the manifest `ui` points to) contains no external `src=` references — catches this regression class in every future build
- [ ] Document in `plugins/<slug>/docs/api-spec/` template: "UI build must produce a single self-contained HTML file (no external script/link references)"
