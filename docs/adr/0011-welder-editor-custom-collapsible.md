# ADR-0011 — Custom CSS-grid-rows collapsible for PropertyPanel

**Status:** Accepted
**Date:** 2026-05-05
**Author:** ui-engineer
**Resolves:** MON-2893854185 (Sprint 2 Task 2.3 — sections/PropertyPanel/)
**Supersedes:** n/a
**Related:** ADR-0010 (UI state architecture), T42.21 (Reka sync-measurement jank root cause)

---

## Context

`sections/PropertyPanel/` is a collapsible section wrapper consumed by
`TitleDescriptionEditor`, `BadgeEditor`, and `ImageEditor` in the Welder editor
plugin. The Sprint 4 `TableEditor` (15–84 cells) is the highest-stakes consumer.

Two candidate implementations were considered:

### Option A — Nuxt UI v4 `UCollapsible` (wraps Reka UI)

`UCollapsible` provides a collapsible primitive maintained by the Nuxt UI team.

**Blocker 1 — build-pipeline dependency.**
Nuxt UI v4 components resolve their own internals through virtual module aliases
(`#build/ui/collapsible`, `#imports`) that are emitted by Nuxt's Vite plugin
(`@nuxt/ui/vite`) during a Nuxt application build. `sections/PropertyPanel/`
runs under a standalone Vite config (no Nuxt app context). Importing UCollapsible
directly produces an unresolvable module error at both vitest run-time and build
time. `TabStrip.vue` (ADR-0010) hit the identical wall for `UTabs` and adopted
the same native-ARIA approach.

**Blocker 2 — sync-measurement jank (T42.21 root cause).**
Reka UI's `<CollapsibleContent>` measures the content height at open time via
`getBoundingClientRect()` to drive a JS-controlled height animation. This call
forces a synchronous browser layout (style + layout recalc) in the same task as
the Vue `v-for` diff. On the Welder `TableEditor` with up to 84 cells, the
combined layout cost produced visible jank during open. This was the root cause
identified in external build T42.21 from `welder-slide-editor`.

### Option B — CSS `grid-template-rows: 0fr → 1fr` (chosen)

The browser-native CSS grid transition eliminates the JS measurement entirely.

**Technique:**

- The body wrapper is a `display: grid` container with a single implicit column.
- `grid-template-rows` transitions between `0fr` (collapsed) and `1fr`
  (expanded).
- The inner content div carries `min-height: 0`, which allows the grid track to
  compress below the div's natural content height during the `0fr` phase.
- `overflow: hidden` on the outer div clips content during the transition.
- No JavaScript reads `offsetHeight`, `scrollHeight`, or `getBoundingClientRect()`
  at any point. Height is resolved by the browser's layout engine during the CSS
  transition frame budget.

**Browser support:**
Chrome 117+, Firefox 109+, Safari 16.4+. The Figma desktop app embeds Chromium
120+ and Figma web targets the same range. All supported targets are covered.

---

## Decision

Build `sections/PropertyPanel/src/PropertyPanel.vue` as a custom Vue SFC using
the CSS `grid-template-rows: 0fr → 1fr` height-transition pattern. Do not
import Nuxt UI or Reka UI components.

---

## ARIA contract

The implementation follows the ARIA Authoring Practices Guide 1.2 — Accordion
pattern with the CSS-transition variant (not the `hidden` attribute variant,
which conflicts with animation):

- **Header (collapsible mode):** `<button>` with `aria-expanded` (boolean) and
  `aria-controls` pointing to the body panel id. `type="button"` to prevent
  accidental form submission.
- **Header (non-collapsible mode):** `<div>` — not interactive, not in the tab
  order.
- **Body panel:** carries a stable `id` matching the button's `aria-controls`.
  Always in the DOM; visual collapse is CSS-only. No `role="region"` — the panel
  is too small to merit a landmark and the APG Accordion pattern does not require
  it.
- **Chevron icon:** `aria-hidden="true"` and `focusable="false"` — purely
  decorative. Open/closed state is conveyed by `aria-expanded` on the button.
- **Keyboard:** native `<button>` activates on Enter and Space without custom
  event handling. Tab exits the toggle into the body content. No host shortcuts
  shadowed.

---

## Perf implication for Sprint 4 TableEditor

`TableEditor` will be placed inside a `PropertyPanel` instance. Because the
body is always in the DOM (CSS-only collapse), Vue's reactivity for table cell
components inside a closed panel is still active — but no renders are triggered
unless the data changes. The CSS `0fr` clip means the cells are not painted or
composited while collapsed.

If Sprint 4 profiling shows excessive idle-reactivity cost for hidden
TableEditor cells, the mitigation is `v-if` on the body slot content gated by
`isOpen` (trading animation for mount/unmount). That change can be made without
altering the public props/emits API of PropertyPanel.

---

## Consequences

- Zero dependency on Reka UI or Nuxt UI build pipeline in the sections package.
- Zero sync-measurement forced layouts during collapsible open (T42.21 closed).
- The component is entirely self-contained; no npm install required beyond Vue 3.
- `prefers-reduced-motion` is respected: the CSS transition is removed; state
  changes remain instantaneous.
- When Nuxt UI v4's Vite plugin is wired to the plugin's standalone Vite config
  (future sprint / ADR pending), `UCollapsible` may be re-evaluated as a
  drop-in if it adds meaningful behaviour. The public API of PropertyPanel
  (props, emits, slots) is designed to be forward-compatible with that swap.
