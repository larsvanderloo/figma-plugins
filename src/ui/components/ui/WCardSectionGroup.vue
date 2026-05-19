<template>
  <div class="w-card-section-group">
    <slot />
  </div>
</template>

<style scoped>
.w-card-section-group :deep(.w-card-section + .w-card-section)::before {
  content: '';
  display: block;
  height: 1px;
  margin: 0 1rem;
  background: var(--ui-border);
  transform: translateY(-1rem);
}
</style>
