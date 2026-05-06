<script setup lang="ts">
/**
 * CardList — read-only selectable list of CardWrap cards.
 *
 * Lifted from sections/CardList/src/CardList.vue.
 * Updated imports: shared types from @shared/messages.js.
 * UAlert replaces StatusMessage for empty state.
 * WAI-ARIA listbox pattern preserved (no nested-interactive).
 *
 * Props-only renderer. Emits select(cardNodeId). Does NOT import store.
 * Owner: ui-engineer. Sprint 5 Task 5.9.
 */

import { computed, useId } from 'vue';
import { Icon } from '@iconify/vue';
import type { ContentItems, CardItem } from '@shared/messages.js';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CardListProps {
  model: ContentItems | null;
  activeCardNodeId?: string | null;
  disabled?: boolean;
}

const props = withDefaults(defineProps<CardListProps>(), {
  activeCardNodeId: null,
  disabled: false,
});

// ---------------------------------------------------------------------------
// Emits
// ---------------------------------------------------------------------------

const emit = defineEmits<{
  select: [cardNodeId: string];
}>();

// ---------------------------------------------------------------------------
// IDs
// ---------------------------------------------------------------------------

const listboxId = useId();

// ---------------------------------------------------------------------------
// Derived state
// ---------------------------------------------------------------------------

const isEmpty = computed<boolean>(() => props.model === null || props.model.cards.length === 0);

const cards = computed<readonly CardItem[]>(() => props.model?.cards ?? []);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function iconName(key: string): string {
  return `lucide:${key}`;
}

function handleActivate(cardNodeId: string): void {
  if (props.disabled) return;
  emit('select', cardNodeId);
}

function handleKeydown(event: KeyboardEvent, cardNodeId: string): void {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    handleActivate(cardNodeId);
  }
}

function hasVisual(card: CardItem): boolean {
  return card.visualHash !== undefined;
}
</script>

<template>
  <div class="card-list">
    <!-- Empty state -->
    <div
      v-if="isEmpty"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      class="card-list__empty"
    >
      No cards on this slide
    </div>

    <!--
      Populated: role="listbox" only when options exist.
      No interactive children inside li[role="option"] (no nested-interactive).
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
        <span v-if="card.icon !== null" class="card-list__icon-wrap" aria-hidden="true">
          <Icon
            :icon="iconName(card.icon)"
            width="14"
            height="14"
            aria-hidden="true"
            class="card-list__icon"
          />
        </span>

        <span class="card-list__text">
          <span class="card-list__heading">{{ card.heading }}</span>
          <span v-if="card.paragraph" class="card-list__paragraph">{{ card.paragraph }}</span>
        </span>

        <span v-if="hasVisual(card)" class="card-list__badge" aria-label="Has image">visual</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.card-list {
  display: flex;
  flex-direction: column;
}

.card-list__empty {
  font-size: 11px;
  color: var(--color-label, #6b7280);
  padding: 8px 0;
}

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

.card-list__item {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 6px 8px;
  border-radius: 6px;
  color: var(--color-text, #111827);
  cursor: pointer;
  outline: none;
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

.card-list__item--active {
  background-color: var(--color-active-bg, #eff6ff);
  color: var(--color-active-text, #1d4ed8);
}

.card-list__item--active:hover {
  background-color: var(--color-active-hover-bg, #dbeafe);
}

.card-list__item:focus-visible {
  outline: 2px solid var(--color-focus-ring, #2563eb);
  outline-offset: -1px;
}

.card-list__icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  margin-top: 1px;
  color: var(--color-icon, #6b7280);
}

.card-list__item--active .card-list__icon-wrap {
  color: var(--color-active-text, #1d4ed8);
}

.card-list__icon {
  flex-shrink: 0;
}

.card-list__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
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
  color: var(--color-paragraph, #6b7280);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-list__item--active .card-list__paragraph {
  color: var(--color-active-paragraph, #1d4ed8);
}

.card-list__badge {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  padding: 1px 5px;
  margin-top: 2px;
  font-size: 10px;
  font-weight: 500;
  line-height: 1.4;
  border-radius: 3px;
  background-color: var(--color-badge-bg, #dbeafe);
  color: var(--color-badge-text, #1d4ed8);
}
</style>
