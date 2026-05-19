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
import TitleDescriptionEditor from '../editors/TitleDescriptionEditor.vue';
import BadgeEditor from '../editors/BadgeEditor.vue';
import ImageEditor from '../editors/ImageEditor.vue';
import SlideThemeSwitcher from '../editors/SlideThemeSwitcher.vue';
import WCard from '../ui/WCard.vue';
import WCardSection from '../ui/WCardSection.vue';
import WCardSectionGroup from '../ui/WCardSectionGroup.vue';
import { useTitleDescriptionEditor } from '../../composables/useTitleDescriptionEditor';
import { useBadgeEditor } from '../../composables/useBadgeEditor';
import { useImageEditor } from '../../composables/useImageEditor';
import { useSlideSettings } from '../../composables/useSlideSettings';
import { usePluginView } from '../../stores/usePluginView';

const titleDescriptionEditor = useTitleDescriptionEditor();
const badgeEditor = useBadgeEditor();
const imageEditor = useImageEditor();
const view = usePluginView();
const settings = useSlideSettings();

const showThemeSection = computed<boolean>(() => view.state.general?.theme !== null && view.state.general?.theme !== undefined);
const showPresentationVisibilitySection = computed<boolean>(
  () => view.currentSummary !== null && view.currentSummary.isSkipped !== null,
);
const showPresentationSections = computed<boolean>(() => showThemeSection.value || showPresentationVisibilitySection.value);
const showTextSection = computed<boolean>(
  () => titleDescriptionEditor.model !== null && titleDescriptionEditor.model !== undefined,
);
const showBadgeSection = computed<boolean>(
  () => badgeEditor.model !== null && badgeEditor.model !== undefined,
);
const showImageSection = computed<boolean>(
  () => imageEditor.model !== null && imageEditor.model !== undefined,
);
const showEditingSections = computed<boolean>(
  () => showTextSection.value || showBadgeSection.value || showImageSection.value,
);
const showAnySection = computed<boolean>(() => showPresentationSections.value || showEditingSections.value);
const editingSectionsDisabled = computed<boolean>(() => view.currentSummary?.isSkipped === true);

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
  <section v-if="showAnySection" class="space-y-3">
    <WCard title="Basis" title-tag="h2" segmented>
      <WCardSectionGroup>
        <WCardSection v-if="showThemeSection">
          <SlideThemeSwitcher
            :theme="view.state.general!.theme!"
            @update:model-value="onThemeChange"
          />
        </WCardSection>

        <WCardSection v-if="showPresentationVisibilitySection">
          <USwitch
            :model-value="!view.currentSummary!.isSkipped"
            label="In presentatie tonen"
            size="xs"
            :ui="{
              root: 'w-full flex-row-reverse items-center justify-between',
              wrapper: 'ms-0',
              label: 'text-sm font-medium text-default',
            }"
            @update:model-value="toggleSkip"
          />
        </WCardSection>

        <WCardSection
          v-if="showTextSection"
          :disabled="editingSectionsDisabled"
          spacious
        >
          <h3 class="text-sm font-medium text-highlighted">Tekst</h3>
          <TitleDescriptionEditor
            :model-value="titleDescriptionEditor.model!"
            :accent-pending="titleDescriptionEditor.accentPending"
            @update:model-value="titleDescriptionEditor.update"
            @update:heading-dim="titleDescriptionEditor.updateHeadingDim"
            @commit:heading-dim="titleDescriptionEditor.flushHeadingDim"
            @commit:size="titleDescriptionEditor.commitSize"
            @commit:visibility="titleDescriptionEditor.commitVisibility"
          />
        </WCardSection>

        <WCardSection
          v-if="showBadgeSection"
          :disabled="editingSectionsDisabled"
          spacious
        >
          <h3 class="text-sm font-medium text-highlighted">Badge</h3>
          <BadgeEditor
            :model-value="badgeEditor.model!"
            @update:model-value="badgeEditor.update"
            @commit:visibility="badgeEditor.commitVisibility"
          />
        </WCardSection>

        <WCardSection
          v-if="showImageSection"
          :disabled="editingSectionsDisabled"
          spacious
        >
          <h3 class="text-sm font-medium text-highlighted">Afbeelding</h3>
          <ImageEditor
            :model-value="imageEditor.model!"
            :preview-url="imageEditor.previewUrl"
            :fill-w="imageEditor.fillW"
            :fill-h="imageEditor.fillH"
            :size-bytes="imageEditor.sizeBytes"
            @upload="imageEditor.upload"
          />
        </WCardSection>
      </WCardSectionGroup>
    </WCard>
  </section>
</template>
