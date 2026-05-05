# Project: Figma Plugins (design + FigJam + Slides)

This repository follows the canonical structure and workflows defined by the **project-pm** agent. Every agent must read this file before acting and must respect the boundaries below.

The repo houses Plugin-API plugins targeting Figma design, FigJam, and Figma Slides editor types. Widgets are out of scope for now; if that changes, file an ADR.

---

## Hierarchical structure

Every plugin in this organization follows the same composition hierarchy. Do not invent new top-level structure without an ADR.

```
components → sections → plugin (ui + code + shared)
```

- **`components/`** — atomic UI primitives library. Vue 3 Single-File Components built atop Nuxt UI v4, themed for the Figma plugin iframe context (compact density, Figma-native colors, keyboard-driven). Each component is documented, accessible, and reusable across plugins. Shared design tokens live alongside (`components/tokens/`). Owned by `ui-engineer`.
- **`sections/`** — composite reusable views built from components. Picker grids, settings panels, toolbar layouts, message-bus widgets, command palettes, paginated lists. Each section is a self-contained module with its own props contract, tests, and Storybook entry. **Sections are the primary unit of UI reuse and review.** Owned by `ui-engineer`.
- **`plugins/<slug>/`** — a single plugin. Three sides:
  - **`code/`** — the main-thread bundle that runs inside Figma's plugin sandbox (no DOM, no `window`, has access to `figma.*`). Owned by `figma-api-engineer`.
  - **`ui/`** — the iframe Vue 3 application that renders the plugin's interface (full DOM, no `figma.*`). Owned by `ui-engineer`.
  - **`shared/`** — TypeScript types and message-bus schema shared between `code` and `ui`. The contract; owned by `figma-api-engineer`.

Plus: `packages/figma-api/` (typed wrappers around `figma.*`), `validation/` (e2e harnesses, golden snapshots), `tools/`, `docs/`, `.github/`.

The point of this hierarchy is reuse and review at every level. A new plugin doesn't reimplement a settings panel (section), a tag input (component), or a message-bus router (packages/figma-api); it composes them. When the team improves the component-library button, every plugin using it benefits, and every plugin using it must re-validate (vue-tsc + tests + manual e2e).

## Primary host: Figma (web + desktop)

Figma is the team's primary host. Plugins must run in **Figma design, FigJam, and Figma Slides** unless an ADR narrows the scope.

Practical consequences:

- **Manifest `editorType` is `["figma", "figjam", "slides"]`** by default. Per-plugin narrowing requires an ADR.
- **The canonical test environment is Figma desktop on macOS arm64.** Web is the second target. Both must work before tag.
- **`Plugins → Development → Import plugin from manifest`** is part of the validation gate. The plugin must load cleanly and survive a 5-minute smoke session in each enabled editor type before any release tag.
- **Beta program prioritizes power-users on each surface** — design pros, FigJam facilitators, deck designers — recruited per editor type.

## Agent ownership map

