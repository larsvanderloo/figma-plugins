# TimelineEditor

Section for editing a TimelineWrap's ordered steps. Each step is a
CopyWrap-backed entry with a heading and paragraph, composed via
`TitleDescriptionEditor`.

## Purpose

Renders an ordered list of timeline items (`TimelineItem[]`). Users can edit
the heading and paragraph of each step. Items are shown in array order with a
"Step N" label per item.

This section is **presentation-only** (ADR-0010 §section-authoring-template):

- No store imports, no bridge imports, no `figma.*`.
- Data flows in via `items` prop. User edits flow out via typed emits.
- The parent (App.vue Content tab, Sprint 3 task 3.4) wires emits to
  `useEditorActions.applyTimeline`.

## Composition

```
TimelineEditor
  └─ per item: TitleDescriptionEditor (@figma-plugins/sections-title-description-editor)
```

## Props

| Prop       | Type             | Default     | Description                                                |
| ---------- | ---------------- | ----------- | ---------------------------------------------------------- |
| `items`    | `TimelineItem[]` | —           | Ordered timeline items. Empty array shows a StatusMessage. |
| `label`    | `string`         | `undefined` | Optional visible section heading (e.g. "Timeline").        |
| `disabled` | `boolean`        | `false`     | When true, disables all child editors.                     |

## Emits

| Event                  | Payload                             | Description                                     |
| ---------------------- | ----------------------------------- | ----------------------------------------------- |
| `update:itemHeading`   | `{ itemId: string; value: string }` | Heading changed. `itemId` = `copyWrapNodeId`.   |
| `update:itemParagraph` | `{ itemId: string; value: string }` | Paragraph changed. `itemId` = `copyWrapNodeId`. |

Both emits are debounced (300 ms) inside `TitleDescriptionEditor`.

### Wiring to `useEditorActions` (parent responsibility)

```typescript
function onItemHeading({ itemId, value }: { itemId: string; value: string }) {
  actions.applyTimeline({ copyWrapNodeId: itemId, heading: value });
}

function onItemParagraph({ itemId, value }: { itemId: string; value: string }) {
  actions.applyTimeline({ copyWrapNodeId: itemId, paragraph: value });
}
```

## Usage

```vue
<TimelineEditor
  :items="content.timelineItems"
  label="Timeline"
  :disabled="isBusy"
  @update:item-heading="onItemHeading"
  @update:item-paragraph="onItemParagraph"
/>
```

## Accessibility

- `<ol aria-label="Timeline steps">` — ordered list; communicates sequence to
  screen readers.
- Each step has a visible "Step N" label (aria-hidden, supplementary context).
- `disabled` propagates via `TitleDescriptionEditor`'s `<fieldset disabled>` to
  all descendant inputs (browser-native mechanism; no additional ARIA wiring).
- Tab order matches visual top-to-bottom flow: Step 1 heading → Step 1
  paragraph → Step 2 heading → ...
- No host Figma shortcuts (Cmd-Z, Cmd-D, Cmd-A) are captured.
- axe-core WCAG 2.1 AA clean across: empty, populated, disabled, single-item,
  three-item states.
- Color contrast: step label #6b7280 on white = 4.61:1 (AA met). Section label
  #374151 on white = 10.7:1 (AA met).
- `prefers-reduced-motion` respected inside `TitleDescriptionEditor`/`InputField`.

## Design-token usage

| CSS custom property  | Fallback  | Usage                   |
| -------------------- | --------- | ----------------------- |
| `--color-label`      | `#374151` | Section heading label   |
| `--color-step-label` | `#6b7280` | Per-item "Step N" label |
| `--color-divider`    | `#e5e7eb` | Divider between items   |

All tokens come from `components/tokens/`. No hard-coded hex codes in
component logic.

## When NOT to use

- When items have icon or image slots — use `CardEditor`
  (`@figma-plugins/sections-card-editor`) instead; `TimelineItem` has no
  icon/visual slot.
- When you need reorder UI — v0.1.0 has no drag-and-drop (out of scope per
  spec; add an ADR before implementing).
- When there is only one item and you want a flat form — `TitleDescriptionEditor`
  directly may be cleaner.
