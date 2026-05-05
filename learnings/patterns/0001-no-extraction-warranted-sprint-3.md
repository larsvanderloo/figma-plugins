# 0001 — Sprint 3 component-extraction pass: no candidates met the extraction rule

**Status:** active
**Date:** 2026-05-05
**Origin:** general
**Related:** MON-2894009467 (TDEV-061), Sprint 2893968879

## Context

Sprint 3 Task 3.8 was a scheduled "stop and harvest" pass over the codebase after
CardList (PR #26) and CardEditor (PR #29) landed. The task asked ui-engineer to scan
all sections for patterns that recur enough to warrant extraction into
`components/src/`.

The extraction bar (per task spec): a primitive earns extraction only if **at least 2
sections currently use the same pattern AND a 3rd is plausible in Sprint 4**.

Sections surveyed: CardList, CardEditor, SlidePicker, BadgeEditor,
TitleDescriptionEditor, IconPicker, ImageEditor, PropertyPanel, TabStrip.

Existing components already extracted: InputField, FormGroup, StatusMessage.

## Candidates evaluated

### List primitive (`<ul role="listbox">` with icon + text rows)

Current uses: 1 — CardList only.
Sprint 4 plausible use: TimelineEditor and JourneyEditor will have ordered lists,
but their data shapes (timeline steps, journey pills) differ structurally from
CardList's icon-heading-paragraph rows. Forcing a shared primitive on dissimilar
row structures would produce a "flexible" API with so many optional slots it stops
being a primitive and becomes a layout kit. Defer until at least two sections
actually share the identical row contract.

Decision: **defer — 1 current use, Sprint 4 data shapes uncertain**.

### IconLabel (icon + text inline)

Current uses: 1 — CardList item rows (inline within the list item).
It is not a standalone composite; it is just two elements side by side within a
specific list layout. No other section renders a freestanding icon+label unit.

Decision: **defer — 1 current use, not a standalone reuse unit**.

### EmptyState

Current uses as a distinct empty-state UI: 1 — CardList uses
`<StatusMessage variant="status">` as its empty-state signal. All other sections
either show no empty state or use StatusMessage directly (which is already extracted).
A distinct EmptyState component with a richer structure (icon + heading + subtext)
would be premature — no section needs that richer structure yet.

Decision: **defer — StatusMessage already covers the current need; richer
EmptyState has 0 current use sites beyond what StatusMessage handles**.

### StepIndex (numbered step prefix)

Current uses: 0. No section in the current codebase uses a numbered step prefix.
TimelineEditor is a Sprint 4 item that does not yet exist.

Decision: **defer — no current uses at all**.

## Recommendation

Hold the extraction bar at ≥2 current uses + 1 plausible Sprint 4 use. Do not
loosen it under time pressure. Premature abstraction of a single-use pattern
locks in an API before the second and third use cases reveal what the primitive
actually needs — and then the primitive has to be refactored anyway, costing more
time than copying once more would have.

Revisit after TimelineEditor (Sprint 4) lands. If TimelineEditor introduces a
list-of-rows pattern that shares structural DNA with CardList's rows, the List
primitive discussion can be reopened with two concrete use sites.

## Why this matters

Every extracted primitive is a shared contract. If the API is extracted too early,
the second and third consumers will bend their usage around a contract designed for
only one case, producing prop-flag proliferation ("mode", "variant", "hasIcon",
"hasStep") that makes the primitive harder to understand than just writing the HTML
directly. The Sprint 2 extraction wave (InputField, FormGroup, StatusMessage) worked
because three sections were already sharing the identical pattern. That is the signal
to act on.