| Path | Owner | Authority |
|------|-------|-----------|
| `components/`, `components/tokens/`, `sections/` | `ui-engineer` | Atomic UI primitives, design tokens, composite views — shared across plugins |
| `packages/figma-api/` | `figma-api-engineer` | Typed wrappers around `figma.*`, message-bus router, manifest helpers |
| `plugins/*/code/` | `figma-api-engineer` | Main-thread logic, document mutations, message-bus router |
| `plugins/*/shared/` | `figma-api-engineer` | The contract; do not modify without an ADR or `MESSAGE_BUS_VERSION` bump |
| `plugins/*/ui/` | `ui-engineer` | Iframe Vue app — assembly, styling, accessibility, state plumbing into the message bus |
| `plugins/*/manifest.json` | `figma-api-engineer` | editorType, capabilities, network access, parameters |
| `docs/perf/`, `plugins/*/docs/perf/`, bundle-size budgets | `figma-api-engineer` (code-side) + `ui-engineer` (ui-side) | Per-plugin perf budgets, hot-path review |
| `validation/` (validation suite, e2e gauntlet) | `plugin-tester` | **Veto authority on releases.** Validation suite, e2e gauntlet, accessibility audits |
| `validation/listening-tests/` (usability tests) | `plugin-tester` | Task-based protocols, panel recruitment, statistical analysis |
| `Bugs Queue` board | `plugin-tester` | Triage, severity, owner-agent assignment |
| `validation/submissions/` | `release-engineer` | Figma Community submission packages |
| `tools/demos/`, demo CI, review site | `release-engineer` | Source library, demo tooling, review interface |
| `runbooks/audit-pipeline.md`, External Feedback queue, beta program | `release-engineer` | External feedback pipeline, Community reviews, beta phases, Figma policy correspondence |
| Release tagging, GitHub Releases, signing | `release-engineer` | Tag mechanics, artifact packaging, draft → published promotion |
| `.github/`, `docs/adr/`, `runbooks/` (general) | `project-pm` | Process, branching, sprint cadence, ADRs, release timing (mechanics belong to release-engineer) |
| `plugins/*/docs/product/research/**`, `plugins/*/docs/product/specs/**` (when explicitly asked) | `product-researcher` | Desk research + active-listening synthesis + quarterly external signal review |

When the boundary is unclear, consult `project-pm` before acting.

The 6 agent slots match the **Owner Agent** dropdown labels on the Tasks / Epics / Bugs Queue boards in Monday workspace 6325546. Setting `Owner Agent = <name>` on a Task is equivalent to invoking the corresponding agent's prompt in `.claude/agents/<name>.md`.

## Cross-domain action protocol

Before mutating any file, check the agent ownership map above. If the file falls outside your domain, halt and ask — do not proceed on implicit authorization.

- **In-domain action under an approved item**: proceed. The Monday item's Owner Agent and Acceptance Criteria are the authorization.
- **Cross-domain action**: requires explicit user approval naming the cross-domain change. A soft go-signal ("yes", "go ahead", "set things in motion") authorizes only the in-domain work it followed.
- **Ambiguous boundary**: consult `project-pm`. Do not proceed on assumption.
- **Recovery action that requires cross-domain mutation** (reverting an accidental change, fixing a broken dependency): halt and ask. The fact that a fix is obvious does not make it authorized.

If you cross a domain boundary without authorization, file a self-triggered post-mortem in `learnings/anti-patterns/` (next available `NNNN-<slug>.md`, following the `0001-*` template). The same self-trigger applies in any of:

1. Cross-domain action without authorization.
2. Review-gate skipped — including abbreviating an artifact-gated response under length pressure when the gate ("show all X inline before Y") was explicit.
3. Soft go-signal treated as broad authorization.
4. Challenge protocol bypassed (per `runbooks/decision-discipline.md` §2).

File the post-mortem before continuing other work. Show inline before commit. Open the PR only after user approval.

## Workflow contract

**Order of operations for any new plugin, section, or component:**

1. `figma-api-engineer` writes the brief in `plugins/<slug>/docs/api-spec/<feature>.md` (or `sections/<name>/docs/`) — Figma API surface (selection, document mutation, network access, parameters, ui sizing), manifest constraints (editorType, allowedDomains), and the architecture diagram (`plugins/<slug>/docs/threading/<feature>.md`).
2. `figma-api-engineer` writes the message-bus contract in `plugins/<slug>/shared/messages.ts` — discriminated-union types, `MESSAGE_BUS_VERSION`, latency budgets, error taxonomy, reference flow walkthroughs.
3. `figma-api-engineer` implements the `code/` side — Figma API integration, document mutations, validated message-bus router, persisted-state wrappers, code-side bundle within budget.
4. `ui-engineer` implements the `ui/` side — Vue 3 + Nuxt UI v4 composing `sections/` and `components/`, theming, accessibility (axe-clean), keyboard navigation, vue-tsc strict pass, ui-side bundle within budget.
5. `plugin-tester` runs the full validation suite — vue-tsc, vitest, @testing-library/vue, axe, manual e2e gauntlet in design + FigJam + Slides on Figma desktop, plus one editor type on Figma web — and comments `validation: pass` on the release PR with screenshots attached. The plugin must load cleanly via `Plugins → Development → Import plugin from manifest` in each enabled editor type.
6. `project-pm` schedules the release timing.
7. `release-engineer` cuts the tag, builds the release artifact, promotes the GitHub Release, and runs the Figma Community submission pipeline (when applicable). Ingests external feedback once shipped, routing items back via the Bugs Queue board.

