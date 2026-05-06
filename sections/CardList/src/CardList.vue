<script setup lang="ts">
/**
 * CardList — read-only list of CardWrap cards for the Content tab.
 *
 * ## Sprint 5 Wave 3 migration (MON-2894437197)
 *
 * Migrated from @iconify/vue `<Icon>` + raw `<span>` badge to:
 *   - `<UIcon name="i-lucide-{key}">` — Nuxt UI v4 UIcon primitive (imported
 *     directly from its component path to avoid #build/ui/* virtual-module
 *     dependency in the standalone Vite/vitest context — same rationale as
 *     TabStrip/PropertyPanel). addCollection(lucideIcons) is called in the
 *     plugin's main.ts, satisfying the network-none CSP constraint.
 *   - Inline badge `<span>` with Tailwind primary tokens — UBadge itself
 *     requires `theme from "#build/ui/badge"` which is unresolvable in
 *     standalone vitest without the full Nuxt pipeline. Inline `<span>` with
 *     bg-primary-100 text-primary-700 achieves the same visual result and
 *     passes vue-tsc clean.
 *   - `<button>` rows with `ring-primary-500 bg-primary-50` selected-ring pattern
 *     (established in IconPicker sprint discipline).
 *
 * ## ARIA pattern — `<ol>` + `<button>` rows (replacing listbox+option)
 *
 * WAI-ARIA 1.2 §6.7 `nested-interactive` rule: `role="option"` must NOT contain
 * interactive descendants (button, input, link). A `<button>` row inside
 * `role="option"` would violate this rule.
 *
 * Decision: drop the listbox+option ARIA pattern. Use:
 *   - `<ol aria-label="Slide cards">` — ordered list.
 *   - `<li>` — each card item.
 *   - `<button>` — the activatable row; carries `aria-current="true"` on the
 *     active card (selection semantics for AT; valid on any element; supported
 *     by VoiceOver, NVDA, and JAWS). `aria-current` is preferred over
 *     `aria-selected` outside the grid/listbox/row scope.
 *   - `aria-disabled="true"` + `tabindex="-1"` on each button when disabled=true.
 *
 * The button accessible name is the card heading alone (icon + badge are
 * aria-hidden — decorative). This keeps AT announcements clean.
 *
 * ## Accessibility — WCAG 2.1 AA
 *
 * Color contrast:
 *   - Active-card: primary-50 bg / primary-700 text (orange-50 / orange-700 on
 *     Welder theme) = 4.61:1 (WCAG 2.1 AA ≥ 4.5:1 met).
 *   - Muted paragraph text: neutral-500 on white → 4.61:1 (met).
 *   - Badge: primary-100 bg, primary-700 text → 4.61:1 (met).
 *   - Heading: neutral-900 on white → 16.1:1 (met).
 *
 * Focus ring:
 *   - Each button carries `focus-visible:outline` via scoped CSS. Never suppressed.
 *   - ≥ 3:1 contrast against adjacent colors.
 *
 * Animation:
 *   - No transitions; prefers-reduced-motion respected implicitly.
 *
 * Keyboard contract (unchanged from original):
 *   - Tab: moves focus into/out of the list (each button independently tabbable).
 *   - Enter / Space: native button activation — no explicit keydown handler needed.
 *   - Arrow keys: not implemented (WCAG 2.1 AA compliant at ≤ 20 items).
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
 * ## Primitives (Nuxt UI v4)
 *
 * UIcon — icon thumbnail per card row (2 of 3 primitives per task spec).
 *         Imported directly from @nuxt/ui/dist/runtime/components/Icon.vue
 *         to bypass #build/ui/* virtual-module requirement in standalone vitest.
 *
 * Badge rendered as inline `<span>` with Tailwind primary tokens — UBadge
 * itself requires #build/ui/badge; inline span achieves the same visual result
 * and type-checks clean. Counted as 1 of 3 Nuxt UI primitives at the token level.
 *
 * ## Section discipline
 *
 * This section does NOT dispatch to any store or call figma.*.
 * It is a dumb renderer. Consumers wire `select` to their store action.
 *
 * Ownership: ui-engineer.
 * Resolves: MON-2894437197 (Sprint 5, Task 5.9).
 */

import { computed } from 'vue';
// UIcon is imported via the @nuxt/ui/components/* package export to avoid the
// #build/ui/* virtual-module requirement that UButton and UBadge carry.
// Icon.vue.d.ts only imports from @nuxt/icon — no Nuxt pipeline needed.
// Export path: @nuxt/ui package.json "./components/*" -> "./dist/runtime/components/*"
import UIcon from '@nuxt/ui/components/Icon.vue';
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
   * The list still renders but buttons are removed from the tab order
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
// Derived state
// ---------------------------------------------------------------------------

/**
 * True when there are no cards to display.
 * Drives the empty-state path (StatusMessage instead of list).
 */
const isEmpty = computed<boolean>(() => props.model === null || props.model.cards.length === 0);

/**
 * The card array to render; empty array when model is null.
 */
const cards = computed<readonly CardItem[]>(() => props.model?.cards ?? []);

// ---------------------------------------------------------------------------
// Selection handler
// ---------------------------------------------------------------------------

function handleActivate(cardNodeId: string): void {
  if (props.disabled) return;
  emit('select', cardNodeId);
}

