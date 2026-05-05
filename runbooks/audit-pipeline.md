# Audit pipeline — external feedback intake

Owned by `release-engineer`. Coordinated with `project-pm` on submissions and public communication.

This runbook describes how external signals enter the team's workflow, get routed, become actionable, and close the loop. Full agent role description is in `.claude/agents/release-engineer.md`; this document is the operational playbook.

---

## 1. Intake sources and cadence

| Channel                              | Cadence     | Where it lands                                            |
| ------------------------------------ | ----------- | --------------------------------------------------------- |
| Figma Community plugin reviews       | Daily check | External Feedback board (Monday)                          |
| Figma Community comments on listings | Daily check | External Feedback board                                   |
| Beta program feedback portal         | Daily       | External Feedback board, tagged `source:beta-<phase>`     |
| Support email (`support@<domain>`)   | Daily       | External Feedback board                                   |
| Friends of Figma (Slack / Discord)   | Weekly      | External Feedback board, tagged `source:friends-of-figma` |
| Twitter mentions                     | Weekly      | External Feedback board, tagged `source:twitter`          |
| Reddit r/FigmaDesign                 | Weekly      | External Feedback board, tagged `source:reddit`           |
| Plugin telemetry (opt-in)            | Daily       | Aggregated dashboard, plus item per anomaly               |
| Figma plugin team correspondence     | On contact  | External Feedback board, marked Critical priority         |

Every item is logged within 24h of detection. Source attribution is required: URL or screenshot, author handle (or "anonymous user" with timestamp), context.

## 2. Triage protocol

For each new item:

1. **Categorize** per the taxonomy in `.claude/agents/release-engineer.md` (crash, UX-measurable, UX-subjective, accessibility, editor-type incompat, feature request, documentation, policy, pattern flag).
2. **Set severity** P0–P3 per the same agent doc.
3. **Route** to the responsible agent by setting Owner Agent on the Monday item.
4. **Acknowledge** the reporter within the SLA — even if the fix is weeks out.
5. **Convert to a measurable test** if the claim is subjective but testable (e.g., "feels slow" → measure latency on the same document).

Items that don't match the taxonomy go to `project-pm` for routing.

## 3. Subjective-to-objective conversion

When a report is subjective, the curator's job is to either:

- **Reproduce + measure**: get the document the reporter was using (or a similar one), reproduce the symptom, take measurements. The result is a P1 with measurement attached, or a documented "below threshold" with the measurement attached.
- **Run a usability test**: if the symptom is perceptual and not measurable, design a task-based protocol per `.claude/agents/release-engineer.md` §"Usability test protocols". File results in `validation/listening-tests/<plugin>/<date>/`.
- **Document the disagreement**: if measurement says "fine" but the user's perception persists, add to the quarterly pattern review for cross-tester confirmation.

## 4. SLA targets

| Severity                                   | Acknowledge     | Initial response | Resolution               |
| ------------------------------------------ | --------------- | ---------------- | ------------------------ |
| P0 (crash, data loss, listing-blocking)    | 4h              | 4h               | hotfix tagged within 24h |
| P1 (blocking bug, accessibility violation) | 1 business day  | 1 business day   | next sprint              |
| P2 (regression, unconfirmed perceptual)    | 2 business days | 2 business days  | within 2 sprints         |
| P3 (cosmetic, feature request, docs)       | 5 business days | 5 business days  | sprint backlog           |

Acknowledgments are templated (`runbooks/response-templates.md`) and personalized.

## 5. Response templates and tone

Public-facing responses (Community comments, forum posts, support replies) follow:

- **Acknowledge** the report and the reporter by name (handle, anonymized).
- **State what you'll do** — investigate, fix, or explain why no change.
- **Cite measurements** when refuting subjective claims; don't hand-wave.
- **Set expectations honestly** — if the fix is weeks out, say so.
- **Close the loop** when the fix lands — go back to the original report and reply that it's resolved.

All public responses are reviewed by `project-pm` for tone and content before posting.

Stock acknowledgement (modify per case):

```
Hi <handle>, thanks for the report — that's a real issue. We're investigating and I'll update here once we have a fix queued. (Tracked internally as MON-<id>.)

— <signature>
```

For "we don't agree, here's why":

```
Hi <handle>, thanks for sharing this. We measured what you described — <one-sentence summary of measurement> — and the result is below our perceptual-threshold target. That said, your experience is valid, and if you can share the specific document and steps that triggered it, we'll dig deeper.

— <signature>
```

## 6. Pattern detection

Weekly: scan the External Feedback board for items tagged with similar themes (e.g., 3+ items mentioning "selection lost," 3+ items mentioning a specific editor type). When a cluster crosses the threshold:

- File a `[PATTERN]` item in the External Feedback board summarizing the cluster.
- Assign Owner Agent based on the pattern's domain.
- Route to the next quarterly review for systemic response.

## 7. Quarterly External Signal Review

Once per quarter, produce `docs/external-signal-review/<quarter>.md`:

- All external feedback received that quarter, categorized.
- Pattern clusters and what they suggest.
- Disagreements between internal and external signals; investigation outcomes.
- Proposed validation-suite additions (`ui-engineer`).
- Proposed perf-benchmark additions (`figma-api-engineer`).
- Figma policy changes from the plugin team, if any.
- Beta program health (signal-to-noise, retention).
- Recommendations to leadership.

Recommendations that are accepted become ADRs; rejected ones document reasoning.

## 8. Beta program

Three phases per `runbooks/beta-program.md`:

- **Closed beta** — NDA-bound, ≤ 50 testers, professional designers + facilitators + deck designers (per editor type).
- **Open beta** — invite-only public via Figma Community private listing, ≤ 500 testers.
- **Release candidate** — final pre-publication, anyone who signed up, time-limited.

Each phase has: scope statement, known-issues list, structured feedback form, dedicated channel, bug-report template, clear end date.

Pause the program if signal-to-noise drops below useful (~ 1 actionable item per 5 reports).

## 9. Figma Community submission gates

Before any submission:

- [ ] Validation reports attached (e2e gauntlet, vue-tsc, vitest, axe).
- [ ] Performance reports attached (bundle size, large-doc latency).
- [ ] Usability test reports if applicable.
- [ ] Listing copy (title, description, screenshots, video, "what's new") reviewed by `project-pm`.
- [ ] Accessibility statement complete.
- [ ] Privacy & data disclosure complete.
- [ ] Pricing / entitlements tested if the plugin charges.
- [ ] All P0/P1 reports closed or acknowledged with mitigations.

The submission package is archived under `validation/submissions/<plugin>/<date>/` for audit.

## 10. Plugin-policy correspondence

When Figma's plugin team contacts the team (rejection, deprecation notice, policy clarification):

- Mark the External Feedback item Critical priority regardless of category.
- Loop in `project-pm` immediately.
- Respond within Figma's stated timeline (typically 48h).
- File the correspondence under `validation/submissions/<plugin>/<date>/policy-correspondence/`.

If the issue requires a public statement (e.g., listing taken down), follow the rollback runbook in `project-pm`'s spec and post a transparent update on Community + the plugin's listing changelog.