Do not skip steps. Do not let a downstream agent silently fix work owned by an upstream agent. Sections and components are reused across plugins — changes to them must re-validate every dependent plugin.

## Branching and versioning

Trunk-based on `main`. Feature/chore/bugfix/hotfix branches off `main`; PRs target `main`. SemVer. Signed tags on `main` mark releases — see `runbooks/release-candidate-checklist.md` for the tagging discipline and pre-beta gate.

Branch protection on `main` (Pro/free-tier limitations apply). PRs require:
- Linked issue and Monday.com item ID (`Resolves MON-<id>`)
- All CI checks green (lint, vue-tsc, vitest, @testing-library/vue, build, bundle-size budget)
- `ui-engineer` approval for any change under `plugins/*/ui/`, `components/`, or `sections/`
- `figma-api-engineer` approval for any change under `plugins/*/code/`, `plugins/*/shared/`, `packages/figma-api/`, or `plugins/*/manifest.json`
- `plugin-tester` `validation: pass` comment for any release PR
- One reviewer (solo dev with team-of-agents); reviewer-count revisits when the team grows past one human
- Signed commits
- Rollback note in the PR description

## Sprint tracking

Monday.com is the system of record for sprint planning and tracking. GitHub is the system of record for code, validation, and releases. The two are synced by `tools/monday-sync/sync.py`, which runs from `.github/workflows/monday-sync.yml` on the self-hosted macOS arm64 runner (zero GitHub Actions billing). `tools/sync_pr.py` (`sync-pr` console script) is the local fallback when the runner is offline. See `runbooks/monday-workflow.md` for the canonical workspace structure, status workflow, and onboarding playbook. Every commit and PR references its Monday item ID.

The Figma-plugins workspace is **6325546** at `larsvdloo-team.monday.com/`. Each plugin lives in its own folder containing the standard **Scrum Team** template (6 boards: Epics / Sprints / Tasks / Retrospectives / Bugs Queue / Capacity). Sync targets the **Tasks** board's `task_status` and `link` columns.

There is no PR Inbox board. Shared-code PRs without an explicit `Resolves MON-<id>` are not tracked in Monday — file a Task explicitly if the work needs visibility.

## External feedback and audit pipeline

`release-engineer` owns the pipeline for all external signals: Figma Community store reviews and ratings, professional reviews and YouTube tutorials, end-user bug reports, beta feedback, accessibility audits, and any plugin-policy correspondence with Figma. Full details in `runbooks/audit-pipeline.md`.

Key invariants:

- **Every external signal enters the External Feedback queue with provenance.** Even items captured from forum threads or Twitter get a tracked item; bugs land on the Bugs Queue board where `plugin-tester` triages.
- **Subjective feedback is converted to objective tests where possible.** A "this UI feels slow" complaint becomes a render-perf measurement on a representative document. A "this is hard to use" complaint becomes a usability-test protocol.
- **Usability tests follow protocols** (`plugin-tester` runs them) — task-based with success criteria, time-on-task, error rate, SUS or SEQ scores. Anything less is anecdote dressed up as evidence.
- **Submissions are gated.** No Figma Community submission goes out without `plugin-tester`'s `validation: pass` + `release-engineer`'s pre-flight checklist complete.
- **Quarterly external signal review** is mandatory — co-produced by `release-engineer` (data) and `product-researcher` (synthesis). It's how the team's blind spots become known.

