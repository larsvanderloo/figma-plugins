<template>
  <div class="global-card-section-group">
    <slot />
  </div>
</template>

<style scoped>
.global-card-section-group :deep(.global-card-section + .global-card-section)::before {
  content: '';
  display: block;
  height: 1px;
  margin: 0 1rem;
  background: var(--ui-border);
  transform: translateY(-1rem);
}
</style>