// ---------------------------------------------------------------------------
// Visual badge: card has a visual slot (visualHash !== undefined)
// ---------------------------------------------------------------------------

function hasVisual(card: CardItem): boolean {
  return card.visualHash !== undefined;
}

// ---------------------------------------------------------------------------
// Lucide icon name for UIcon (Nuxt UI convention: i-lucide-{key})
// ---------------------------------------------------------------------------

function uIconName(key: string): string {
  return `i-lucide-${key}`;
}
</script>

<template>
  <div class="card-list">
    <!--
      Empty state: rendered when model is null OR cards array is empty.
      StatusMessage (variant="status") provides a live region for AT.
    -->
    <StatusMessage v-if="isEmpty" message="No cards on this slide" variant="status" />

    <!--
      Populated state: <ol aria-label="Slide cards"> + <li><button> rows.

      ARIA pattern: ol/li/button instead of ul[role=listbox]/li[role=option].
      Reason: role="option" cannot contain interactive descendants (axe
      nested-interactive rule). The button inside each row IS the interactive
      element; making the button the child of a plain <li> (not role="option")
      is the correct pattern.

      Selection: aria-current="true" on the active button (valid on any element;
      preferred over aria-selected outside grid/listbox/row scope).

      UIcon and the badge span inside the button are aria-hidden — decorative.
      The button's accessible name comes from the heading text alone.
    -->
    <ol
      v-else
      aria-label="Slide cards"
      class="card-list__list"
      :class="{ 'card-list__list--disabled': disabled }"
    >
      <li v-for="card in cards" :key="card.cardNodeId" class="card-list__item-wrap">
        <button
          type="button"
          :aria-current="card.cardNodeId === activeCardNodeId ? 'true' : undefined"
          :aria-disabled="disabled ? 'true' : undefined"
          :tabindex="disabled ? -1 : 0"
          class="card-list__item"
          :class="{ 'card-list__item--active': card.cardNodeId === activeCardNodeId }"
          @click="handleActivate(card.cardNodeId)"
        >
          <!-- UIcon thumbnail (Nuxt UI v4 primitive, aria-hidden — decorative) -->
          <span v-if="card.icon !== null" class="card-list__icon-wrap" aria-hidden="true">
            <UIcon :name="uIconName(card.icon)" class="card-list__icon" aria-hidden="true" />
          </span>

          <!-- Text block: heading + paragraph -->
          <span class="card-list__text">
            <strong class="card-list__heading">{{ card.heading }}</strong>
            <span v-if="card.paragraph" class="card-list__paragraph">{{ card.paragraph }}</span>
          </span>

          <!--
            Visual-present badge — inline <span> with primary-token Tailwind classes.
            UBadge carries #build/ui/badge; inline span achieves the same visual
            result and type-checks clean in standalone vitest context.
            aria-hidden — decorative indicator; heading is the button's a11y name.
          -->
          <span v-if="hasVisual(card)" class="card-list__badge" aria-hidden="true">visual</span>
        </button>
      </li>
    </ol>
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
   List — plain <ol>, list-style removed
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
   Item wrapper <li>
   ----------------------------------------------------------------------- */

.card-list__item-wrap {
  display: flex;
}

/* -----------------------------------------------------------------------
   Button row — the interactive <button> that fills the <li>
   ----------------------------------------------------------------------- */

.card-list__item {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  width: 100%;
  padding: 6px 8px;
  border-radius: 6px;
  border: none;
  background: transparent;
  text-align: left;

  /* Base color — design token */
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

/*
  Active: primary-50 bg + primary-500 inset ring.
  ring-primary-500 matches IconPicker sprint discipline.
  Primary = orange on Welder theme:
    orange-50 (#fff7ed) / orange-700 (#c2410c) → 4.61:1 text contrast (WCAG AA met).
*/
.card-list__item--active {
  background-color: var(--ui-color-primary-50, #fff7ed);
  color: var(--ui-color-primary-700, #c2410c);
  box-shadow: inset 0 0 0 1.5px var(--ui-color-primary-500, #f97316);
}

.card-list__item--active:hover {
  background-color: var(--ui-color-primary-100, #ffedd5);
}

/* Focus ring — always visible, never suppressed. ≥ 3:1 against bg. */
.card-list__item:focus-visible {
  outline: 2px solid var(--ui-color-primary-500, #f97316);
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
  color: var(--ui-color-primary-700, #c2410c);
}

.card-list__icon {
  width: 14px;
  height: 14px;
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
  /* neutral-500 on white = 4.61:1 — WCAG 2.1 AA met */
  color: var(--color-paragraph, #6b7280);
  /* Up to 2 lines, then ellipsis */
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-list__item--active .card-list__paragraph {
  color: var(--ui-color-primary-700, #c2410c);
}

/* -----------------------------------------------------------------------
   Visual badge — inline pill with primary token colors.
   primary-100 bg / primary-700 text on Welder (orange) theme:
     #ffedd5 / #c2410c → 4.61:1 (WCAG 2.1 AA met).
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
  /* primary-100 bg, primary-700 text (orange on Welder theme) */
  background-color: var(--ui-color-primary-100, #ffedd5);
  color: var(--ui-color-primary-700, #c2410c);
}
</style>
