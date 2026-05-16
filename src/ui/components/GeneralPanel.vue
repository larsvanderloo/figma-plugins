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
      class="rounded-[calc(var(--ui-radius)*4)] bg-default shadow-[0_4px_16px_-6px_rgba(0,0,0,0.08)] overflow-hidden divide-y divide-default"
    >
      <section
        v-if="
          view.state.general?.theme ||
          (view.currentSummary && view.currentSummary.isSkipped !== null)
        "
        class="space-y-4 px-5 py-6"
      >
        <h3 class="text-sm font-medium text-default">Weergave</h3>
        <div class="flex items-center gap-2">
          <SlideThemeSwitcher
            v-if="view.state.general?.theme"
            :theme="view.state.general.theme"
            @update:model-value="onThemeChange"
          />
          <span
            v-if="
              view.state.general?.theme &&
              view.currentSummary &&
              view.currentSummary.isSkipped !== null
            "
            class="h-6 w-px bg-border mx-1"
            aria-hidden="true"
          />
          <button
            v-if="view.currentSummary && view.currentSummary.isSkipped !== null"
            type="button"
            class="relative h-8 rounded-full transition-colors flex items-center gap-1.5 px-3 text-sm focus:outline-none overflow-hidden"
            :class="
              view.currentSummary.isSkipped
                ? 'bg-primary/10 text-primary ring-2 ring-primary'
                : 'bg-elevated text-default hover:bg-accented/60'
            "
            :title="
              view.currentSummary.isSkipped
                ? 'Slide is uitgesloten — klik om terug te zetten'
                : 'Slide overslaan bij presenteren'
            "
            :aria-label="
              view.currentSummary.isSkipped ? 'Slide tonen' : 'Slide overslaan'
            "
            :aria-pressed="view.currentSummary.isSkipped"
            @click="toggleSkip"
          >
            <Transition
              mode="out-in"
              enter-active-class="transition duration-200 ease-out"
              enter-from-class="opacity-0 -translate-x-2"
              leave-active-class="transition duration-200 ease-in"
              leave-to-class="opacity-0 translate-x-2"
            >
              <UIcon
                :key="view.currentSummary.isSkipped ? 'off' : 'on'"
                :name="view.currentSummary.isSkipped ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                class="size-4"
              />
            </Transition>
            <Transition
              mode="out-in"
              enter-active-class="transition-opacity duration-150"
              enter-from-class="opacity-0"
              leave-active-class="transition-opacity duration-150"
              leave-to-class="opacity-0"
            >
              <span
                :key="view.currentSummary.isSkipped ? 'hidden' : 'visible'"
                class="text-xs font-medium"
              >
                {{ view.currentSummary.isSkipped ? 'Verborgen' : 'Zichtbaar' }}
              </span>
            </Transition>
          </button>
        </div>
      </section>

      <!--
        Editing sections disable when the slide is skipped — but the
        Weergave section above stays interactive so the user can
        un-hide. `contents` keeps the fieldset transparent so the
        divide-y siblings still get borders between them.
      -->
      <fieldset
        :disabled="view.currentSummary?.isSkipped === true"
        :class="
          view.currentSummary?.isSkipped === true
            ? 'opacity-50 pointer-events-none divide-y divide-default'
            : 'contents'
        "
        style="border: 0; padding: 0; margin: 0; min-width: 0"
      >
        <section v-if="titleDescriptionEditor.model" class="space-y-4 px-5 py-6">
          <h3 class="text-sm font-medium text-default">Titel & omschrijving</h3>
          <TitleDescriptionEditor
            :model-value="titleDescriptionEditor.model"
            @update:model-value="titleDescriptionEditor.update"
            @update:heading-dim="titleDescriptionEditor.updateHeadingDim"
            @commit:size="titleDescriptionEditor.commitSize"
            @commit:visibility="titleDescriptionEditor.commitVisibility"
          />
        </section>

        <section v-if="badgeEditor.model" class="space-y-4 px-5 py-6">
          <h3 class="text-sm font-medium text-default">Badge</h3>
          <BadgeEditor
            :model-value="badgeEditor.model"
            @update:model-value="badgeEditor.update"
            @commit:visibility="badgeEditor.commitVisibility"
          />
        </section>

        <section v-if="imageEditor.model" class="space-y-4 px-5 py-6">
          <h3 class="text-sm font-medium text-default">Afbeelding</h3>
          <ImageEditor
            :model-value="imageEditor.model"
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
