# ADR-0013 — Welder Editor: Nuxt UI v4 Recovery

**Status:** Accepted
**Date:** 2026-05-05
**Author:** figma-api-engineer
**Sprint:** Sprint 5 — Wave 1 Foundation
**Monday item:** MON-2894473085

---

## Context

At Sprint 2, `BDEV-2893905622` diagnosed that Nuxt UI v4 was incompatible with a standalone Vite build in the Figma plugin context. The conclusion was: "Nuxt UI v4 only works inside a Nuxt runtime and cannot be installed in a plain Vite + Vue 3 project." The remediation was to revert all `<U...>` component usage and reimplement sections as native HTML.

As a result:

- `@nuxt/ui@^4.0.0` remained in `package.json` (but unused)
- `@nuxt/ui/vite` remained registered in `vite.config.ts` (but not properly configured)
- `app.config.ts` defined a full Welder theme (but no consumer existed)
- All 8 sections under `sections/` render native HTML
- 3 components under `components/src/` (`InputField`, `FormGroup`, `StatusMessage`) are hand-rolled

The Sprint 5 frontend-rewire research audit (`docs/research/welder-editor-v0.2.0-frontend-rewire.md`, referenced by PR #50 directory) examined the v0.2.1 reference build (`/Users/lars/Documents/Claude/Figma_plugin/plugins/welder-slide-editor`) and found:

- v0.2.1 uses **130 `<U...>` Nuxt UI component instances** across 20 distinct components
- v0.2.1 runs Nuxt UI v4 inside a plain Vite build (no Nuxt runtime)
- v0.2.1 has the complete 6-step Nuxt UI Vue install:
  1. `@nuxt/ui` dep + `@nuxt/ui/vite` Vite plugin — done in v0.1.0 (Sprint 2)
  2. `tailwindcss` dep — done in v0.1.0 (Sprint 2)
  3. `app.use(ui)` from `@nuxt/ui/vue-plugin` in `main.ts` — **never done**
  4. `@import "tailwindcss"; @import "@nuxt/ui";` in `main.css` — **never done**
  5. `<UApp>` wrapping the root in `App.vue` — **never done**
  6. `class="isolate"` on `<div id="app">` in `index.html` — **never done**

**The BDEV-2893905622 diagnosis was wrong.** The "incompatibility" was the absence of steps 3–6. Nuxt UI v4 works in plain Vite. The Sprint 2 team concluded from a partial install failure, not from a complete install attempt.

---

## Decision

Complete the Nuxt UI v4 install in Sprint 5 Wave 1 (foundation) and Wave 2/3 (section migration).

Wave 1 (figma-api-engineer scope — this ADR):

1. Bump `@nuxt/ui` to `^4.6.1` (matching v0.2.1).
2. Add `@iconify/vue`, `@iconify-json/lucide`, `tailwindcss@^4`, `cropperjs`, `vue-picture-cropper` to `package.json`.
3. Rewrite `vite.config.ts` with inline `ui({ colorMode: false, ui: { colors: { primary: 'orange', secondary: 'blue', neutral: 'neutral' } } })` config — matching v0.2.1 exactly.
4. Delete `app.config.ts` — it was dead code; the palette documentation moves inline as comments in `vite.config.ts`.

Wave 1 (ui-engineer scope — separate task 5.1):

5. Update `ui/main.ts`: `app.use(ui)` from `@nuxt/ui/vue-plugin`, `addCollection(lucideIcons)` from `@iconify/vue`, dev-mock-bridge guarded by `import.meta.env.DEV`.
6. Update `ui/main.css`: `@import "tailwindcss"; @import "@nuxt/ui";`.
7. Update `ui/index.html`: add `class="isolate"` on `<div id="app">`.

Wave 2/3 (ui-engineer scope — separate tasks 5.2/5.3):

8. Wrap `App.vue` root in `<UApp>`.
9. Migrate all 8 sections and 3 components from native HTML to Nuxt UI primitives.

### Icon strategy: offline registration

The Figma plugin manifest declares `networkAccess: { allowedDomains: [] }`. The Iconify runtime fetches icons from `api.iconify.design` — this is blocked by CSP in the Figma sandbox. v0.2.1 works around this by pre-registering the full Lucide collection at compile time via `addCollection(lucideIcons)` in `main.ts`. All `<UIcon name="i-lucide-foo">` calls resolve locally; no network request is made. This is the canonical pattern for all icon usage in this plugin.

### Color mode: forced light

`colorMode: false` in the `@nuxt/ui/vite` call disables the color-mode detection entirely. Figma's iframe inherits `prefers-color-scheme` from the host OS, which would flip the plugin UI to dark on dark-mode desktops. Welder branding is always light (ADR-0005); forcing light mode here is the correct enforcement point.

---

## Consequences

**Positive:**

- ~130 hand-rolled UI primitives are replaced by WCAG 2.1 AA-compliant Nuxt UI defaults.
- `components/src/{InputField, FormGroup}` are dropped (replaced by `<UFormField>` + `<UInput>`/`<UTextarea>`).
- `StatusMessage` is dropped (or kept as a thin `<UAlert>` wrapper — decision deferred to ui-engineer on task 5.3).
- `components/src/tokens/` CSS custom props are dropped; Nuxt UI provides the token system via Tailwind theme + CSS vars.
- Brand identity (`orange` primary) is now compiler-enforced rather than dead-config-enforced.

**Negative / trade-offs:**

- ui-side bundle gzip grows from ~70 KB to ~280 KB (v0.2.1 benchmark). ADR-0014 revises the budget.
- The `vite@^5` peer-warning from `@nuxt/devtools-kit` (which requires `vite@>=6`) surfaces during `pnpm install`. This is a transitive peer of `@nuxt/ui@^4.7.x` and does not affect the build; it resolves when `vite` is bumped to `^6` in a future sprint.
- Steps 3–6 are on the ui-engineer side (task 5.1) and are not shipped in this commit; the build will not render `<U...>` components until task 5.1 lands.

---

## Lesson learned

When a "doesn't work in our context" conclusion lands, the next sprint's first action is to verify it against the canonical reference (in this case, v0.2.1). If the reference **does** use the rejected technology, the rejection was wrong — it means the install was incomplete, not that the technology is incompatible.

The correct protocol: before filing a "technology X is incompatible with context Y" issue, reproduce the failure on the canonical reference. If the reference succeeds, diff the install steps.

---

## References

- `docs/research/welder-editor-v0.2.0-frontend-rewire.md` — full audit and plan
- `BDEV-2893905622` — original (wrong) diagnosis
- v0.2.1 reference: `/Users/lars/Documents/Claude/Figma_plugin/plugins/welder-slide-editor`
- Nuxt UI Vue install docs: https://ui.nuxt.com/docs/getting-started/installation/vue
- ADR-0003 — original bundle budget (superseded in part by ADR-0014)
- ADR-0005 — iframe chrome vs canvas content token boundary
- ADR-0014 — bundle budget revision (companion to this ADR)
