<!--
  GeneralPanel — orkestrator voor de General-tab.

  Vier show-only-if-present-secties:
    1. Presentatie — theme picker + visibility (skip) toggle.
    2. Tekst       — TitleDescriptionEditor.
    3. Badge       — BadgeEditor.
    4. Afbeelding  — ImageEditor.

  Elke sectie rendert alleen als de bijbehorende composable een non-null
  model exposeert (de composable wikkelt store + bridge).
-->
<script setup lang="ts">
import { computed } from 'vue';
import TitleDescriptionEditor from './TitleDescriptionEditor.vue';
import BadgeEditor from './BadgeEditor.vue';
import ImageEditor from './ImageEditor.vue';
import SlideThemeSwitcher from './SlideThemeSwitcher.vue';
import { useTitleDescriptionEditor } from '../composables/useTitleDescriptionEditor';
import { useBadgeEditor } from '../composables/useBadgeEditor';
import { useImageEditor } from '../composables/useImageEditor';
import { useSlideSettings } from '../composables/useSlideSettings';
import { usePluginView } from '../stores/usePluginView';

const titleDescriptionEditor = useTitleDescriptionEditor();
const badgeEditor = useBadgeEditor();
const imageEditor = useImageEditor();
const view = usePluginView();
const settings = useSlideSettings();

const hasTheme = computed<boolean>(() => view.state.general?.theme !== null && view.state.general?.theme !== undefined);
const hasSkip = computed<boolean>(
  () => view.currentSummary !== null && view.currentSummary.isSkipped !== null,
);
const hasPresentation = computed<boolean>(() => hasTheme.value || hasSkip.value);
const hasTitleDesc = computed<boolean>(
  () => titleDescriptionEditor.model !== null && titleDescriptionEditor.model !== undefined,
);
const hasBadge = computed<boolean>(
  () => badgeEditor.model !== null && badgeEditor.model !== undefined,
);
const hasImage = computed<boolean>(
  () => imageEditor.model !== null && imageEditor.model !== undefined,
);

function toggleSkip(visibleInPresentation: boolean): void {
  const summary = view.currentSummary;
  if (summary === null) return;
  if (summary.isSkipped === null) return;
  settings.setSkipped(summary.id, !visibleInPresentation);
}

function onThemeChange(modeId: string | null): void {
  const id = view.state.currentSlideId;
  if (id === null) return;
  settings.setTheme(id, modeId);
}
</script>

<template>
  <section class="space-y-3">
    <h2 class="text-base font-semibold text-highlighted px-1">Basis</h2>
    <div
      v-if="hasPresentation"
      class="rounded-[calc(var(--ui-radius)*4)] bg-default shadow-[0_4px_16px_-6px_rgba(0,0,0,0.08)] overflow-hidden divide-y divide-default"
    >
      <div class="px-5 py-3">
        <h3 class="text-sm font-semibold text-highlighted">Presentatie</h3>
      </div>

      <section v-if="hasTheme" class="px-5 py-4">
        <SlideThemeSwitcher
          :theme="view.state.general!.theme!"
          @update:model-value="onThemeChange"
        />
      </section>

      <section v-if="hasSkip" class="px-5 py-4">
        <div class="flex items-center justify-between gap-3">
          <span class="text-sm font-medium text-default">In presentatie tonen</span>
          <USwitch
            :model-value="!view.currentSummary!.isSkipped"
            size="xs"
            @update:model-value="toggleSkip"
          />
        </div>
      </section>
    </div>

    <!--
      Editing sections disable when the slide is skipped — but the
      Presentatie/skip rows above stay interactive so the user can
      un-hide the slide.
    -->
    <fieldset
      :disabled="view.currentSummary?.isSkipped === true"
      :class="
        view.currentSummary?.isSkipped === true
          ? 'space-y-3 opacity-50 pointer-events-none'
          : 'space-y-3'
      "
      style="border: 0; padding: 0; margin: 0; min-width: 0"
    >
      <div
        v-if="hasTitleDesc"
        class="rounded-[calc(var(--ui-radius)*4)] bg-default shadow-[0_4px_16px_-6px_rgba(0,0,0,0.08)] overflow-hidden divide-y divide-default"
      >
        <div class="px-5 py-3">
          <h3 class="text-sm font-semibold text-highlighted">Tekst</h3>
        </div>
        <section class="px-5 py-4">
          <TitleDescriptionEditor
            :model-value="titleDescriptionEditor.model!"
            :accent-pending="titleDescriptionEditor.accentPending"
            @update:model-value="titleDescriptionEditor.update"
            @update:heading-dim="titleDescriptionEditor.updateHeadingDim"
            @commit:heading-dim="titleDescriptionEditor.flushHeadingDim"
            @commit:size="titleDescriptionEditor.commitSize"
            @commit:visibility="titleDescriptionEditor.commitVisibility"
          />
        </section>
      </div>

      <div
        v-if="hasBadge"
        class="rounded-[calc(var(--ui-radius)*4)] bg-default shadow-[0_4px_16px_-6px_rgba(0,0,0,0.08)] overflow-hidden divide-y divide-default"
      >
        <div class="px-5 py-3">
          <h3 class="text-sm font-semibold text-highlighted">Badge</h3>
        </div>
        <section class="px-5 py-4">
          <BadgeEditor
            :model-value="badgeEditor.model!"
            @update:model-value="badgeEditor.update"
            @commit:visibility="badgeEditor.commitVisibility"
          />
        </section>
      </div>

      <div
        v-if="hasImage"
        class="rounded-[calc(var(--ui-radius)*4)] bg-default shadow-[0_4px_16px_-6px_rgba(0,0,0,0.08)] overflow-hidden divide-y divide-default"
      >
        <div class="px-5 py-3">
          <h3 class="text-sm font-semibold text-highlighted">Afbeelding</h3>
        </div>
        <section class="px-5 py-4">
          <ImageEditor
            :model-value="imageEditor.model!"
            :preview-url="imageEditor.previewUrl"
            :fill-w="imageEditor.fillW"
            :fill-h="imageEditor.fillH"
            :size-bytes="imageEditor.sizeBytes"
            @upload="imageEditor.upload"
          />
        </section>
      </div>
    </fieldset>
  </section>
</template>
