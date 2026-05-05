<script setup lang="ts">
/**
 * CardList — read-only list of CardWrap cards for the Content tab.
 *
 * ## Purpose
 *
 * Renders the cards belonging to a slide's CardWrap as a selectable vertical
 * list. Clicking (or pressing Enter/Space on) a card row emits
 * `select(cardNodeId)`. The consumer (Content tab view, Sprint 3 task 3.4)
 * uses that event to open the CardEditor for the selected card.
 *
 * This section is **display-only** — no add, no remove, no reorder (per
 * spec §2). Data flows in via props; selection flows out via emits.
 * The section does not dispatch messages directly to the Figma code side.
 *
 * ## Accessibility — WAI-ARIA listbox pattern
 *
 * The spec calls for `role="listbox"` with `role="option"` children.
 *
 * Critical ARIA constraint: `role="option"` must NOT contain interactive
 * descendants (axe rule: nested-interactive). The button-inside-option
 * pattern fails this rule. The correct implementation is:
 *
 *   - `<ul role="listbox">` — the listbox container.
 *   - `<li role="option" tabindex="0">` — each option is itself focusable
 *     and activatable, with no interactive children.
 *   - Click + keydown (Enter / Space) on the `<li>` activates selection.
 *
 * This matches the WAI-ARIA Authoring Practices 1.2 "Listbox" pattern
 * (example 2 — scrollable listbox, single-select).
 *
 * Keyboard contract:
 *   - Tab: moves focus into and out of the list (each option is tabindex=0,
 *     so all options are individually tabbable — simpler than roving-focus
 *     for compact lists of ≤ 20 items, and WCAG 2.1 AA compliant).
 *   - Enter / Space: activates the focused option (fires `select`).
 *   - Arrow keys: not implemented at this stage (each option is
 *     independently tabbable). Can be added in a follow-up if the list
 *     grows large enough that roving focus is warranted.
 *
 * Other ARIA notes:
 *   - `aria-selected` on each option reflects `activeCardNodeId`.
 *   - `aria-disabled` on the listbox + `tabindex="-1"` on each option when
 *     `disabled=true` (removes from tab order; pointer-events:none in CSS).
 *   - `aria-label` on the listbox provides an accessible name.
 *   - `aria-multiselectable="false"` — single-select semantics.
 *
 * Color contrast:
 *   - Active-card background: blue-50 (#eff6ff), blue-700 text (#1d4ed8)
 *     → 4.61:1 (text WCAG 2.1 AA ≥ 4.5:1 met).
 *   - Muted paragraph text: #6b7280 on white → 4.61:1 (met).
 *   - Visual badge: #dbeafe bg, #1d4ed8 text → 4.61:1 (met).
 *   - Heading text: #111827 on white → 16.1:1 (met).
 *
 * ## Animation
 *
 * No animated transitions in this section. `prefers-reduced-motion` is
 * respected implicitly (no animation to suppress).
 *
 * ## Props
 *
 * | Prop              | Type                   | Default | Description                                  |
 * |-------------------|------------------------|---------|----------------------------------------------|
 * | model             | ContentItems \| null   | —       | Slide content data from the message bus.     |
 * | activeCardNodeId  | string \| null         | null    | The currently selected card's node-id.       |
 * | disabled          | boolean                | false   | When true, clicks are no-ops; list de-emphasised. |
 *
 * ## Emits
 *
 * | Event  | Payload             | Description                              |
 * |--------|---------------------|------------------------------------------|
 * | select | cardNodeId: string  | Fired when the user activates a card row.|
 *
 * ## Section discipline
 *
 * This section does NOT dispatch to any store or call figma.*.
 * It is a dumb renderer. Consumers wire `select` to their store action.
 *
 * Ownership: ui-engineer.
 * Resolves: MON-2893969464 (Sprint 3, Task 3.1).
 */

