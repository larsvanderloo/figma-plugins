# ADR 0005 — Figma library variable strategy

**Status:** Accepted
**Date:** 2026-05-05
**Decision-makers:** ui-engineer (iframe token boundary), figma-api-engineer (canvas mutation boundary)
**References:** ADR-0001; ADR-0008; Plan §"Token strategy"; T28.2 lesson (`.archive/T28-accent-ranges-handoff-2026-04-24.md` §5); `plugins/welder-editor/shared/messages.ts`; `components/src/tokens/index.ts`

---

## Context

The `welder-editor` plugin operates at two distinct rendering surfaces that each require color and styling information:

1. **The canvas** — the Figma document itself. Slide content (headings, paragraphs, table cell text, badge labels, journey pill fills) is styled with Figma library variables from the Slide Machine library (`kAZqxj4nxpafYjB5FhfOru`, published) or from the Templates-Welder work copy (`RgTXIrUpihBauydjMZbUGX`, design reference). These variables carry the Welder brand tokens (`Welder Oranje #ff7700`, `Text Dimmer #ffb266`, `Wit #ffffff`, etc.) and support Figma's variable modes (e.g. `orange-mode` vs `neutral-mode` themes within the library).

2. **The iframe** — the Vue 3 plugin UI running in the iframe context. Panels, buttons, inputs, tabs, badges, and focus rings are styled using Nuxt UI v4's token system, which is configured via the plugin's `app.config.ts` and ultimately surfaces as Tailwind utilities. The iframe has no access to Figma's variable system; it runs in a browser DOM with no `figma.*` API.

The question this ADR answers: where does each category of token live, and who owns each boundary?

---

## Decision

**Canvas-side:** mutations bind Figma library variables via `setBoundVariableForPaint` (after `Variable.resolveForConsumer(node)` for the fallback RGB) or via `node.setBoundVariable` depending on the property. Canvas token values are authoritative from the published Slide Machine library. The plugin does not hardcode canvas color values — it imports and applies library variables. The code-side module responsible for this is `packages/figma-api/src/variables.ts` (Sprint 1), lifted and typed from `widget-src/editors/_shared/accent-vars.ts` in the external build.

**Iframe-side:** the plugin UI uses Nuxt UI v4's token system for all chrome (panels, controls, interactive elements). Token values are defined in `components/src/tokens/index.ts` and surfaced via each plugin's `app.config.ts`. No canvas token values (Welder orange, Text Dimmer, etc.) are imported into or hardcoded in `components/src/tokens/`.

**The boundary is strict and explicit:**

- `components/src/tokens/index.ts` is for **iframe chrome only**. It must not include canvas content tokens (slide fills, text colors, table cell colors, journey pill colors). Those are library variables; the plugin applies them at the canvas level, not at the iframe level.
- `plugins/welder-editor/ui/` must not attempt to set canvas colors from the iframe. All canvas mutations go through the message bus.

---

## Token boundary map

### Iframe chrome tokens (live in `components/src/tokens/index.ts` and `app.config.ts`)

| Token category | Examples | Ownership |
|---|---|---|
| Panel background | `--ui-bg`, sidebar gray | Nuxt UI v4 default + token override |
| Panel border | `--ui-border` | Nuxt UI v4 default |
| Control surface | button fill, hover state, active state | Nuxt UI v4 primitives |
| Focus ring | `outline-offset`, `ring-color` | Nuxt UI v4 default; must not override away |
| Typography in chrome | label font-size, weight | Tailwind utilities (`text-sm`, `font-medium`) |
| Error / warning / info state | toast background, input border-error | Nuxt UI v4 status tokens |
| Light / dark mode switch | the mode itself comes from the message bus `init.editorType`-adjacent host signal | App.vue reactive |

**Not in `components/src/tokens/`:** any color tied to Welder brand identity on the canvas (orange, dimmer, background, blauw subtiel, etc.). Those never touch the iframe token file.

### Canvas content tokens (live as Figma library variables; applied by `packages/figma-api/src/variables.ts`)

| Token category | Figma variable name | Canonical color |
|---|---|---|
| Slide heading text | `Text` | `#fff4ea` (orange-mode) |
| Slide heading accent/dim | `Text Dimmer` | `#ffb266` (orange-mode) |
| Brand fill | `Welder Oranje` | `#ff7700` |
| Brand alt | `Alt` | `#ff9233` |
| Slide background | `Background` | `#fff4ea` |
| Neutral text | `Grijs Basis` | `#71717a` |
| Table cell accent | `Blauw Subtiel` | `#609fff` |
| White / neutral fill | `Wit` | `#ffffff` |

