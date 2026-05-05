# ADR 0008 — welder-editor: accent ranges deferred to backlog; Route A pre-approved

**Status:** Accepted
**Date:** 2026-05-05
**Decision-makers:** Lars (user decision 2026-05-05), project-pm, ui-engineer
**References:** T28 handoff archive (`.archive/T28-accent-ranges-handoff-2026-04-24.md`); ADR-0001; ADR-0005; `plugins/welder-editor/shared/messages.ts` §TitleDescriptionSection

---

## Context

The `welder-slide-editor` v0.2.1 external build included an accent-ranges feature (T28) that allows users to per-word toggle heading text between the Welder "Text" and "Text Dimmer" library variables — creating emphasis by dimming non-focus words in a slide heading.

The feature went through a complete implementation cycle in the external build: read-flow (scan `getStyledTextSegments(['fills'])`), write-flow (`applyAccentRanges` via `setBoundVariableForPaint` + `setRangeFills`), and UI (an `AccentRangePopover.vue` chip grid). After three significant fix iterations (T28, T28.1, T28.2) the feature was technically working and user-validated.

It was then **reverted** (commit referenced in the T28 handoff archive as "revert(welder-slide-editor): T28 accent-ranges — feature parked") because of an unresolved UX blocker: the Reka UI `<UPopover>` component, when mounted in proximity to a `<UInput>` element inside the same Nuxt UI `<UFormField>` structure, installs a focus-trap or document-level event listener that breaks the keystroke event bubble path to the adjacent input. The input becomes non-responsive.

Four placement variants were attempted (hint slot, label slot, plain sibling div, and a diagnostic full-strip confirming the popover is the culprit). None unblocked the input. The diagnostic strip — completely removing the `AccentRangePopover` import — confirmed that the input immediately became responsive again, isolating the failure to the popover component architecture. Per the T28 handoff archive:

> "Phase 4.5 systematic-debugging: 4+ failed fixes = architectural probleem, niet meer door-mitigeren."

The T28 handoff archive's Section 5 ("Lessons learned") captures two permanent findings that are not reversed by the deferral:

1. `setBoundVariableForPaint` fallback must always be pre-resolved via `Variable.resolveForConsumer(node)`. Using a hardcoded fallback RGB causes stale rendering until the user manually switches the variable mode. The T28.2 fix demonstrated the correct pattern; it is preserved in ADR-0005 and must be applied when accent ranges are revisited.

2. `<UPopover>` + `<UInput>` in the same rendering scope is fragile. No workaround via slot placement was found in the Nuxt UI v4 version current at the time of T28. Future work must either avoid this combination or confirm it is resolved upstream before committing to a popover-bound input pattern.

**Status in `messages.ts`:** `TitleDescriptionSection.headingDim` is defined as `Array<[number, number]> | null` and is explicitly marked read-only in v0.1.0. The code side reads and reports existing dim ranges but does not expose editing controls. The UI hides accent controls in v0.1.0.

---

## Decision

**Accent range editing is deferred to a backlog epic with no scheduled sprint.**

The deferred status is a deliberate product decision, not a temporary workaround. Accent ranges are UX polish on top of the core heading editing flow. The investment-to-value ratio of the feature is acceptable, but not at the cost of a UX regression (non-responsive input) and an architectural blocker that requires upstream resolution.

Specific consequences for v0.1.0:

1. `AccentRangePopover.vue` is **not** ported to the rebuild. No stub, no placeholder.
2. `TitleDescriptionSection.headingDim` is populated by the code side (read-only) so the data is present when the editing controls are added in a future sprint — the data model is already correct.
3. The `ui/` side reads `headingDim` but does not render editing controls. The heading editor is a plain text input.
4. No `update-accent` message type exists in `messages.ts` v0.1.0. Adding it requires a `MESSAGE_BUS_VERSION` bump and an ADR.

**Route A (inline always-visible badges) is pre-approved as the implementation path when the feature is revisited.**

Route A (per the T28 handoff archive §6): replace the `<UPopover>` trigger entirely with an always-visible row of `<UBadge>` chips beneath the heading input. Each chip represents a word token; subtle/solid state encodes accent on/off. Direct click-to-toggle with no popover, no trigger element, no focus trap. Costs more vertical space in the panel but avoids the Reka focus-trap interference by design.

Route A is pre-approved because it:
- Has no dependency on the Reka focus-trap issue being resolved upstream.
- Uses `<UBadge>` which is a proven Nuxt UI v4 primitive (no new component dependencies).
- Preserves the `applyAccentRanges` write logic from T28.2 (including the `Variable.resolveForConsumer(node)` fallback).
- Is the lowest-complexity path to unblocking the feature.