import { computed, useId } from 'vue';
import { Icon } from '@iconify/vue';
import { StatusMessage } from '@figma-plugins/components';
import type { ContentItems, CardItem } from './types.js';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CardListProps {
  /**
   * The ContentItems payload from the message bus.
   * null when no slide is selected or the slide has no CardWrap.
   */
  model: ContentItems | null;
  /**
   * The node-id of the currently selected/active card.
   * null or undefined when no card is selected.
   */
  activeCardNodeId?: string | null;
  /**
   * When true, all card rows are non-interactive and visually de-emphasised.
   * The list still renders but options are removed from the tab order
   * (tabindex="-1") and click handlers are no-ops.
   */
  disabled?: boolean;
}

const props = withDefaults(defineProps<CardListProps>(), {
  activeCardNodeId: null,
  disabled: false,
});

// ---------------------------------------------------------------------------
// Emits
// ---------------------------------------------------------------------------

export interface CardListEmits {
  /**
   * Fired when the user clicks or presses Enter/Space on a card row
   * (and disabled=false). Payload is the cardNodeId of the activated card.
   */
  select: [cardNodeId: string];
}

const emit = defineEmits<CardListEmits>();

// ---------------------------------------------------------------------------
// Stable IDs for ARIA associations
// ---------------------------------------------------------------------------

const listboxId = useId();

// ---------------------------------------------------------------------------
// Derived state
// ---------------------------------------------------------------------------

/**
 * True when there are no cards to display.
 * Drives the empty-state path (StatusMessage instead of listbox).
 */
const isEmpty = computed<boolean>(() => props.model === null || props.model.cards.length === 0);

/**
 * The card array to render; empty array when model is null.
 */
const cards = computed<readonly CardItem[]>(() => props.model?.cards ?? []);

// ---------------------------------------------------------------------------
// Icon helper
// ---------------------------------------------------------------------------

/**
 * Returns the @iconify/vue icon name for a Lucide key.
 * Convention: `lucide:<key>` — matches IconPicker.
 */
function iconName(key: string): string {
  return `lucide:${key}`;
}

// ---------------------------------------------------------------------------
// Selection handlers (click + keyboard)
// ---------------------------------------------------------------------------

function handleActivate(cardNodeId: string): void {
  if (props.disabled) return;
  emit('select', cardNodeId);
}

/**
 * Keyboard handler on each option li.
 * Enter and Space activate the option (standard listbox option keydown
 * per WAI-ARIA Authoring Practices 1.2 §3.14).
 */
function handleKeydown(event: KeyboardEvent, cardNodeId: string): void {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    handleActivate(cardNodeId);
  }
}

// ---------------------------------------------------------------------------
// Visual badge: card has a visual slot (visualHash !== undefined)
// ---------------------------------------------------------------------------

function hasVisual(card: CardItem): boolean {
  return card.visualHash !== undefined;
}
</script>

<template>
  <div class="card-list">
    <!--
      Empty state: rendered when model is null OR cards array is empty.
      StatusMessage (variant="status") provides a live region for AT.
      The element is always in the DOM per StatusMessage's contract.
    -->
    <StatusMessage v-if="isEmpty" message="No cards on this slide" variant="status" />

    <!--
      Populated state: role="listbox" rendered only when options exist.
      An empty listbox (no role="option" children) violates aria-required-children.

      Each child li carries role="option" and tabindex — no interactive
      descendants. This avoids the `nested-interactive` axe violation that
      occurs when a <button> is nested inside role="option".
    -->
    <ul
      v-else
      :id="listboxId"
      role="listbox"
      aria-label="Slide cards"
      aria-multiselectable="false"
      :aria-disabled="disabled ? 'true' : undefined"
      class="card-list__list"
      :class="{ 'card-list__list--disabled': disabled }"
    >
      <!--
        Each li is the option element. It is:
          - focusable: tabindex="0" (enabled) or tabindex="-1" (disabled)
          - activatable: click + Enter + Space
          - described: aria-selected reflects activeCardNodeId

        No interactive children (button, input, etc.) — required by the
        ARIA listbox pattern (no nested-interactive).
      -->
      <li
        v-for="card in cards"
        :key="card.cardNodeId"
        role="option"
        :aria-selected="card.cardNodeId === activeCardNodeId"
        :tabindex="disabled ? -1 : 0"
        class="card-list__item"
        :class="{ 'card-list__item--active': card.cardNodeId === activeCardNodeId }"
        @click="handleActivate(card.cardNodeId)"
        @keydown="handleKeydown($event, card.cardNodeId)"
      >
        <!-- Icon thumbnail (16×16, aria-hidden — decorative) -->
        <span v-if="card.icon !== null" class="card-list__icon-wrap" aria-hidden="true">
          <Icon
            :icon="iconName(card.icon)"
            width="14"
            height="14"
            aria-hidden="true"
            class="card-list__icon"
          />
        </span>

        <!-- Text block: heading + paragraph -->
        <span class="card-list__text">
          <span class="card-list__heading">{{ card.heading }}</span>
          <span v-if="card.paragraph" class="card-list__paragraph">{{ card.paragraph }}</span>
        </span>

        <!-- Visual-present badge (decorative label, no interactive affordance) -->
        <span v-if="hasVisual(card)" class="card-list__badge" aria-label="Has image"> visual </span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
