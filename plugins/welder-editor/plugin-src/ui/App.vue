<!--
  Welder Slide Editor — iframe root (T6 chassis).

  Layout volgt chart-builder's App.vue-template (project_widget_template):
    - Header: welder-logo (links) + SlideSelector (midden) + close-knop (rechts).
    - Body: gestapelde panelen (General / Content / Graphs) in cards met
      rounded corners + shadow. Tabs zijn verwijderd; alle aanwezige panelen
      verschijnen verticaal op één pagina.
    - Empty-state wanneer geen slide gekozen óf de gekozen slide geen
      bewerkbare wrappers heeft.

  Bridge-wiring:
    - onMounted: `onMessage`-handler voor init / slide-loaded / page-changed
      en daarna `ui-ready` posten.
    - SlideSelector-wijziging: pickSlide-store + `pick-slide` bridge.
    - Panels zelf blijven leeg — T7-T14 vullen de drie slots in.
-->
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

import SlideSelector from './components/SlideSelector.vue';
import GeneralPanel from './components/GeneralPanel.vue';
import ContentPanel from './components/ContentPanel.vue';
import GraphsPanel from './components/GraphsPanel.vue';
import { usePluginBridge } from './composables/usePluginBridge';
import { usePluginView } from './stores/usePluginView';
import welderLogo from './assets/welder-logo.svg';
import type { SlideSummary } from '../types';

const bridge = usePluginBridge();
const view = usePluginView();

// true until the first 'init' message arrives from main thread
const initializing = ref<boolean>(true);
// true while waiting for 'slide-loaded' after a slide pick
const loadingSlide = ref<boolean>(false);

// Bind current slide via computed<get/set> zodat SlideSelector's v-model
// direct de store muteert + een pick-slide-bericht triggert.
const currentSlide = computed<string | null>({
  get() {
    return view.state.currentSlideId;
  },
  set(next: string | null) {
    view.pickSlide(next);
    if (next !== null) {
      loadingSlide.value = true;
      bridge.post({ type: 'pick-slide', slideId: next });
    }
  },
});

// Empty-state logic. Wanneer er geen slide gekozen is tonen we een
// globale placeholder.
const noSlide = computed(() => view.state.currentSlideId === null);

// Summary van de actieve slide — gebruikt door de skip-toggle (eye-icon)
// om `isSkipped` te lezen en het juiste icon + tooltip te tonen.
const currentSummary = computed<SlideSummary | null>(() => {
  const id = view.state.currentSlideId;
  if (id === null) return null;
  const match = view.state.slides.find((s) => s.id === id);
  return match !== undefined ? match : null;
});

function toggleSkip(): void {
  const summary = currentSummary.value;
  if (summary === null) return;
  if (summary.isSkipped === null) return;
  bridge.post({
    type: 'set-slide-skipped',
    slideId: summary.id,
    skipped: !summary.isSkipped,
  });
}

// true wanneer de actieve slide in Figma op "skip bij presenteren" staat.
// Alle editor-panels worden in dat geval gedisabled + gedempt — de user
// moet eerst het oogje terugzetten om te editen.
const isSkipped = computed<boolean>(() => {
  const summary = currentSummary.value;
  return summary !== null && summary.isSkipped === true;
});

// Panel filled? Bepaalt of we de placeholder tonen dan wel de slot-inhoud.
const hasGeneral = computed(() => !noSlide.value && view.state.general !== null);
const hasContent = computed(() => !noSlide.value && view.state.content !== null);
const hasGraphs = computed(() => !noSlide.value && view.state.graphs !== null);

// Gecombineerde empty-state wanneer alle drie panels null zijn.
const allEmpty = computed(
  () =>
    !noSlide.value &&
    view.state.general === null &&
    view.state.content === null &&
    view.state.graphs === null,
);

// Register bridge-handlers vóór de ui-ready handshake zodat we het init-
// bericht niet missen (main kan onmiddellijk terugantwoorden).
bridge.onMessage((msg) => {
  if (msg.type === 'init') {
    view.setSlides(msg.slides);
    if (msg.initialSlideId !== null) {
      currentSlide.value = msg.initialSlideId;
    }
    initializing.value = false;
    return;
  }
  if (msg.type === 'slide-loaded') {
    // Defensief: main kan `slide-loaded` sturen voor een slide die de user
    // intussen gewisseld heeft. Alleen accepteren als id matcht.
    if (msg.slideId === view.state.currentSlideId) {
      view.setSlidePayload(msg.general, msg.content, msg.graphs);
      loadingSlide.value = false;
    }
    return;
  }
  if (msg.type === 'page-changed') {
    view.setSlides(msg.slides);
    // Als huidige slide niet meer bestaat op de nieuwe pagina: reset.
    const stillThere = msg.slides.some((s) => s.id === view.state.currentSlideId);
    if (!stillThere) view.pickSlide(null);
    return;
  }
  if (msg.type === 'slide-focused') {
    // Auto-follow: switch dropdown only wanneer de user daadwerkelijk een
    // andere slide heeft gekozen — voorkomt lelijke re-loads wanneer de
    // user binnen dezelfde slide klikt.
    if (view.state.currentSlideId !== msg.slideId) {
      view.pickSlide(msg.slideId);
      bridge.post({ type: 'pick-slide', slideId: msg.slideId });
      loadingSlide.value = true;
    }
    return;
  }
  // target-updated: toekomstige save-indicator (T8+). Nu stil negeren.
});

onMounted(() => {
  bridge.post({ type: 'ui-ready' });
});
</script>