## In-between-review demo pipeline

`release-engineer` owns the everyday demo workflow that supports code review and informal walkthroughs — distinct from formal validation and usability tests. Full details in `runbooks/demo-pipeline.md`.

Key invariants:

- **Source files (canonical Figma documents), parameter manifests, and the headless demo tool are the only sanctioned everyday-review demo path.** Personal scratch files and ad-hoc screen recordings are fine for exploration but don't go in PRs.
- **Every demo is reproducible** from its sidecar manifest: plugin commit, parameter set, source file ID, demo-tool version.
- **Demos are posted automatically** (when the tool is wired) as a PR comment within 5 minutes of CI green, linking to a side-by-side review site (before/after gif, screenshots, console traces). Manual demos for the MVP.
- **Demo auto-checks gate the PR.** Console errors, unhandled rejections, network failures during the demo, and bundle-size-budget overruns surface as warnings or fails.
- **Escalation is explicit.** Demo evidence prompts but does not replace `plugin-tester`'s validation suite or usability tests.

## Validation thresholds

- **PATCH releases** must keep all existing flows working — no behavior change beyond the bug fix. Manual e2e gauntlet must pass in design + FigJam + Slides.
- **MINOR releases** can change UI or add features with an ADR justifying it.
- **MAJOR releases** can break message-bus contracts, but migrations must be implemented and tested.

For new plugins, the build must pass (run by `plugin-tester`):
- `vue-tsc --noEmit` clean (zero errors).
- `vitest run` green.
- `@testing-library/vue` component tests green.
- `axe-core` accessibility scan clean on the rendered ui (zero violations at WCAG 2.1 AA).
- Manual e2e gauntlet in `runbooks/e2e-gauntlet.md` passing in each enabled editor type (design + FigJam + Slides) on Figma desktop, then web.

**Bundle-size budget:** every plugin has a documented worst-case bundle size in `docs/perf/<plugin>.md`. Hot-path PRs are gated by `figma-api-engineer` (code-side) and `ui-engineer` (ui-side) running the bundle analyzer and checking against budget at minified-gzipped size.

**Usability test:** required for any UI overhaul, any new top-level surface (toolbar, command, panel), and pre-release qualification of any new plugin. Owned by `plugin-tester`.

## Plugin-thread rules (non-negotiable)

The Figma plugin runtime has two threads with strict separation. Crossing them outside the message bus is a blocking review comment from `figma-api-engineer`.

In `code/` (Figma sandbox, runs `figma.*`):
- No DOM access — no `document`, `window`, `localStorage`, `fetch` against arbitrary URLs (only `allowedDomains` from manifest).
- No long-running synchronous loops over many nodes — batch via `figma.skipInvisibleInstanceChildren = true` and chunked iteration.
- No silent error-eat — every operation returns a typed result through the message bus, success or failure.
- Document mutations grouped under a single user-visible undo step where possible (`figma.commitUndo()` discipline).

In `ui/` (iframe, runs Vue):
- No `figma.*` imports — the iframe has no Figma API surface.
- No direct DOM mutations outside Vue's reactivity (no `document.querySelector` shenanigans).
- All state that depends on Figma comes through the message bus; the ui is a render of message-bus-derived state, not a parallel store.
- Long ops show progress, are cancellable, and don't block first paint.

Across the bus (`shared/messages.ts`):
- Every message has a versioned, typed schema. Breaking schema changes bump the message-bus version and ship a migration.
- Messages are validated at the boundary — both sides reject malformed input rather than crashing.

## Documentation requirements

