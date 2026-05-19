<!--
  GeneralPanel — orkestrator voor de General-tab.

  Vier show-only-if-present-secties:
    1. Weergave            — theme picker + visibility (skip) toggle.
    2. Title & Description — TitleDescriptionEditor.
    3. Badge                — BadgeEditor.
    4. Image                — ImageEditor.

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

// Per-section visibility flags — the inset separators between
// sections are rendered only when BOTH the previous and the next
// section are present, so the divider count tracks the section count.
const hasTheme = computed<boolean>(() => view.state.general?.theme !== null && view.state.general?.theme !== undefined);
const hasSkip = computed<boolean>(
  () => view.currentSummary !== null && view.currentSummary.isSkipped !== null,
);
const hasTitleDesc = computed<boolean>(
  () => titleDescriptionEditor.model !== null && titleDescriptionEditor.model !== undefined,
);
const hasBadge = computed<boolean>(
  () => badgeEditor.model !== null && badgeEditor.model !== undefined,
);
const hasImage = computed<boolean>(
  () => imageEditor.model !== null && imageEditor.model !== undefined,
);

const anyBeforeTitleDesc = computed<boolean>(() => hasTheme.value || hasSkip.value);
const anyBeforeBadge = computed<boolean>(
  () => anyBeforeTitleDesc.value || hasTitleDesc.value,
);
const anyBeforeImage = computed<boolean>(() => anyBeforeBadge.value || hasBadge.value);

function toggleSkip(): void {
  const summary = view.currentSummary;
  if (summary === null) return;
  if (summary.isSkipped === null) return;
  settings.setSkipped(summary.id, !summary.isSkipped);
}

function onThemeChange(modeId: string | null): void {
  const id = view.state.currentSlideId;
  if (id === null) return;
  settings.setTheme(id, modeId);
}
</script>

<template>
  <section class="space-y-2">
    <h2 class="text-base font-semibold text-highlighted px-1">Algemeen</h2>
    <div
      class="rounded-[calc(var(--ui-radius)*4)] bg-default shadow-[0_4px_16px_-6px_rgba(0,0,0,0.08)] overflow-hidden"
    >
      <section v-if="hasTheme" class="px-5 py-4">
        <SlideThemeSwitcher
          :theme="view.state.general!.theme!"
          @update:model-value="onThemeChange"
        />
      </section>

      <div v-if="hasTheme && hasSkip" class="px-5"><USeparator /></div>

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

      <!--
        Editing sections disable when the slide is skipped — but the
        Weergave/skip rows above stay interactive so the user can
        un-hide. `contents` keeps the fieldset transparent so the
        sections inside flow as siblings of the rest of the card.
      -->
      <fieldset
        :disabled="view.currentSummary?.isSkipped === true"
        :class="
          view.currentSummary?.isSkipped === true
            ? 'opacity-50 pointer-events-none'
            : 'contents'
        "
        style="border: 0; padding: 0; margin: 0; min-width: 0"
      >
        <div v-if="anyBeforeTitleDesc && hasTitleDesc" class="px-5"><USeparator /></div>
        <section v-if="hasTitleDesc" class="px-5 py-4">
          <TitleDescriptionEditor
            :model-value="titleDescriptionEditor.model!"
            :accent-pending="titleDescriptionEditor.accentPending"
            @update:model-value="titleDescriptionEditor.update"
            @update:heading-dim="titleDescriptionEditor.updateHeadingDim"
            @commit:size="titleDescriptionEditor.commitSize"
            @commit:visibility="titleDescriptionEditor.commitVisibility"
          />
        </section>

        <div v-if="anyBeforeBadge && hasBadge" class="px-5"><USeparator /></div>
        <section v-if="hasBadge" class="px-5 py-4">
          <BadgeEditor
            :model-value="badgeEditor.model!"
            @update:model-value="badgeEditor.update"
            @commit:visibility="badgeEditor.commitVisibility"
          />
        </section>

        <div v-if="anyBeforeImage && hasImage" class="px-5"><USeparator /></div>
        <section v-if="hasImage" class="px-5 py-4">
          <ImageEditor
            :model-value="imageEditor.model!"
            :preview-url="imageEditor.previewUrl"
            :fill-w="imageEditor.fillW"
            :fill-h="imageEditor.fillH"
            :size-bytes="imageEditor.sizeBytes"
            @upload="imageEditor.upload"
          />
        </section>
      </fieldset>
    </div>
  </section>
</template>
