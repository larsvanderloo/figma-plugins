# Welder Editor — Frontend Rewire Research (v0.1.x → v0.2.0)

**Author:** project-pm
**Date:** 2026-05-06
**Status:** Research deliverable, awaiting user direction
**Plugin:** `welder-editor`
**Reference build (gold standard):** `/Users/lars/Documents/Claude/Figma_plugin/plugins/welder-slide-editor` v0.2.1

---

## §1. Problem statement

The v0.1.0 rebuild abandoned the canonical "Vue 3 + Nuxt UI v4" stack mid-Sprint-2 based on a misdiagnosis (`BDEV-2893905622`) and never recovered. The plugin currently:

- Lists `@nuxt/ui@^4.0.0` as a workspace dep in 8 packages
- Registers `@nuxt/ui/vite` in the plugin's `vite.config.ts`
- Defines a full Welder theme in `app.config.ts` (Welder Oranje primary, compact density)

…but renders **zero `<U...>` Nuxt UI components** because the runtime install (steps 3–6 of the official Nuxt UI Vue install) was never completed. Sections went native HTML to keep section-level vitest tests green; the dead `@nuxt/ui` dep + dead theme shipped on every release since.

The user's call: **"set up a solid professional frontend with fully integrated nuxt and nuxtui. The UX needs to be smooth and really bulletproof."**

This document is the research deliverable required before implementation starts.

---

## §2. Audit findings

### v0.2.1 (gold standard) actually uses Nuxt UI v4

130 `<U...>` component instances across 20 distinct components in `widget-src/ui/`:

