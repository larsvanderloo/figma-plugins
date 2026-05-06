<!--
  SlideSelector — header-dropdown voor slide-keuze.

  Nuxt UI `<USelectMenu>` variant omdat we vrij-indrukbaar willen zijn
  bij lange slide-titels (USelect rendert als native <select> en capt de
  breedte rigide). items wordt afgeleid van `slides`-prop; label-format:
  "Slide N — Titel".

  Props + emits volgen v-model-contract zodat App.vue de selectie kan
  binden via `v-model`; de parent triggert vervolgens de `pick-slide`
  bridge-message.
-->
<script setup lang="ts">
import { computed } from 'vue';
import type { SlideSummary } from '../../types';

interface Props {
  slides: SlideSummary[];
  modelValue: string | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: string | null];
}>();

interface SlideItem {
  label: string;
  value: string;
}

const items = computed<SlideItem[]>(() => {
  return props.slides.map((slide) => ({
    label: `${slide.number}. ${slide.name}`,
    value: slide.id,
  }));
});

// v-model bridge. USelectMenu verwacht string | undefined; we converteren
// null → undefined in de getter en undefined → null in de setter zodat
// de parent-typing (string | null) strak blijft.
const selected = computed<string | undefined>({
  get() {
    return props.modelValue ?? undefined;
  },
  set(next: string | undefined) {
    emit('update:modelValue', next === undefined ? null : next);
  },
});

const disabled = computed(() => props.slides.length === 0);
</script>

<template>
  <USelectMenu
    v-model="selected"
    :items="items"
    value-key="value"
    :disabled="disabled"
    placeholder="Pick a slide"
    size="md"
    class="min-w-[260px] max-w-[420px]"
  />
</template>
