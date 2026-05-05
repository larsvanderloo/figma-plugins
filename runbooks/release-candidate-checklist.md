# Release candidate checklist

Owned by `project-pm`. Run before tagging any release on `main`.

This checklist gates the move from "PR merged" to "tag pushed". Skipping items requires an ADR and explicit acceptance of the risk.

---

## Pre-flight (before opening the release PR)

- [ ] Plugin's `plugin.toml` `version` bumped per SemVer (PATCH / MINOR / MAJOR).
- [ ] Plugin's `CHANGELOG.md` updated with the new version's entry (Keep-a-Changelog format: Added / Changed / Deprecated / Removed / Fixed / Security).
- [ ] Message-bus migration tests added if `MESSAGE_BUS_VERSION` bumped.
- [ ] Persisted-state migration tests added if `clientStorage` or `setPluginData` schema changed.
- [ ] Bundle-size budget in `docs/perf/<plugin>.md` reviewed; if changed, ADR added.
- [ ] Manifest verified: `editorType`, `networkAccess`, `parameters`, `enableProposedApi` all match the api-spec.

## Validation gates

All items below must be green before tag.

- [ ] **Lint**: ESLint + Prettier check pass.
- [ ] **Type-check**: `vue-tsc --noEmit` clean across the plugin and shared workspace packages.
- [ ] **Unit + component tests**: `vitest run` green.
- [ ] **Accessibility**: axe-core scan clean (zero WCAG 2.1 AA violations).
- [ ] **Bundle size**: `code` and `ui` bundles each within budget.
- [ ] **E2E gauntlet** (`runbooks/e2e-gauntlet.md`): all enabled editor types pass on Figma desktop; one editor type verified on Figma web.
- [ ] **Cross-version compatibility**: prior persisted state loads cleanly under the new version (if applicable).
- [ ] **Demo set posted** on the PR (or marked `n/a` if demos are deferred).

## Sign-offs

- [ ] `ui-engineer`: `validation: pass` comment with gauntlet screenshots attached.
- [ ] `figma-api-engineer`: `perf: pass` comment with bundle-size delta and any latency measurements.
- [ ] `figma-api-engineer`: api-surface review if manifest or `figma.*` usage changed.
- [ ] `figma-api-engineer`: contract review if `shared/messages.ts` changed.
- [ ] `release-engineer`: pre-submission review if this release will be submitted to Figma Community.
- [ ] `project-pm` (you): final go.

## Rollback note

- [ ] PR description contains a rollback note: how to undo this release if it breaks main. Format:
  ```
  ## Rollback
  If this release breaks: `git tag -d <tag> && git push origin :refs/tags/<tag>`, delete the draft GitHub release, revert the merge commit on main with `git revert -m 1 <merge-sha>`, retag from prior commit.
  ```

## Tagging

After all sign-offs:

1. Merge the release PR to main.
2. Pull main locally: `git switch main && git pull`.
3. Create signed tag: `git tag -s <plugin>-v<x.y.z> -m "Release <plugin> <x.y.z>"`.
4. Push tag: `git push origin <plugin>-v<x.y.z>`.
5. Verify CI builds the release artifact (zipped `code/dist` + `ui/dist` + `manifest.json`).
6. Verify the GitHub release is created as **draft** with the artifact attached.

## Post-tag

- [ ] Manually promote the GitHub release from draft to published once the artifact is verified.
- [ ] If submitting to Figma Community, hand off to `release-engineer` per `runbooks/audit-pipeline.md` §"Figma Community submission gates".
- [ ] Move the release's Monday item to `Released`.
- [ ] **Monitor for 72 hours**: Figma Community reviews, support inbox, beta channel feedback. If a critical bug surfaces, follow `runbooks/setup.md` §"Rollback procedures" Scenario C.
- [ ] After 72 hours green, mark CHANGELOG entry as stable.

## When validation fails

Any failure on this checklist is blocking. Common scenarios:

- **vue-tsc fails**: route to `figma-api-engineer` (state plumbing) or `figma-api-engineer` (contract drift).
- **vitest fails**: route to whichever code area owns the failing test.
- **axe fails**: route to `ui-engineer`.
- **Bundle over budget**: route to `figma-api-engineer`.
- **E2E gauntlet fails in one editor type only**: route to `figma-api-engineer` + `figma-api-engineer`.
- **Persisted-state migration fails**: route to `figma-api-engineer` (design) + `figma-api-engineer` (impl).

Fix on a new branch, re-run the full checklist (not just the failed item — regressions hide in the items you weren't watching).

## Tag naming

Per-plugin tags, scoped by plugin slug:

```
<plugin-slug>-v<MAJOR>.<MINOR>.<PATCH>[-<prerelease>]
```

Examples:
- `welder-editor-v0.1.0`
- `welder-editor-v1.0.0-rc.1`
- `welder-editor-v1.0.0-beta.2`

Multiple plugins can share `main` and ship independently. Each plugin's `plugin.toml` `version` is the source of truth for its own version; the tag matches it on release.

## ADR if you skip a gate

Skipping any gate above requires an ADR documenting:

- Which gate was skipped.
- Why (timeline / external pressure / known-acceptable risk).
- What mitigation is in place.
- When the gate will be restored / how the skipped check will be retroactively run.

Skipping without an ADR is a self-triggered post-mortem in `learnings/anti-patterns/` per `CLAUDE.md`'s cross-domain protocol.
