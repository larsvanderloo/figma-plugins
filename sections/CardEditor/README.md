# CardEditor

Composite section for editing a single CardWrap card — heading, paragraph, icon, and visual (image). Composes three existing sections rather than reimplementing primitives.

## Composition

```
CardEditor
  └── TitleDescriptionEditor (@figma-plugins/sections-title-description-editor)
        heading + paragraph text fields
  └── IconPicker              (@figma-plugins/sections-icon-picker)
        Lucide icon swap — rendered only when card.icon !== null
  └── ImageEditor             (@figma-plugins/sections-image-editor)
        image upload + crop   — rendered only when card.visualHash !== undefined
```

## Props

| Prop       | Type       | Default       | Description                                                    |
| ---------- | ---------- | ------------- | -------------------------------------------------------------- |
| `card`     | `CardItem` | required      | The card to edit. Drives all child sections.                   |
| `label`    | `string`   | `"Edit card"` | Accessible heading label, e.g. `"Card 2 of 4"`.                |
| `disabled` | `boolean`  | `false`       | Propagates to all child sections. No edits possible when true. |

## Emits

| Event              | Payload                                     | Description                                  |
| ------------------ | ------------------------------------------- | -------------------------------------------- |
| `update:heading`   | `{ cardNodeId: string; heading: string }`   | Heading changed (debounced 300 ms in TDE).   |
| `update:paragraph` | `{ cardNodeId: string; paragraph: string }` | Paragraph changed (debounced 300 ms in TDE). |
| `update:icon`      | `{ cardNodeId: string; iconName: string }`  | Icon selection changed (immediate).          |
| `update:visual`    | `{ cardNodeId: string; bytes: Uint8Array }` | New image selected (fires after file-read).  |

## Usage

```vue
<CardEditor
  :card="activeCard"
  :label="`Card ${index + 1} of ${total}`"
  :disabled="isBusy"
  @update:heading="({ cardNodeId, heading }) => actions.applyCard({ cardNodeId, heading })"
  @update:paragraph="({ cardNodeId, paragraph }) => actions.applyCard({ cardNodeId, paragraph })"
  @update:icon="({ cardNodeId, iconName }) => actions.applyCard({ cardNodeId, icon: iconName })"
  @update:visual="({ cardNodeId, bytes }) => handleImageUpload(cardNodeId, bytes)"
/>
```

## Accessibility

- The outer `<section>` has `aria-labelledby` pointing at the label element, giving screen readers the accessible name (e.g. "Card 2 of 4").
- Tab order: heading → paragraph (TitleDescriptionEditor) → icon grid (IconPicker, when present) → image button (ImageEditor, when present). Matches visual top-to-bottom flow.
- `disabled` propagates via each child's own `disabled` prop. TitleDescriptionEditor additionally uses `<fieldset disabled>` for native propagation to all descendant inputs.
- No host Figma shortcuts (Cmd-Z, Cmd-D, Cmd-A) are captured.
- `prefers-reduced-motion` is respected inside each child section.
- axe-core WCAG 2.1 AA clean across: full card, null icon, no visual slot, disabled, visual placeholder.

## Design tokens used

- `--color-label` — section heading + sub-section label text color.

## Section discipline

- Does NOT dispatch messages or call `figma.*`.
- Does NOT import `useEditorActions`, the bridge, or any Pinia store.
- Data flows in via the `card` prop; user edits flow out via typed emits.
- The parent (Content tab, Sprint 3.4) wires emits to `useEditorActions.applyCard()`.

## When NOT to use it

- For editing CopyWrap text on a slide's General tab: use `TitleDescriptionEditor` directly.
- For editing a Badge: use `BadgeEditor` directly.
- For editing a slide's main image: use `ImageEditor` directly.

Ownership: ui-engineer. Resolves: MON-2893969761 (Sprint 3, Task 3.2).