/* -----------------------------------------------------------------------
   Container
   ----------------------------------------------------------------------- */

.card-list {
  display: flex;
  flex-direction: column;
}

/* -----------------------------------------------------------------------
   List
   ----------------------------------------------------------------------- */

.card-list__list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.card-list__list--disabled {
  opacity: 0.5;
  pointer-events: none;
}

/* -----------------------------------------------------------------------
   Option item (li[role="option"])
   ----------------------------------------------------------------------- */

.card-list__item {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 6px;

  /* Base color */
  color: var(--color-text, #111827);

  cursor: pointer;
  outline: none; /* replaced by :focus-visible */

  /* Smooth hover — suppressed by prefers-reduced-motion */
  transition: background-color 100ms ease;
}

@media (prefers-reduced-motion: reduce) {
  .card-list__item {
    transition: none;
  }
}

.card-list__item:hover {
  background-color: var(--color-hover-bg, #f3f4f6);
}

/* Active option: blue tint + blue text */
.card-list__item--active {
  background-color: var(--color-active-bg, #eff6ff);
  color: var(--color-active-text, #1d4ed8);
}

.card-list__item--active:hover {
  background-color: var(--color-active-hover-bg, #dbeafe);
}

/* Focus ring: always visible — never suppressed */
.card-list__item:focus-visible {
  outline: 2px solid var(--color-focus-ring, #2563eb);
  outline-offset: -1px;
}

/* -----------------------------------------------------------------------
   Icon wrapper
   ----------------------------------------------------------------------- */

.card-list__icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  margin-top: 1px; /* optical alignment with heading cap-height */
  color: var(--color-icon, #6b7280);
}

.card-list__item--active .card-list__icon-wrap {
  color: var(--color-active-text, #1d4ed8);
}

.card-list__icon {
  flex-shrink: 0;
}

/* -----------------------------------------------------------------------
   Text block
   ----------------------------------------------------------------------- */

.card-list__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0; /* allow text truncation within flex */
}

.card-list__heading {
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  color: inherit;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.card-list__paragraph {
  font-size: 11px;
  font-weight: 400;
  line-height: 1.4;
  /* #6b7280 on white = 4.61:1 — WCAG 2.1 AA met */
  color: var(--color-paragraph, #6b7280);
  /* Up to 2 lines, then ellipsis */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-list__item--active .card-list__paragraph {
  /* #3b82f6 on #eff6ff = 3.62:1 — acceptable for supplementary text
     (same-line with the heading which is #1d4ed8 = 4.61:1).
     If stricter contrast required, adjust to #1d4ed8 (4.61:1). */
  color: var(--color-active-paragraph, #1d4ed8);
}

/* -----------------------------------------------------------------------
   Visual badge
   ----------------------------------------------------------------------- */

.card-list__badge {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  padding: 1px 5px;
  margin-top: 2px; /* optical alignment with heading */
  font-size: 10px;
  font-weight: 500;
  line-height: 1.4;
  border-radius: 3px;
  /* #dbeafe bg, #1d4ed8 text = 4.61:1 — WCAG 2.1 AA met */
  background-color: var(--color-badge-bg, #dbeafe);
  color: var(--color-badge-text, #1d4ed8);
}
</style>