These are **never** defined in `components/src/tokens/index.ts`. They are resolved at runtime from the library.

---

## Canvas side — `setBoundVariableForPaint` write path

### The T28.2 lesson (permanent, applies whenever any canvas color is bound to a library variable)

When calling `setBoundVariableForPaint(paint, field, variable)`, the `paint` argument must include a `color` fallback RGB that matches what the variable currently resolves to in the node's variable mode context.

**Incorrect approach (causes stale rendering):**

```ts
// WRONG: hardcoded fallback does not match the variable's resolved value in the
// current mode → Figma's glyph-cache uses the stale fallback color until the
// user manually switches variable modes.
setBoundVariableForPaint(
  { type: 'SOLID', color: { r: 1, g: 0.957, b: 0.918 } },
  'color',
  variable
)
```

**Correct approach (T28.2 pattern, user-validated):**

```ts
// CORRECT: pre-resolve the fallback from the consumer node's current mode context.
// resolveForConsumer returns the actual current RGB for the variable as it renders
// on this specific node. The fallback matches; no stale-color issue.
const resolvedColor = variable.resolveForConsumer(node)
setBoundVariableForPaint(
  { type: 'SOLID', color: resolvedColor },
  'color',
  variable
)
```

This pattern is canonical for any `setBoundVariableForPaint` call in `packages/figma-api/src/variables.ts`. Any code that calls `setBoundVariableForPaint` without `resolveForConsumer` is a bug — it will cause stale canvas rendering when Figma's glyph cache does not invalidate the fallback color until a mode-switch.

The root cause (per the T28.2 investigation): `setBoundVariableForPaint` caches the provided `color` RGB in Figma's internal glyph renderer until the binding is re-resolved. If the cached RGB differs from the variable's actual resolved value for the current variable mode, the difference is visible as a wrong color. `resolveForConsumer(node)` queries the exact same resolution path that Figma's renderer uses, guaranteeing the fallback matches.

### Additional render-cache flush (belt-and-suspenders, when needed)

T28.2 also demonstrated that after writing bound fills via `setRangeFills`, a visibility toggle (`node.visible = !prev; node.visible = prev`) within the same synchronous handler forces Figma to invalidate the glyph render cache. This was necessary for the accent-ranges write path (which uses `setRangeFills` on sub-ranges of a text node). For simple `node.fills = [paint]` writes, the toggle is typically not needed.

Document in `packages/figma-api/src/variables.ts` which operations require the visibility flush and which do not.

---

## Iframe side — light/dark mode

