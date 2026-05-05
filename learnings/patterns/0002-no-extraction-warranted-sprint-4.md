# 0002 — Sprint 4 component-extraction pass: no candidates met the extraction rule

**Status:** active
**Date:** 2026-05-05
**Origin:** general
**Related:** MON-2894068364 (TDEV-073), Sprint 2894068169

## Context

Sprint 4 Task 4.10 was the scheduled "stop and harvest" pass after TableEditor
(PR #40), JourneyEditor (PR #39), and the csv-schema module (PR #38) landed.
The task asked ui-engineer to scan all sections for patterns recurring enough to
warrant extraction into `components/src/`.

Extraction bar (unchanged from 0001): a primitive earns extraction only if
**at least 2 sections currently use the same pattern AND a 3rd is plausible in
the v0.2.0 backlog (charts epic, accent ranges epic).**

Sections surveyed: CardList, CardEditor, BadgeEditor, TitleDescriptionEditor,
IconPicker, ImageEditor, PropertyPanel, TabStrip, TimelineEditor, TableEditor,
JourneyEditor.

Existing components already extracted: InputField, FormGroup, StatusMessage
(Sprint 2, Task 2.13).

## Candidates evaluated

### 1. List primitive

**Proposed:** a shared ordered/unordered list primitive for sections that render
a sequence of items.

**Current uses surveyed:**

- CardList — `<ul role="listbox">` with icon + heading + paragraph + badge
  per row. Keyboard model: individually tabbable `<li role="option">`.
- TimelineEditor — `<ol>` with `<TitleDescriptionEditor>` per item. No icon,
  no badge, no selection state. Plain editing list.
- JourneyEditor — `<ol>` with label input + IconPicker + dual numeric inputs
  per item. Multi-control rows; the list is an editing scaffold, not a
  selection widget.

**Decision: defer — structurally dissimilar row shapes; 0 sections share the
same row contract.**

The three sections use list markup for unrelated purposes: selection (CardList),
single-field editing stacked list (TimelineEditor), multi-field editing
(JourneyEditor). A shared primitive would need a slot API so flexible it ceases
to be a primitive — it becomes a layout shell that adds indirection without
removing duplication. The Sprint 3 finding (0001) predicted this exactly and it
held. Revisit only if two sections share an identical row structure (same number
of fields, same ARIA role).

### 2. NumericInput primitive

**Proposed:** a `<input type="number">` wrapper with min/max/step/aria-valuenow
pass-through, distinct from InputField's generic type="number" usage.

**Current uses surveyed:**

- JourneyEditor — uses `InputField` with `type="number"` and explicit
  `aria-valuemin`, `aria-valuemax`, `aria-valuenow` pass-through attrs for
  startPct and endPct fields. 2 instances inside one section.
- TableEditor — uses `<button>` +/− counter controls (stepper pattern) with an
  `aria-live` span for the current value. This is NOT a numeric input field;
  it is an increment/decrement stepper.

**Decision: defer — 1 section uses type="number" inputs; TableEditor's counter
is a different UX pattern (stepper vs. number field).**

These are two distinct patterns that happen to involve numbers. Combining them
behind a single primitive would require a `mode` prop ("input" vs. "stepper"),
at which point the primitive is harder to understand than the inline code.
Revisit if a second section needs `<input type="number">` with range constraints
— at that point NumericInput becomes a clean extract. JourneyEditor alone does
not meet the ≥2 sections bar.

### 3. StepIndex / PillIndex (numbered step prefix)

**Proposed:** a `<p>` or `<span>` primitive rendering "Step N" with compact
uppercase styling — 10 px, weight 600, uppercase, letter-spacing, muted color.

**Current uses:**

- JourneyEditor — `<p class="journey-editor__item-index">Step {{ index + 1 }}</p>`
- TimelineEditor — `<p class="timeline-editor__step-label">Step {{ index + 1 }}</p>`

That is 2 current uses. However, the shared "primitive" is a `<p>` with 5 CSS
properties and a slot or prop for the index number. Extracting it would add:
a new folder, `src/StepIndex.vue`, `src/index.ts`, `tests/StepIndex.test.ts`,
a README, and a re-export in `components/src/index.ts`. The consuming sections
would need to update their imports and their scoped CSS. The overhead of the
package entry, test boilerplate, and consuming-section edits exceeds the value
of removing 5 lines of scoped CSS from 2 files.

An extracted primitive earns its keep when it encapsulates non-trivial behaviour
(accessibility wiring, state, slot API) or when the pattern recurs in 3+ places.
A pure styling `<p>` does not meet that bar regardless of the section count.

**Decision: defer — 2 current uses confirmed, but the pattern is a styling-only
`<p>` with no behaviour; extraction overhead exceeds the value.**

### 4. PaintControlGroup / ToggleGroup (sm/md/lg preset selector)

**Proposed:** a 3-option button toggle group (sm / md / lg) with `aria-pressed`
on each button and a `role="group"` wrapper.

**Current uses:**

- TableEditor `<PropertyPanel title="Width">` — sm/md/lg buttons.
- TableEditor `<PropertyPanel title="Text Size">` — sm/md/lg buttons.

Both uses are within the same SFC (TableEditor.vue). The rule requires ≥2
SECTIONS — 2 uses inside a single section file do not qualify.

No other section currently uses a 3-option toggle group.

**Decision: defer — 2 uses in 1 section only; ≥2 sections rule not met.**

If AccentRanges or Charts (v0.2.0 backlog) introduces a toggle group, that
would push the count to 2 sections and the extraction would be warranted at
that point (the ARIA pattern — `role="group"` + `aria-pressed` buttons — is
non-trivial enough to merit a shared primitive once 2+ sections use it).

## Recommendation

Hold the extraction bar. All four candidates were examined rigorously and none
cleared ≥2 sections with an identical row/control contract. The pattern for
StepIndex warrants a revisit at 3 section uses (the styling is simple but the
repetition is real). The ToggleGroup pattern warrants a revisit when any v0.2.0
section adopts it (the ARIA wiring has extraction value).

## Why StepIndex doesn't cross the bar despite 2 uses

The decision rule is: ≥2 current uses AND a plausible 3rd in the v0.2.0
backlog. The plausible-3rd condition is met (charts or accent ranges could have
ordered steps). But the decision rule is a NECESSARY condition for evaluation,
not a SUFFICIENT condition for extraction. The sufficient condition is that the
extraction removes enough duplication to pay for the overhead. For a pure-CSS
`<p>` with zero behaviour, it does not. The rule prevents PREMATURE extraction;
sound engineering judgment prevents OVER-extraction of trivial patterns.

The Sprint 2 extraction wave (InputField, FormGroup, StatusMessage) worked
because those primitives encapsulated label/input wiring, ARIA associations,
focus management, and design-token colour references — non-trivial behaviour
that all three use sites would otherwise duplicate identically. That is the
signal to act on.
