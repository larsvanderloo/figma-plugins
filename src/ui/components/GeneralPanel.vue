<!--
  GeneralPanel — orkestrator voor de General-tab (spec §9 T7-T10).

  Drie show-only-if-present-secties:
    1. Title & Description — TitleDescriptionEditor (T8, live).
    2. Badge                — BadgeEditor (T9, live).
    3. Image                — ImageEditor (T10, live — fill-replace only).

  Elke sectie rendert alleen als de bijbehorende composable een non-null
  model exposeert (de composable wikkelt store + bridge).
-->
<script setup lang="ts">
import TitleDescriptionEditor from './TitleDescriptionEditor.vue';
import BadgeEditor from './BadgeEditor.vue';
import ImageEditor from './ImageEditor.vue';
import { useTitleDescriptionEditor } from '../composables/useTitleDescriptionEditor';
import { useBadgeEditor } from '../composables/useBadgeEditor';
import { useImageEditor } from '../composables/useImageEditor';

const titleDescriptionEditor = useTitleDescriptionEditor();
const badgeEditor = useBadgeEditor();
const imageEditor = useImageEditor();
</script>

<template>
  <div
    class="rounded-[calc(var(--ui-radius)*4)] bg-default shadow-[0_4px_16px_-6px_rgba(0,0,0,0.08)] overflow-hidden divide-y divide-[var(--ui-border)]"
  >
    <section v-if="titleDescriptionEditor.model" class="space-y-4 px-5 py-6">
      <h3 class="text-sm font-semibold text-highlighted">Titel & omschrijving</h3>
      <TitleDescriptionEditor
        :model-value="titleDescriptionEditor.model"
        @update:model-value="titleDescriptionEditor.update"
        @update:heading-dim="titleDescriptionEditor.updateHeadingDim"
      />
    </section>

    <section v-if="badgeEditor.model" class="space-y-4 px-5 py-6">
      <h3 class="text-sm font-semibold text-highlighted">Badge</h3>
      <BadgeEditor :model-value="badgeEditor.model" @update:model-value="badgeEditor.update" />
    </section>

    <section v-if="imageEditor.model" class="space-y-4 px-5 py-6">
      <h3 class="text-sm font-semibold text-highlighted">Afbeelding</h3>
      <ImageEditor
        :model-value="imageEditor.model"
        :preview-url="imageEditor.previewUrl"
        :fill-w="imageEditor.fillW"
        :fill-h="imageEditor.fillH"
        :size-bytes="imageEditor.sizeBytes"
        @upload="imageEditor.upload"
      />
    </section>
  </div>
</template>