The iframe must support both light and dark modes. The mode signal comes from the message bus (`init` message payload, inferred from the host editor's current theme). The ui does not use `prefers-color-scheme` directly — it listens for the theme from the code side and applies a class or data attribute to `<html>` or `<body>`.

Nuxt UI v4's dark mode handling works with a `class="dark"` strategy or a `data-theme` attribute. The specific wiring is a Sprint 2 implementation decision; the principle is:

1. Code side detects the editor theme (Figma's UI theme, not the variable mode on the canvas).
2. Code side includes the theme in the `init` message (or a dedicated `theme-changed` message if Figma exposes a theme-change event).
3. `App.vue` sets the appropriate class on `document.documentElement`.
4. Nuxt UI v4 dark-mode variants activate.

> **Project-pm review:** Figma does not currently expose a `figma.editorTheme` API. The external build was light-mode-only. For v0.1.0, light-mode-only is acceptable per the plan ("Light-mode-only matching existing" in Sprint 2). Dark mode is a v0.2.0 scope item and requires `figma-api-engineer` to identify how to detect the host theme (potentially via `figma.clientStorage` color-scheme preference or user settings). This ADR covers the boundary; the implementation decision is deferred.

---

## Why `components/src/tokens/index.ts` stays for iframe chrome only

The `components/src/tokens/index.ts` file is a cross-plugin shared resource. If Welder canvas tokens were added to it, every other plugin in the monorepo would have access to Welder-specific colors — and future plugins would need to either add their own brand tokens (polluting the file) or fork it. The file stays narrowly scoped to iframe-chrome tokens that are semantically meaningful for all plugins (primary blue, spacing scale, compact density).

Plugin-specific theme overrides that affect the iframe chrome (e.g. Welder orange as the `primary` hue in the plugin's `app.config.ts`) are per-plugin configuration, not shared library configuration. A welder-specific `app.config.ts` deriving from `components/src/tokens/index.ts` is the correct composition.

> **Project-pm review:** If the Welder orange (#ff7700) is wanted as the primary action color in the plugin iframe chrome (e.g. orange primary buttons), this should be a `plugins/welder-editor/ui/app.config.ts` override, not a change to `components/src/tokens/`. The shared token file's primary is generic plugin-chrome blue by design. Per the plan: "No re-definition of canvas tokens in `components/src/tokens/index.ts` — that file stays for iframe chrome only." A Sprint 2 decision on whether orange-as-primary is desired in the plugin chrome is in scope; the token file stays unchanged regardless.

---

## Alternatives considered

### Define canvas tokens in `components/src/tokens/index.ts` as a "canvas-token" namespace

Add a `welder.canvas.oranje`, `welder.canvas.textDimmer`, etc. namespace to the shared tokens file. This would allow the iframe to reference the same values without hardcoding hex codes.

Rejected because:
- The iframe never applies canvas tokens to its own chrome; the values are only ever passed to the code side via message-bus payloads. The iframe does not set hex values on canvas nodes — it posts a message and the code side applies library variables.
- Defines canvas colors as a React/Vue rendering concern when they are a Figma variable binding concern. If the Slide Machine library is updated and the orange changes, a shared-tokens file change is not the update path — the library variable update propagates automatically to all canvases.
- Creates a coupling between the shared component library and a specific Figma library's brand identity.

### Maintain a local variable-key registry in `shared/messages.ts`

Define the Figma variable keys (the UUIDs or key strings for `Text`, `Text Dimmer`, etc.) in `shared/messages.ts` so both sides have access.

Partially accepted: `packages/figma-api/src/variables.ts` will maintain the variable key constants used for `importVariableByKeyAsync`. These are code-side constants, not ui-side tokens. The key registry belongs in `packages/figma-api/src/variables.ts`, not in `shared/messages.ts` (which is the message schema, not the implementation). The ui-side has no need for variable keys; it only sends text content and receives result confirmations.

---

## Consequences

**Positive:**

- The boundary is explicit and auditable: a grep for Welder brand hex codes in `components/src/tokens/index.ts` should return zero results. This ADR defines that invariant.
- Canvas token changes (Slide Machine library update) propagate automatically to all user documents without a plugin deployment. The plugin always reads the current library variable value.
- `packages/figma-api/src/variables.ts` is a clean, typed wrapper that encapsulates the `resolveForConsumer` pattern. Future plugins that use Figma library variables import and use the same pattern.
- `components/src/tokens/index.ts` stays general-purpose and reusable across future plugins.

**Negative:**

- Developers who haven't read this ADR may be confused by why Welder orange does not appear anywhere in the shared tokens file. The comment at the top of `components/src/tokens/index.ts` must explicitly state "canvas content tokens are not here — see ADR-0005."
- Library variable binding requires the user to have the Slide Machine library connected. When the library is unavailable, `headingDim` is null, and any other library-variable-bound operation fails gracefully (see `LIBRARY_VAR_MISSING` error code in `messages.ts`). The ui must surface this gracefully.

**Action items:**

1. Add a top-of-file comment to `components/src/tokens/index.ts` stating: "Canvas content tokens (Welder brand colors, slide fills) are NOT defined here — see ADR-0005 and `packages/figma-api/src/variables.ts`."
2. `packages/figma-api/src/variables.ts` (Sprint 1) must document the `resolveForConsumer` pattern from T28.2 and make it the only code path for `setBoundVariableForPaint` calls.
3. Any Sprint 2+ component or section that shows a color picker or color reference for canvas content (e.g. an accent color indicator) must derive the display color from message-bus data (the loaded variable value), not from a hardcoded token.

---

## References

- T28.2 lesson: `.archive/T28-accent-ranges-handoff-2026-04-24.md` §5 — "voor Figma-API `setBoundVariableForPaint` áltijd de fallback via `resolveForConsumer` berekenen"
- `plugins/welder-editor/shared/messages.ts` §WelderErrorCode — `LIBRARY_VAR_MISSING` error case
- `components/src/tokens/index.ts` — iframe chrome tokens (primary blue, spacing scale)
- Plan §"Token strategy" — canonical statement of the iframe vs canvas boundary
- Plan §"Design tokens — the Figma library is authoritative" — brand token list with hex values
- ADR-0008 — accent-range write path deferred; when revisited it must use the `resolveForConsumer` pattern from this ADR
