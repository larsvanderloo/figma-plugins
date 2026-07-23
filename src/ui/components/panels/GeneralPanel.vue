<script setup lang="ts">
import { computed } from 'vue';
import TitleDescriptionEditor from '../editors/TitleDescriptionEditor.vue';
import ImageEditor from '../editors/ImageEditor.vue';
import SlideThemeSwitcher from '../editors/SlideThemeSwitcher.vue';
import EditorWrapper from '../ui/EditorWrapper.vue';
import WCard from '../ui/WCard.vue';
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

const showThemeSection = computed<boolean>(
  () => view.state.general?.theme !== null && view.state.general?.theme !== undefined,
);
const showVisibilitySection = computed<boolean>(
  () => view.currentSummary !== null && view.currentSummary.isSkipped !== null,
);
const showConfidentialSection = computed<boolean>(
  () =>
    view.state.general?.confidential !== null && view.state.general?.confidential !== undefined,
);
const showSlideSettings = computed<boolean>(
  () => showThemeSection.value || showVisibilitySection.value || showConfidentialSection.value,
);
const showCopyWrap = computed<boolean>(
  () => titleDescriptionEditor.model !== null || badgeEditor.model !== null,
);
const showImageWrap = computed<boolean>(() => imageEditor.model !== null);
const editingDisabled = computed<boolean>(() => view.currentSummary?.isSkipped === true);

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

// No 'off' item with an empty value here: Reka UI (under USelect) silently
// drops items whose value is '' — on/off lives on the switch, not the dropdown.
const confidentialItems = computed<Array<{ label: string; value: string }>>(() => {
  const conf = view.state.general?.confidential;
  if (!conf) return [];
  return conf.variantOptions.map((v) => ({ label: v, value: v }));
});
// Fall back to the first option so the select never renders empty while the badge is on.
const confidentialVariant = computed<string>(() => {
  const conf = view.state.general?.confidential;
  if (!conf) return '';
  return conf.variant ?? conf.variantOptions[0] ?? '';
});
const showConfidentialVariant = computed<boolean>(() => {
  const conf = view.state.general?.confidential;
  return !!conf && conf.show && conf.variantOptions.length > 0;
});

function onConfidentialToggle(show: boolean): void {
  const id = view.state.currentSlideId;
  if (id === null) return;
  // Send the displayed variant along when switching on so the canvas badge matches the picker.
  const variant = show && confidentialVariant.value !== '' ? confidentialVariant.value : undefined;
  settings.setConfidential(id, show, variant);
}

function onConfidentialVariantChange(value: string): void {
  const id = view.state.currentSlideId;
  if (id === null) return;
  settings.setConfidential(id, true, value);
}
</script>

<template>
  <UContainer class="space-y-4">
    <EditorWrapper v-if="showSlideSettings" title="Slide-instellingen">
      <WCard>
        <SlideThemeSwitcher
          v-if="showThemeSection"
          :theme="view.state.general!.theme!"
          @update:model-value="onThemeChange"
        />
        <USeparator v-if="showThemeSection && showVisibilitySection" />
        <USwitch
          v-if="showVisibilitySection"
          :model-value="!view.currentSummary!.isSkipped"
          label="In presentatie tonen"
          data-tour="presentatie-tonen"
          :ui="{ root: 'flex-row-reverse justify-between w-full', wrapper: 'ms-0' }"
          @update:model-value="toggleSkip"
        />
        <USeparator
          v-if="(showThemeSection || showVisibilitySection) && showConfidentialSection"
        />
        <USwitch
          v-if="showConfidentialSection"
          :model-value="view.state.general!.confidential!.show"
          label="Vertrouwelijkheidslabel tonen"
          :ui="{ root: 'flex-row-reverse justify-between w-full', wrapper: 'ms-0' }"
          @update:model-value="onConfidentialToggle"
        />
        <div
          v-if="showConfidentialVariant"
          class="flex items-center justify-between gap-3"
        >
          <span class="text-sm text-muted">Soort</span>
          <USelect
            :model-value="confidentialVariant"
            :items="confidentialItems"
            value-key="value"
            class="min-w-44"
            aria-label="Soort vertrouwelijkheidslabel"
            @update:model-value="onConfidentialVariantChange"
          />
        </div>
      </WCard>
    </EditorWrapper>

    <EditorWrapper v-if="showCopyWrap" title="Titel en Omschrijving">
      <fieldset :disabled="editingDisabled" class="m-0 min-w-0 border-0 p-0 space-y-4">
        <TitleDescriptionEditor />
      </fieldset>
    </EditorWrapper>

    <EditorWrapper v-if="showImageWrap" title="Afbeelding" data-tour="afbeelding">
      <fieldset :disabled="editingDisabled" class="m-0 min-w-0 border-0 p-0">
        <ImageEditor />
      </fieldset>
    </EditorWrapper>
  </UContainer>
</template>