<template>
  <UApp>
    <!-- Skeleton: plugin initializing — shown until 'init' arrives -->
    <div v-if="initializing" class="flex h-full flex-col bg-elevated text-default">
      <main class="flex-1 overflow-y-auto">
        <div class="mx-auto max-w-2xl space-y-3 p-3">
          <section
            class="bg-default rounded-[calc(var(--ui-radius)*4)] px-5 py-8 shadow-[0_4px_16px_-6px_rgba(0,0,0,0.08)] space-y-5"
          >
            <div class="flex flex-col items-center space-y-3">
              <USkeleton class="h-12 w-32" />
              <USkeleton class="h-4 w-3/4" />
              <USkeleton class="h-4 w-1/2" />
            </div>
            <div class="space-y-2">
              <USkeleton class="h-4 w-10" />
              <USkeleton class="h-9 w-full" />
            </div>
          </section>
          <section
            class="bg-default rounded-[calc(var(--ui-radius)*4)] px-5 py-8 shadow-[0_4px_16px_-6px_rgba(0,0,0,0.08)] space-y-3"
          >
            <USkeleton class="h-4 w-32" />
            <USkeleton class="h-9 w-full" />
            <USkeleton class="h-20 w-full" />
          </section>
        </div>
      </main>
    </div>

    <!-- Real UI — shown once 'init' received -->
    <div v-else class="flex h-full flex-col bg-elevated text-default">
      <main class="flex-1 overflow-y-auto">
        <div class="mx-auto max-w-2xl space-y-3 p-3">
          <!-- Header-card: logo + intro + slide selector -->
          <section
            class="bg-default rounded-[calc(var(--ui-radius)*4)] px-5 py-8 shadow-[0_4px_16px_-6px_rgba(0,0,0,0.08)] space-y-5"
          >
            <div class="flex flex-col items-center text-center space-y-3">
              <img :src="welderLogo" alt="Welder" class="h-12 w-auto" />
              <p class="text-base text-muted max-w-xs">
                Selecteer een slide en wijzig de titel, het onderschrift en andere content.
              </p>
            </div>

            <div class="border-t border-[var(--ui-border)] pt-5">
              <div class="flex items-center gap-2">
                <SlideSelector v-model="currentSlide" :slides="view.state.slides" class="flex-1" />
                <UButton
                  v-if="currentSummary && currentSummary.isSkipped !== null"
                  :icon="currentSummary.isSkipped ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                  variant="ghost"
                  color="neutral"
                  size="md"
                  class="shrink-0"
                  :title="
                    currentSummary.isSkipped
                      ? 'Slide is uitgesloten — klik om terug te zetten'
                      : 'Slide overslaan bij presenteren'
                  "
                  @click="toggleSkip"
                />
              </div>
            </div>
          </section>

          <!-- Skeleton: slide loading — shown after pick-slide until
               slide-loaded arrives. -->
          <template v-if="loadingSlide">
            <section
              class="bg-default rounded-[calc(var(--ui-radius)*4)] px-5 py-8 shadow-[0_4px_16px_-6px_rgba(0,0,0,0.08)] space-y-3"
            >
              <USkeleton class="h-4 w-32" />
              <USkeleton class="h-9 w-full" />
              <USkeleton class="h-20 w-full" />
            </section>
            <section
              class="bg-default rounded-[calc(var(--ui-radius)*4)] px-5 py-8 shadow-[0_4px_16px_-6px_rgba(0,0,0,0.08)] space-y-3"
            >
              <USkeleton class="h-4 w-24" />
              <USkeleton class="h-9 w-full" />
              <USkeleton class="h-9 w-2/3" />
            </section>
          </template>

          <!-- Content-area: gestapeld — elk panel beheert zijn eigen
               card-layout. Empty-states worden getoond wanneer er geen
               slide geselecteerd is of geen bewerkbare inhoud aanwezig is.
          -->
          <template v-else>
            <!-- No slide selected -->
            <section
              v-if="noSlide"
              class="bg-default rounded-[calc(var(--ui-radius)*4)] px-5 py-8 shadow-[0_4px_16px_-6px_rgba(0,0,0,0.08)]"
            >
              <p class="text-sm text-muted">Selecteer een slide om te beginnen.</p>
            </section>

            <!-- Slide selected but nothing editable -->
            <section
              v-else-if="allEmpty"
              class="bg-default rounded-[calc(var(--ui-radius)*4)] px-5 py-8 shadow-[0_4px_16px_-6px_rgba(0,0,0,0.08)]"
            >
              <p class="text-sm text-muted">Geen bewerkbare inhoud op deze slide.</p>
            </section>

            <!-- Stacked panels — each panel manages its own card layout.
                 Wrapped in een <fieldset disabled> zodat alle form-controls
                 automatisch disabled worden wanneer de slide is uitgesloten
                 van presenteren (oogje uit). `contents` haalt fieldset uit
                 layout zodat de parent `space-y-3` de panel-gaps blijft
                 regelen; bij skipped schakelen we over naar een wrapping
                 variant met `opacity-50 pointer-events-none` voor visuele
                 feedback + extra click-block (een fieldset::disabled alleen
                 blokkeert de form-controls, niet de container-klikken). -->
            <fieldset
              v-else
              :disabled="isSkipped"
              :class="isSkipped ? 'space-y-3 opacity-50 pointer-events-none' : 'contents space-y-3'"
              style="border: 0; padding: 0; margin: 0; min-width: 0"
            >
              <GeneralPanel v-if="hasGeneral" />
              <ContentPanel v-if="hasContent" />
              <GraphsPanel v-if="hasGraphs" />
            </fieldset>
          </template>
        </div>
      </main>
    </div>
  </UApp>
</template>