Every non-obvious decision becomes an ADR in `docs/adr/`. Every plugin ships with:
- Bundle-size and render-perf budget documented in `docs/perf/<plugin>.md`.
- Threading and message-bus model documented in `docs/threading/<plugin>.md`.
- A rollback note in any PR that touches release-critical paths.

Usability test reports archived under `validation/listening-tests/<plugin>/<date>/`. Figma Community submissions archived under `validation/submissions/<plugin>/<date>/`. Quarterly external signal reviews under `docs/external-signal-review/<quarter>.md`.

## Where to ask

- Process / structure / sprint cadence / ADRs → `project-pm`
- Figma Plugin API / manifest / editorType / message-bus contract / code-side TypeScript / document mutations / code-side perf → `figma-api-engineer`
- UI Vue / Nuxt UI v4 / theming / accessibility / design tokens / component library / ui-side perf → `ui-engineer`
- Validation / e2e gauntlet / regressions / accessibility audits / usability tests / Bugs Queue triage / release veto → `plugin-tester`
- Release tagging / GitHub Releases / Figma Community submissions / external feedback / beta program / demo pipeline → `release-engineer`
- User research / desk research / active-listening / quarterly signal review → `product-researcher`

## Starting a new conversation

Two-step heuristic for "I have an idea — who do I talk to?"

**Step 1: name the kind of work.**

| If you're starting... | Talk to first |
|---|---|
| A new plugin | `project-pm` (scaffolds the repo + Monday folder), then `figma-api-engineer` (api-spec brief) |
| A new section or component | `ui-engineer` |
| A new feature on an existing plugin | `project-pm` for scope/sprint, then `figma-api-engineer` (if it touches code/shared) or `ui-engineer` (if ui-only) |
| A bug report from a user | `release-engineer` (intake), then `plugin-tester` (triage on Bugs Queue) |
| A perf concern (bundle size, slow render, large-doc latency) | `figma-api-engineer` (code-side) or `ui-engineer` (ui-side) |
| A Figma API question / manifest / editor-type behavior | `figma-api-engineer` |
| A UI/UX / accessibility / theming / Nuxt UI question | `ui-engineer` |
| A validation / test / e2e gauntlet question | `plugin-tester` |
| A release / Community submission / beta question | `release-engineer` |
| A user-research / signal-review question | `product-researcher` |
| A vague idea you haven't shaped yet | `project-pm` (acts as the front door) |

**Step 2: bring the right artifact.**

- For a new plugin or feature: a short brief — what it is, what problem it solves, what the differentiator is. `project-pm` will turn it into an epic.
- For a bug or perf concern: reproduction details — Figma surface (design/FigJam/slides), platform (desktop/web), document size, repro steps, console output.
- For a UI decision: the existing component library and any prior ADRs.
- For a process question: just ask `project-pm`; they'll route or answer.

If you don't know which agent owns the question, `project-pm` is the default front door. They will route, not refuse.

## Decision discipline

When you and an agent disagree, the agent runs the protocol in `runbooks/decision-discipline.md` rather than capitulating. The short version: **agents don't reverse decisions just because you push back — they ask what evidence has changed.** This is by design. If a `plugin-tester` says "this won't pass accessibility" and you say "it'll be fine," the right response is to investigate together, not to fold.

If you genuinely want a "just do what I say, I'm aware of the tradeoff" override, ask for it explicitly. That's a valid path; silent capitulation is not.

## Cross-plugin learnings

Patterns and decisions accumulate at the org level in `learnings/`. Agents consult this directory at the start of new-plugin or new-feature work and cite the patterns they applied. ADRs that become applicable to other plugins get promoted there. See `runbooks/cross-plugin-learnings.md`.

The team is small. Use it well. The audit trail is the product.

## First plugin

`welder-editor` is the first plugin scheduled for development. Scaffolded under `plugins/welder-editor/` from `plugins/_template/`. Brief and product spec live in `plugins/welder-editor/docs/`. All process invariants in this file apply from day one — including the agent ownership map, validation gates, and Monday sync.