| Nuxt UI Component | v0.2.1 uses | What it's for                                                                                                                                 |
| ----------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `<UButton>`       | 24          | Primary/ghost/subtle CTAs, icon-only actions, accent-word chips                                                                               |
| `<UFormField>`    | 23          | Label + input + error/hint wrapper around every field                                                                                         |
| `<UInput>`        | 15          | Single-line text inputs                                                                                                                       |
| `<USkeleton>`     | 14          | Loading state for init + slide-load                                                                                                           |
| `<UIcon>`         | 11          | All Lucide iconography (offline registered via `@iconify/vue`)                                                                                |
| `<UAlert>`        | 6           | Empty states, error toasts inline                                                                                                             |
| `<USwitch>`       | 5           | Boolean toggles (column header on/off, etc.)                                                                                                  |
| `<USelect>`       | 5           | Slide picker dropdown, simple selects                                                                                                         |
| `<UTextarea>`     | 4           | Multi-line inputs (paragraph, CSV paste)                                                                                                      |
| `<USelectMenu>`   | 4           | Searchable dropdowns (icon picker)                                                                                                            |
| `<UTabs>`         | 3           | Sub-section tabs within editors                                                                                                               |
| `<UInputNumber>`  | 3           | Numeric inputs (start%, end%, row count)                                                                                                      |
| `<UBadge>`        | 3           | Visual chips                                                                                                                                  |
| `<UCheckbox>`     | 2           | Multi-select toggles                                                                                                                          |
| `<UTable>`        | 1           | (Reserved for v0.2.x charts)                                                                                                                  |
| `<USlider>`       | 1           | Range pickers                                                                                                                                 |
| `<UPopover>`      | 1           | Contextual menus                                                                                                                              |
| `<UFileUpload>`   | 1           | Image upload UX                                                                                                                               |
| `<UCollapsible>`  | 1           | Section accordions (using their `lazy` + `unmountOnHide` props to avoid the Reka T42.21 sync-measurement issue our PR #16 hand-rolled around) |
| `<UApp>`          | 1           | Root theme + portal context (REQUIRED for Toast/Popover)                                                                                      |

**v0.2.1 has the full 6-step Nuxt UI Vue install.** Nuxt UI v4 works in plain Vite.

### Current v0.1.0 state

- 5 of 6 install steps **missing** (only deps + Vite plugin done; runtime registration, CSS import, `<UApp>` wrap, `isolate` class never added)
- 8 sections under `sections/` use **native HTML** for all primitives
- 3 components under `components/src/` (`InputField`, `FormGroup`, `StatusMessage`) are **hand-rolled** with their own scoped CSS; do not consume Nuxt UI tokens
- App.vue is hand-rolled native HTML
- `app.config.ts` Welder theme is **dead code** (no consumer)

### Bundle benchmark

| Build                     | `code.js` raw | `ui.html` raw | `ui.html` gzip |
| ------------------------- | ------------- | ------------- | -------------- |
| **v0.2.1** (full Nuxt UI) | 1.7 MB        | 1.5 MB        | ~280 KB est.   |
| **v0.1.0 current**        | 40 KB         | 234 KB        | 70 KB          |

Going to full Nuxt UI v4 will **roughly 4× the ui bundle gzip** (70 KB → ~280 KB). ADR-0003's 250 KB ui-side gzip budget will need a delta-ADR to ~300 KB. The trade is worth it: brand identity + accessible primitives + a11y by default + ~130 fewer hand-rolled UI bits to maintain.

---

## §3. Architectural decisions (locked by external constraints)

| Decision             | Choice                                                             | Reason                                                                                                                                                                                       |
| -------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UI primitive library | **Nuxt UI v4**                                                     | User mandate ("(see mcp)") + v0.2.1 standard                                                                                                                                                 |
| CSS framework        | **Tailwind CSS v4**                                                | Required by Nuxt UI v4; v0.2.1 uses v4.2.4                                                                                                                                                   |
| Icons                | **`@iconify/vue` + `@iconify-json/lucide`** (offline registration) | Figma plugin manifest declares `networkAccess: ["none"]`; runtime API fetch (api.iconify.design) is CSP-blocked. v0.2.1 registers full Lucide compile-time via `addCollection(lucideIcons)`. |
| State                | **Pinia + pinia-plugin-persistedstate**                            | Existing; ADR-0010                                                                                                                                                                           |
| Build                | **Vite + `vite-plugin-singlefile`**                                | Required: Figma plugin iframe runs `__html__` as a self-contained string; cannot fetch external `<script src>` (root cause of the load-failure hotfix #33)                                   |
| Bundler target       | **`es2020`**                                                       | iframe is Chromium; sandbox-side restriction (es2017) only applies to code.js, not ui.html                                                                                                   |
| Color mode           | **Forced light** (`colorMode: false` in `@nuxt/ui/vite`)           | Welder branding always light; Figma's prefers-color-scheme should not flip the iframe                                                                                                        |
| Primary palette      | **`orange`** mapped to Welder Oranje                               | Nuxt UI v4 takes Tailwind palette names; `orange-500` = `#ff7700` (Welder Oranje exactly)                                                                                                    |

---

## §4. Framework / library comparison (research)

### §4.1 UI primitive library

| Option                        | Bundle  | DX                   | Brand fit                | A11y                   | Verdict                                                |
| ----------------------------- | ------- | -------------------- | ------------------------ | ---------------------- | ------------------------------------------------------ |
| **Nuxt UI v4** (Reka-wrapped) | medium  | excellent            | excellent (theme-driven) | WCAG 2.1 AA by default | ✅ **PICK** — locked by user mandate + v0.2.1 standard |
| Reka UI directly              | smaller | medium (more wiring) | requires hand styling    | high                   | reject — would re-do what Nuxt UI already does         |
| HeadlessUI                    | smaller | medium               | requires hand styling    | high                   | reject — Vue port is unmaintained                      |
| PrimeVue                      | larger  | mature               | not Tailwind-native      | high                   | reject — wrong CSS architecture                        |
| Naive UI                      | medium  | good                 | not Tailwind-native      | high                   | reject — incompatible with theme strategy              |

### §4.2 Form validation

| Option                                                 | Verdict                                                                                                                                      |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Native HTML5 + Nuxt UI's `<UFormField>` error slot** | ✅ **PICK** — sufficient for v0.2.0; UFormField already wraps inputs with label + error + hint slots; no extra dep                           |
| `vee-validate` + Zod                                   | defer — adds 15-20 KB; warranted only if cross-field validation grows complex; Zod already in repo for `csv-schema.ts` so future fit is good |
| FormKit                                                | reject — full framework, overlaps with UFormField; bundle cost too high for v0.2.0                                                           |
| Vorms                                                  | reject — Vue-only formik clone; less mature                                                                                                  |

### §4.3 Image cropper

| Option                                   | Bundle                   | Verdict                                                                                                |
| ---------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------ |
| **`vue-picture-cropper`** + `cropperjs`  | ~25 KB gzip              | ✅ **PICK** — v0.2.1 uses; battle-tested; image fill matches Figma's expected ImagePaint shape exactly |
| Hand-rolled canvas-API cropper (current) | ~3 KB gzip               | reject — works but lacks polish (touch gestures, zoom, aspect locks)                                   |
| `react-image-crop` ports                 | reject — wrong ecosystem |

### §4.4 Icons (offline-mandatory)

| Option                                                                     | Verdict                                                                                                                      |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **`@iconify/vue` + `@iconify-json/lucide`** + `addCollection(lucideIcons)` | ✅ **PICK** — full Lucide registered compile-time; no network; UIcon `name="i-lucide-foo"` resolves locally; v0.2.1 standard |
| Hand-curated icon subset (current Sprint 2)                                | reject — labor; missing icons surface as bugs                                                                                |
| Lucide-vue-next                                                            | possible alternative — but Iconify lets us add other icon sets later (Tabler, Material, etc.) without changing primitives    |

### §4.5 Motion / transitions

| Option                                                | Verdict                                           |
| ----------------------------------------------------- | ------------------------------------------------- |
| **Nuxt UI built-in transitions** + Vue `<Transition>` | ✅ **PICK** — sufficient; no extra dep            |
| `motion-vue` (Framer Motion port)                     | reject — overengineering for v0.2.0               |
| Custom CSS keyframes                                  | reject — diverges from Nuxt UI primitive defaults |

### §4.6 Tabs vs stacked panels (UX call)

v0.2.1 went **stacked panels** (no tabs). They render General → Content → Graphs vertically, one card per section, scroll. v0.1.0 has tabs.

| Pattern                                 | Pros                                                                                                                          | Cons                                                                                                                                                                         |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Stacked panels** (v0.2.1 / recommend) | Less context-switching in 320–450 px iframe; everything reachable; no hide-empty-tab logic; scroll-position memory just works | Long page; user must scroll past General to reach Content                                                                                                                    |
| Tabs (current)                          | Fits each tab to viewport; "tab" mental model familiar from Figma's own panels                                                | Tab state is ephemeral (survives slide-switch within plugin session but not plugin reload); hide-empty rule adds complexity; users can MISS a tab they didn't know was there |

✅ **PICK: stacked panels.** Matches v0.2.1; the empirical evidence is they shipped that way and it tested well. Drop the TabStrip section from `sections/`.

### §4.7 Loading states (UX bulletproofing)

v0.2.1 uses **`<USkeleton>` 14 times** during init and slide-load. The pattern: render the FULL chrome with skeleton placeholders for all variable content; swap to real content when the bridge `init` and `slide-loaded` resolve. This is "bulletproof" UX — the user never sees a blank screen, never sees content jump, and never has to wait without a visual signal.

✅ **PICK: USkeleton extensively.** Skeletons for: init phase, slide-load phase, in-flight optimistic edits (subtle pulse on edited field).

### §4.8 Dev tooling — the dev-mock-bridge

v0.2.1's `main.ts` includes an `import.meta.env.DEV`-guarded mock bridge (lines 28–49) that auto-dispatches synthetic `init` + `slide-loaded` MessageEvents on Vite dev startup. This means `pnpm dev:ui` opens a fully-populated plugin in the browser, no Figma needed.

✅ **PICK: bake the dev-mock-bridge into our `ui/main.ts`.** Same pattern, same cost (~30 lines). Replaces my hacky localStorage-poke approach. Section-level `pnpm dev` for faster UX iteration.

---

## §5. Component-level mapping (current → target)

| Current section / file                                           | Target Nuxt UI primitive                                                                                                    |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `sections/SlidePicker/` (native `<select>`)                      | `<USelect>` or `<USelectMenu>` (the latter for searchable when slides > 20)                                                 |
| `sections/TabStrip/` (custom button strip)                       | **DROP entirely** — stacked panels per §4.6                                                                                 |
| `sections/PropertyPanel/` (custom CSS-grid collapsible)          | `<UCollapsible>` with `lazy` + `unmountOnHide` props (test for T42.21 first; fall back to current custom if Reka regresses) |
| `sections/TitleDescriptionEditor/` (`<input>` + `<textarea>`)    | `<UFormField>` wrapping `<UInput>` + `<UTextarea>`                                                                          |
| `sections/BadgeEditor/` (`<input>` + custom icon grid)           | `<UFormField>` + `<UInput>` + IconPicker (Nuxt UI primitives)                                                               |
| `sections/IconPicker/` (custom search + grid)                    | `<USelectMenu>` with searchable + grid render OR custom built on `<UInput>` + `<UButton>` grid                              |
| `sections/ImageEditor/` (custom canvas cropper + buttons)        | `<UFileUpload>` + `vue-picture-cropper` + `<UButton>`                                                                       |
| `sections/CardList/` (native `<ol>` + `<li>`)                    | `<UButton>`-clickable card rows OR keep native + `<UButton>` for actions                                                    |
| `sections/CardEditor/` (composes TDE + IconPicker + ImageEditor) | composes the migrated children, no change to architecture                                                                   |
| `sections/TimelineEditor/` (native `<ol>` + InputField)          | composes TDE for each item                                                                                                  |
| `sections/TableEditor/` (native cells + custom toggle groups)    | `<UFormField>` + `<UInput>` cell grid + `<UButton variant="solid                                                            | subtle">`for sm/md/lg +`<USwitch>`for column header +`<UInputNumber>`for row/col counts +`<UTextarea>` for CSV paste |
| `sections/JourneyEditor/` (native InputField + number inputs)    | `<UFormField>` + `<UInput>` + `<UInputNumber>` for start/end % per item; `<USlider>` for visual range OR keep dual numeric  |
| `components/src/InputField`                                      | **DROP** — replaced by `<UFormField>` + `<UInput>`/`<UTextarea>`                                                            |
| `components/src/FormGroup`                                       | **DROP** — replaced by `<UFormField>`                                                                                       |
| `components/src/StatusMessage`                                   | **DROP or KEEP as thin wrapper** around `<UAlert>` if we need a project-specific shorthand                                  |
| `components/src/tokens/` (CSS custom props)                      | **DROP** — Nuxt UI provides tokens via Tailwind theme + CSS vars (`--ui-radius`, `bg-default`, `text-default` etc.)         |

**Net section count after rewire:** 11 sections (down from 12 — TabStrip dropped). 0 components in `components/src/` if all primitives map to Nuxt UI directly; 1 if `StatusMessage` stays as a wrapper.

---

## §6. Implementation plan — Sprint 5 (v0.2.0 rewire epic)

Two-week sprint, 5 waves. Total estimate: **35–45 story points**.

### Wave 1 — Foundation (Day 1–2, ~8 pts)

**Owner:** ui-engineer, with figma-api-engineer pair on Vite config.

- [ ] Bump `@nuxt/ui` to `^4.6.x` (latest stable matching v0.2.1)
- [ ] Add `@iconify/vue`, `@iconify-json/lucide`, `tailwindcss@^4`, `vue-picture-cropper`, `cropperjs` deps
- [ ] Drop the dead `app.config.ts` style; rewrite as v0.2.1's `vite.config.ts` inline `ui({ ui: { colors: ... }})` config + `colorMode: false`
- [ ] Create `plugins/welder-editor/ui/main.css` with `@import "tailwindcss"; @import "@nuxt/ui";` + `@theme { --font-sans: 'Inter' }`
- [ ] Update `plugins/welder-editor/ui/main.ts`: `app.use(ui)` from `@nuxt/ui/vue-plugin`, `addCollection(lucideIcons)`, dev-mock-bridge block guarded by `import.meta.env.DEV`
- [ ] Update `plugins/welder-editor/ui/index.html`: add `class="isolate"` on `<div id="app">`
- [ ] Verify build: single-file ui.html still produces; bundle size measured
- [ ] File **ADR-0013** documenting the recovery, the BDEV-2893905622 misdiagnosis lesson, and the canonical Nuxt UI Vue install for the monorepo
- [ ] File **ADR-0014** revising ADR-0003's ui-side bundle budget (250 KB → 320 KB gzip; cite v0.2.1 280 KB benchmark)
- [ ] Update `tools/validate_manifest.py` to also validate the build artifacts (close A1 from Sprint 3 retro)

**Exit criteria:** `pnpm dev:ui` opens a populated plugin in the browser via the dev mock bridge; production build emits a single-file ui.html within revised budget; vue-tsc + lint clean.

### Wave 2 — App.vue chrome rewrite (Day 3–4, ~6 pts)

**Owner:** ui-engineer.

- [ ] Wrap App.vue root in `<UApp>`
- [ ] Replace TabStrip with stacked panels: header card (logo + intro + slide selector + skip toggle) → General card → Content card → Graphs card
- [ ] Skeleton state for `initializing` (until init arrives)
- [ ] Skeleton state for `loadingSlide` (during slide-load)
- [ ] Empty state when `noSlide` (no slide picked)
- [ ] Empty state when `allEmpty` (slide has no editable wrappers)
- [ ] Per-card "section absent" empty states (e.g. "this slide has no CardWrap")

**Exit criteria:** Chrome looks like v0.2.1 (orange brand, Inter font, card-based layout); axe-clean; bundle size still under revised budget.

### Wave 3 — Section migration (Day 5–9, ~15 pts)

**Owner:** ui-engineer, parallel agents per section.

Sections migrated **in dependency order** (leaves first, composers last):

1. SlidePicker → `<USelect>` (1 pt)
2. TitleDescriptionEditor → `<UFormField>` + `<UInput>` + `<UTextarea>` (2 pts)
3. BadgeEditor → `<UFormField>` + `<UInput>` + IconPicker (1 pt)
4. IconPicker → `<USelectMenu>` (search + grid render) (3 pts)
5. ImageEditor → `<UFileUpload>` + `vue-picture-cropper` (3 pts)
6. CardList → list of card rows + `<UButton>` (1 pt)
7. CardEditor → composes 2+3+4+5 (1 pt; recompose only)
8. TimelineEditor → list of TDEs (1 pt)
9. TableEditor → toggle buttons + `<UInput>` cells + `<USwitch>` + `<UInputNumber>` + `<UTextarea>` CSV (3 pts)
10. JourneyEditor → `<UFormField>` + `<UInput>` + `<UInputNumber>` per item (2 pts)
11. PropertyPanel → keep custom collapsible OR migrate to `<UCollapsible>` with T42.21 perf gate (decision in Wave 1; 1 pt)
12. **DROP** `components/src/InputField`, `FormGroup`, possibly `StatusMessage`; remove from consuming sections

Each section migration:

- Same props/emits contract preserved (App.vue wiring unchanged)
- Vitest tests updated to query Nuxt UI structure (role + accessible-name patterns still work)
- axe-clean across all states
- Section-level `vite.config.ts` adds `@nuxt/ui/vite` plugin so vitest sees the same transformation pipeline

### Wave 4 — Bundle + perf re-validation (Day 10, ~3 pts)

**Owner:** plugin-tester.

- [ ] Re-measure bundle vs revised ADR-0014 budget
- [ ] Re-run R1 frame-trace perf gate (TableEditor toggle); investigate if `<UCollapsible>` regresses
- [ ] Re-run R10 golden-snapshot parity (renderers untouched, should pass)
- [ ] Full `pnpm test` against migrated sections — target ≥ 244 tests still green (some may need query updates)

### Wave 5 — Visual regression baseline + RC (Day 11, ~3 pts)

**Owner:** plugin-tester + ui-engineer.

- [ ] Add Playwright (or `@vitest/browser`) for visual regression tests on the 12 demo states from PR #50
- [ ] Capture baseline PNGs under `validation/visual-baselines/welder-editor-2026-W22/`
- [ ] CI gate: visual diff < 1% (configurable threshold)
- [ ] Re-render the demo screenshots from PR #50 with the new UI; commit as the v0.2.0 baseline
- [ ] Update Sprint 4 RC manual gauntlet (PR #49) to reference the new UI states

### Wave 6 — Sprint 5 retro + ADR consolidation (Day 11, ~1 pt)

**Owner:** project-pm.

- [ ] Sprint 5 retro doc at `docs/sprint-retros/welder-editor-2026-W23-W24-sprint-5.md`
- [ ] ADR-0015 if any net-new architecture pattern emerged

---

## §7. Risk register

| #       | Risk                                                                     | Likelihood | Impact                 | Mitigation                                                                                                                                 |
| ------- | ------------------------------------------------------------------------ | ---------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **R11** | Bundle gzip exceeds 320 KB revised budget                                | Medium     | Block release          | ADR-0014 measurement first; if exceeded, lazy-load cropper + use `@iconify-json/lucide` subset instead of full collection (~20 KB savings) |
| **R12** | `<UCollapsible>` reintroduces T42.21 perf regression                     | Medium     | Block Sprint 4 R1 gate | Wave 1 spike: 50-row × 6-col TableEditor with `<UCollapsible>` lazy mount; if > 16ms, keep custom CSS-grid collapsible from PR #16         |
| **R13** | Tailwind v4 breaking changes vs v3 patterns                              | Low        | Slow Wave 1            | Tailwind v4 docs review in Wave 1; v0.2.1 already uses v4 successfully; minimal exposure since we control the entire CSS scope             |
| **R14** | Section vitest setup with `@nuxt/ui/vite` causes test isolation issues   | Medium     | Slow Wave 3            | Spike in Wave 1: get one section's vitest passing with full Nuxt UI install before scaling out                                             |
| **R15** | Visual regression tests are flaky in CI                                  | Medium     | Wave 5 delay           | Use `@vitest/browser` headless mode with deterministic font loading; threshold ≥ 1% diff; per-test snapshots vs full-page                  |
| **R16** | User-facing v0.1.0 ships with the generic look (gap) before v0.2.0 lands | High       | Brand perception       | Decision §8: tag v0.1.0 as is, OR re-cut RC from v0.2.0; recommend latter for tighter user signal                                          |

---

## §8. Sequencing — v0.1.0 vs v0.2.0

Two paths:

### Option α: Tag v0.1.0 as-is, then v0.2.0 rewire epic

- **Pros:** ships now, manual gauntlet PR #49 + #35 can sign off this week
- **Cons:** users see a generic-looking plugin for ~2-3 weeks; first impression matters; Community store reviews calibrate against this version

### Option β: Re-cut v0.1.0 RC from the rewire (v0.1.0 BECOMES v0.2.0 in plan numbering)

- **Pros:** users only ever see the branded UI; first impression matches v0.2.1 quality
- **Cons:** ~2 week delay before v0.1.0 tag; manual gauntlet must be re-run after the rewire

**Recommendation: β.** The brand-identity gap is too significant to ship as-is — it would damage Community-listing perception and require a fast follow-up that splits user attention between two near-identical releases. The rewire IS the v0.1.0; rename the in-flight Sprint 5 to "v0.1.0 RC rewire" and absorb v0.2.0's chart epic into v0.3.0+.

If user picks **α** instead: file the rewire as v0.1.1 (semver MINOR) and run it as the immediate follow-up.

---

## §9. Open decisions for the user

1. **Sequencing α vs β** (§8) — this determines whether v0.1.0 tag is this week or end-of-month
2. **PropertyPanel** keep-custom vs migrate-to-`<UCollapsible>` — depends on Wave 1 spike result
3. **components/src** — drop entirely (preferred) vs keep `StatusMessage` as `<UAlert>` shorthand
4. **Section-level dev:ui scripts** — do we want each section's `pnpm dev` to render in isolation (helpful for component dev) or only the plugin-level `pnpm dev:ui`?
5. **Visual regression baseline tooling** — Playwright vs `@vitest/browser` vs Percy.io; depends on CI cost tolerance (Playwright is free + slow; Percy is paid + fast + reviewable)

---

## §10. Decision log

| Date       | Decision                                                                       | Source        |
| ---------- | ------------------------------------------------------------------------------ | ------------- |
| 2026-05-06 | Audit confirms v0.2.1 uses Nuxt UI v4 in plain Vite                            | This doc §2   |
| 2026-05-06 | BDEV-2893905622 conclusion was wrong — paper-over, not root cause              | This doc §1   |
| 2026-05-06 | Locked stack: Nuxt UI v4 + Tailwind v4 + Iconify offline + vue-picture-cropper | §3 + §4       |
| 2026-05-06 | Tabs → stacked panels per v0.2.1                                               | §4.6          |
| TBD        | α vs β sequencing                                                              | Awaiting user |

---

## §11. Where to ask

- **§9 decisions** → user
- **§5 component-level migration** → ui-engineer
- **§4.4 Iconify offline pattern** → figma-api-engineer (network-access manifest)
- **§7 R11/R12 spike results** → ui-engineer + plugin-tester
- **§8 sequencing** → user + project-pm

---

**Audit traceability:**

- v0.2.1 source: `/Users/lars/Documents/Claude/Figma_plugin/plugins/welder-slide-editor/widget-src/ui/`
- Current source: `plugins/welder-editor/ui/`
- Nuxt UI Vue install docs: https://ui.nuxt.com/docs/getting-started/installation/vue
- Component MCP enumeration: 130 v0.2.1 instances across 20 distinct primitives