Routes B, C, and D from the T28 archive (Figma native modal, upstream Reka PR, Figma API evolution) remain available but are not pre-approved. Any of them would require a new ADR at the sprint where the feature is picked up.

---

## Unblocking conditions

All three conditions must be met before the accent ranges epic is scheduled:

**(a) Reka focus-trap issue resolved OR Route A confirmed achievable.**

Either: confirm that a newer version of Reka UI / Nuxt UI v4 has resolved the `<UPopover>` + `<UInput>` focus-trap interference (validate by attempting the exact placement pattern from T28 in the current Nuxt UI version at sprint kickoff); OR confirm that Route A is buildable with `<UBadge>` in the Nuxt UI v4 version current at that sprint. Route A does not require Reka resolution, so at minimum Route A is always achievable.

**(b) `Variable.resolveForConsumer(node)` fallback pre-resolved lesson preserved.**

The sprint brief for accent ranges must cite ADR-0005 §"Canvas side — `setBoundVariableForPaint` write path" and the T28.2 lesson explicitly. The implementation must use `Variable.resolveForConsumer(node)` for the fallback RGB before calling `setBoundVariableForPaint`. This is a hard requirement, not a nice-to-have — the stale-render bug from T28 before T28.2 is a data-loss-adjacent UX failure.

**(c) `headingDim` read-only mode validated clean.**

Before adding writing controls, validate that the current read-only `headingDim` data reaching the ui in `slide-load:result` is correct (non-empty arrays match what is visible on the canvas, null correctly reflects unreachable library). This validation is a Sprint 1/2 concern, not a gating condition for the backlog epic, but the result should be documented.

---

## Alternatives considered

### Implement Route A now in Sprint 2 alongside the TitleDescriptionEditor section

Route A has no Reka dependency and could be shipped in Sprint 2 as part of `sections/TitleDescriptionEditor/`.

Rejected for v0.1.0 because:
- Sprint 2 scope already includes completing the dormant T10 image panel and establishing `@testing-library/vue` patterns across all General tab sections. Adding accent ranges increases Sprint 2 scope.
- The feature has deferred status per user decision (2026-05-05). Re-introducing it in Sprint 2 without a new explicit user decision re-opens a decided question.
- The `headingDim` data model is read-only in v0.1.0 by design; adding writing controls mid-sprint would require a `MESSAGE_BUS_VERSION` bump and a coordinated `figma-api-engineer` change to the code side.

If the user explicitly re-opens the decision before Sprint 2 kickoff, Route A in Sprint 2 is technically feasible.

### Keep AccentRangePopover as a non-functional stub with a "coming soon" affordance

Ship the heading editor with a disabled chip-row or a grayed-out "Accent" button that does nothing.

Rejected because:
- "Coming soon" affordances in production UIs create user frustration and support load.
- The heading editor works cleanly without accent controls; the absence is not a regression.
- Stub affordances must be maintained (axe scans, keyboard nav) even when non-functional.

---

## Consequences

**Positive:**

- Sprint 2 TitleDescriptionEditor section ships without the UX regression and architectural risk of T28.
- The heading editor is clean, focused, and accessible without any partially-functional affordances.
- The `headingDim` data model is already correct in `messages.ts`; adding writing controls later does not require a structural schema change — only a `MESSAGE_BUS_VERSION` bump and a new message type.
- The T28.2 Variable-resolve lesson is preserved in ADR-0005 and will be applied correctly when the feature returns.

**Negative:**

- Users who rely on accent ranges in their Welder slides cannot edit them via the plugin in v0.1.0. They must use Figma's native text-color tools.
- The `headingDim` field in `TitleDescriptionSection` carries data (read from canvas) but exposes no editing surface — this asymmetry is surprising if a developer reads the schema without this ADR.

**Mitigation:**

The ui-engineer writes a brief inline comment in `TitleDescriptionEditor.vue` (Sprint 2) noting that `headingDim` is read-only in v0.1.0 per this ADR, with the ADR number. This prevents future confusion when the editing controls are added.

---

## References

- T28 handoff archive: `.archive/T28-accent-ranges-handoff-2026-04-24.md` — full chronology, root-cause analysis, lesson preservation, and Route A recommendation
- `plugins/welder-editor/shared/messages.ts` — `TitleDescriptionSection.headingDim` read-only annotation
- ADR-0005 — Figma library variable strategy; preserves `Variable.resolveForConsumer(node)` lesson for when accent ranges are revisited
- Plan §"Carry-forward backlog item 6" — accent ranges explicitly deferred to backlog
- Plan §Risk register R9 — Reka UI focus-trap recurrence as a recurring risk for popover-bound inputs
