<!--
PR description checklist for the figma-plugins monorepo.

The "Resolves MON-{id}" line below is REQUIRED for the Monday sync workflow
to link this PR to the right Tasks board item. Without it, the PR is not
tracked in Monday at all (no PR Inbox board in this monorepo).
-->

## What

<!-- One-paragraph description of the change. -->

## Why

<!-- Link to the underlying problem, decision, or user need. -->

## Resolves

Resolves MON-<!-- replace with the Monday item ID, no leading zeros -->

## Validation

<!-- Tick all that apply. ui-engineer and figma-api-engineer use these checkboxes for sign-off. -->

- [ ] Lint clean (`pnpm lint`)
- [ ] Type-check clean (`pnpm typecheck` / `vue-tsc --noEmit`)
- [ ] Unit + component tests pass (`pnpm test`)
- [ ] Accessibility scan clean (axe, zero WCAG 2.1 AA violations)
- [ ] Bundle size within budget (delete one): within budget / requires re-baselining
- [ ] E2E gauntlet passed in: design / FigJam / slides (delete N/A); web verified for one editor type
- [ ] No dependency / license additions, or new ADR linked

## Editor types touched

<!-- Tick which editor types this change affects. If only one, the e2e gauntlet for the others is not required. -->

- [ ] Figma design
- [ ] FigJam
- [ ] Figma Slides
- [ ] None (shared library / tooling change)

## Notes for review

<!--
Anything reviewers should pay special attention to:
- Message-bus contract changes (link to MESSAGE_BUS_VERSION bump if any)
- Persisted-state migration (clientStorage / setPluginData schema)
- Performance hot-path changes
- New shared component or section that other plugins should know about
- ADR references (link to docs/adr/NNNN-*.md if applicable)
-->

## Rollback

<!-- How to undo this change if it breaks main. -->
