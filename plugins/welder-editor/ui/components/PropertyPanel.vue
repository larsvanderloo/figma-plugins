<!--
  PropertyPanel — collapsible section wrapper.

  Lifted from sections/PropertyPanel/src/PropertyPanel.vue verbatim.
  Custom CSS grid-template-rows collapse; ADR-0011 prohibits migration to
  UCollapsible (T42.21 perf gate and #build/* import blocker).

  ## CSS grid-template-rows technique
  Body wrapper is a single-column grid. grid-template-rows transitions between
  0fr (collapsed) and 1fr (expanded). No JS height measurement; browser
  resolves height during CSS transition frame budget.
  overflow:hidden clips content. inner div has min-height:0.
  prefers-reduced-motion: transition removed; state changes remain instantaneous.

  ## ARIA contract (ARIA APG 1.2 Accordion pattern)
  Collapsible: <button> with aria-expanded + aria-controls pointing to body id.
  Non-collapsible: static <div>, not interactive.
  Body always in DOM; CSS-only collapse. aria-expanded is the sole semantic signal.
  Chevron: aria-hidden="true" — decorative.

  Owner: ui-engineer
  ADR-0011: keep custom collapsible
-->
<script setup lang="ts">
import { ref, computed, useId } from 'vue';

const props = withDefaults(
  defineProps<{
    /** Section heading displayed in the header bar. */
    title: string;
    /**
     * Initial open state on mount (uncontrolled bootstrap).
     * @default true
     */
    defaultOpen?: boolean;
    /**
     * When false: static label (not a button), chevron hidden, body pinned open.
     * @default true
     */
    collapsible?: boolean;
  }>(),
  {
    defaultOpen: true,
    collapsible: true,
  },
);

const emit = defineEmits<{
  /** Fired after each toggle. Supports v-model:open. */
  'update:open': [value: boolean];
}>();

const isOpen = ref<boolean>(props.collapsible ? props.defaultOpen : true);

function toggle(): void {
  if (!props.collapsible) return;
  isOpen.value = !isOpen.value;
  emit('update:open', isOpen.value);
}

const headerId = useId();
const bodyId = useId();

const bodyClass = computed<string>(() =>
  isOpen.value ? 'property-panel__body--open' : 'property-panel__body--closed',
);
</script>

<template>
  <section class="property-panel">
    <button
      v-if="collapsible"
      :id="headerId"
      type="button"
      class="property-panel__header property-panel__header--button"
      :aria-expanded="isOpen"
      :aria-controls="bodyId"
      @click="toggle"
    >
      <span class="property-panel__title">{{ title }}</span>
      <svg
        aria-hidden="true"
        focusable="false"
        class="property-panel__chevron"
        :class="{ 'property-panel__chevron--open': isOpen }"
        width="12"
        height="12"
        viewBox="0 0 12 12"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M2.5 4.5L6 8L9.5 4.5"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </button>

    <div v-else :id="headerId" class="property-panel__header">
      <span class="property-panel__title">{{ title }}</span>
    </div>

    <div :id="bodyId" class="property-panel__body" :class="bodyClass">
      <div class="property-panel__body-inner">
        <slot />
      </div>
    </div>
  </section>
</template>

<style scoped>
.property-panel {
  display: flex;
  flex-direction: column;
  border-bottom: 1px solid var(--color-panel-border, #e5e7eb);
}

.property-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 6px 10px;
  min-height: 32px;
  width: 100%;
  background: var(--color-panel-header-bg, transparent);
}

.property-panel__header--button {
  appearance: none;
  border: none;
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: inherit;
  transition: background-color 100ms ease;
}

@media (prefers-reduced-motion: reduce) {
  .property-panel__header--button {
    transition: none;
  }
}

.property-panel__header--button:hover {
  background-color: var(--color-panel-header-hover, rgba(0, 0, 0, 0.04));
}

.property-panel__header--button:focus-visible {
  outline: 2px solid var(--color-panel-focus-ring, #2563eb);
  outline-offset: -2px;
  border-radius: 2px;
}

.property-panel__title {
  flex: 1;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--color-panel-title, #6b7280);
  user-select: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.property-panel__chevron {
  flex-shrink: 0;
  color: var(--color-panel-chevron, #9ca3af);
  transform: rotate(0deg);
  transition: transform 200ms ease;
}

@media (prefers-reduced-motion: reduce) {
  .property-panel__chevron {
    transition: none;
  }
}

.property-panel__chevron--open {
  transform: rotate(180deg);
}

.property-panel__body {
  display: grid;
  grid-template-rows: 1fr;
  overflow: hidden;
  transition: grid-template-rows 200ms ease;
}

@media (prefers-reduced-motion: reduce) {
  .property-panel__body {
    transition: none;
  }
}

.property-panel__body--open {
  grid-template-rows: 1fr;
}

.property-panel__body--closed {
  grid-template-rows: 0fr;
}

.property-panel__body-inner {
  min-height: 0;
  overflow: hidden;
}
</style>
