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
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue';

import SlideSelector from './components/SlideSelector.vue';
import SlideThemeSwitcher from './components/SlideThemeSwitcher.vue';
import GeneralPanel from './components/GeneralPanel.vue';
import ContentPanel from './components/ContentPanel.vue';
import GraphsPanel from './components/GraphsPanel.vue';
import { usePluginBridge } from './composables/usePluginBridge';
import { usePluginView } from './stores/usePluginView';
import { useIconRecents } from './stores/useIconRecents';
import welderLogo from './assets/welder-logo.svg';

const bridge = usePluginBridge();
const view = usePluginView();
const iconRecents = useIconRecents();

// true until the first 'init' message arrives from main thread
const initializing = ref<boolean>(true);
// true while waiting for 'slide-loaded' after a slide pick
const loadingSlide = ref<boolean>(false);

// One-shot guard: when the sandbox hydrates the recents list via
// `setItems`, the deep watcher below would otherwise echo the
// just-loaded array back as a save. Flipped on hydration, consumed
// by the next watcher tick.
let skipIconRecentsSave = false;

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

function toggleSkip(): void {
  const summary = view.currentSummary;
  if (summary === null) return;
  if (summary.isSkipped === null) return;
  bridge.post({
    type: 'set-slide-skipped',
    slideId: summary.id,
    skipped: !summary.isSkipped,
  });
}

function onThemeChange(modeId: string | null): void {
  const id = view.state.currentSlideId;
  if (id === null) return;
  // Optimistic: flip the picker's active swatch immediately. The
  // sandbox confirms with `target-updated` and does NOT re-emit the
  // slide payload, since a theme change doesn't affect content state.
  const theme = view.state.general?.theme;
  if (theme) {
    theme.explicitModeId = modeId;
    if (modeId !== null) theme.resolvedModeId = modeId;
  }
  bridge.post({ type: 'set-slide-theme', slideId: id, modeId });
}

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
  if (msg.type === 'icon-recents') {
    // Sandbox-driven hydration of recently-picked icon names from
    // figma.clientStorage. If the sandbox has nothing stored AND the
    // legacy iframe localStorage key from the pre-Pinia version still
    // holds entries, migrate them once: populate the store, let the
    // watcher persist them to clientStorage, and clear localStorage.
    if (msg.items.length === 0) {
      let migrated: string[] | null = null;
      try {
        const raw = localStorage.getItem('welder-icon-picker-recent');
        if (raw !== null) {
          const parsed = JSON.parse(raw) as unknown;
          if (Array.isArray(parsed) && parsed.length > 0) {
            migrated = (parsed as string[]).slice(0, 8);
            localStorage.removeItem('welder-icon-picker-recent');
          }
        }
      } catch {
        // ignore — corrupt or unreadable; fall through to empty
      }
      if (migrated !== null) {
        // Migration path: don't skip the next save — the sandbox needs
        // to receive these so they survive the next plugin open.
        iconRecents.setItems(migrated);
        return;
      }
    }
    // Skip the echo-save: this setItems is hydrating from the sandbox,
    // not a user action.
    skipIconRecentsSave = true;
    iconRecents.setItems(msg.items);
    return;
  }
  // target-updated: toekomstige save-indicator (T8+). Nu stil negeren.
});

// Persist recents to clientStorage whenever the store mutates (i.e.,
// the user picks an icon in any IconPicker instance). The sandbox's
// `set-icon-recents` handler writes the array verbatim.
watch(
  () => iconRecents.items,
  (next) => {
    if (skipIconRecentsSave) {
      skipIconRecentsSave = false;
      return;
    }
    bridge.post({ type: 'set-icon-recents', items: [...next] });
  },
  { deep: true },
);

onMounted(() => {
  bridge.post({ type: 'ui-ready' });
});

// Belt-and-suspenders for the loadAllPagesAsync window in the sandbox:
// when the plugin iframe regains focus (user tabs back after creating
// or renaming a slide outside), ask the sandbox to re-scan and post the
// current slide list. Sandbox's `postSlideList` is debounced + dedup'd
// so a redundant refresh on focus is cheap.
function onWindowFocus(): void {
  bridge.post({ type: 'refresh-slides' });
}
window.addEventListener('focus', onWindowFocus);
onBeforeUnmount(() => {
  window.removeEventListener('focus', onWindowFocus);
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

            <div class="border-t border-[var(--ui-border)] pt-5 space-y-3">
              <div class="flex items-center gap-2">
                <SlideSelector v-model="currentSlide" :slides="view.state.slides" class="flex-1" />
                <UButton
                  v-if="view.currentSummary && view.currentSummary.isSkipped !== null"
                  :icon="view.currentSummary.isSkipped ? 'i-lucide-eye-off' : 'i-lucide-eye'"
                  variant="ghost"
                  color="neutral"
                  size="md"
                  class="shrink-0"
                  :title="
                    view.currentSummary.isSkipped
                      ? 'Slide is uitgesloten — klik om terug te zetten'
                      : 'Slide overslaan bij presenteren'
                  "
                  @click="toggleSkip"
                />
              </div>
              <UFormField
                v-if="view.state.general?.theme"
                name="slide-theme"
                label="Thema"
                size="md"
              >
                <SlideThemeSwitcher
                  :theme="view.state.general.theme"
                  @update:model-value="onThemeChange"
                />
              </UFormField>
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
              v-if="view.noSlide"
              class="bg-default rounded-[calc(var(--ui-radius)*4)] px-5 py-8 shadow-[0_4px_16px_-6px_rgba(0,0,0,0.08)]"
            >
              <p class="text-sm text-muted">Selecteer een slide om te beginnen.</p>
            </section>

            <!-- Slide selected but nothing editable -->
            <section
              v-else-if="view.allEmpty"
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
              :disabled="view.isSkipped"
              :class="
                view.isSkipped ? 'space-y-3 opacity-50 pointer-events-none' : 'contents space-y-3'
              "
              style="border: 0; padding: 0; margin: 0; min-width: 0"
            >
              <GeneralPanel v-if="view.hasGeneral" />
              <ContentPanel v-if="view.hasContent" />
              <GraphsPanel v-if="view.hasGraphs" />
            </fieldset>
          </template>
        </div>
      </main>
    </div>
  </UApp>
</template>
