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
import { useToast } from '@nuxt/ui/composables';

import { PDFDocument } from 'pdf-lib';

import SlideSelector from './components/SlideSelector.vue';

// Constant PDF metadata applied to every Welder export. Title is set
// per-document by the caller. Copyright lives in /Subject because
// pdf-lib has no first-class XMP rights API and /Subject is the
// closest standard /Info slot every PDF reader surfaces.
const PDF_AUTHOR = 'Welder B.V.';
const PDF_CREATOR = 'Welder Slide Editor';
const PDF_PRODUCER = 'Welder Slide Editor';
const PDF_KEYWORDS = ['Welder', 'Welder Slide Editor', 'presentation', 'slides'];
const PDF_LANGUAGE = 'nl-NL';

function applyPdfMetadata(doc: PDFDocument, title: string): void {
  const now = new Date();
  doc.setTitle(title);
  doc.setAuthor(PDF_AUTHOR);
  doc.setCreator(PDF_CREATOR);
  doc.setProducer(PDF_PRODUCER);
  doc.setSubject(
    '© ' +
      String(now.getFullYear()) +
      ' Welder B.V. Alle rechten voorbehouden. ' +
      'Gemaakt met Welder Slide Editor.',
  );
  doc.setKeywords(PDF_KEYWORDS);
  doc.setLanguage(PDF_LANGUAGE);
  doc.setCreationDate(now);
  doc.setModificationDate(now);
}

function downloadBlob(bytes: Uint8Array, filename: string, mime: string): void {
  const blob = new Blob([bytes as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
import SlideThemeSwitcher from './components/SlideThemeSwitcher.vue';
import GeneralPanel from './components/GeneralPanel.vue';
import ContentPanel from './components/ContentPanel.vue';
import GraphsPanel from './components/GraphsPanel.vue';
import { usePluginBridge } from './composables/usePluginBridge';
import { usePluginView } from './stores/usePluginView';
import { useIconRecents } from './stores/useIconRecents';
import { useNotifications } from './stores/useNotifications';
import welderLogo from './assets/welder-logo.svg';

const bridge = usePluginBridge();
const view = usePluginView();

// Vite injects this from package.json at build time — see vite.config.ts
// `define` block. Surfaced as a "v0.x.y" UBadge in the splash and header
// so plugin users (and beta testers reporting bugs) can identify which
// release they're running without inspecting the manifest.
const appVersion = __APP_VERSION__;
const iconRecents = useIconRecents();
const notifications = useNotifications();
// Hand the Nuxt UI toast handle to the notifications store. Resolves
// via inject() chain through `<UApp>`, so this MUST happen inside a
// component setup. Doing it once at app root.
notifications.init(useToast());

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

// Export-modal state: target = wat exporteren we, format = welk
// bestandsformaat. Beide blijven hangen tussen exports zodat een
// herhaalde export dezelfde keuze toont.
const exportModalOpen = ref<boolean>(false);
const exportTarget = ref<'slide' | 'presentation'>('slide');
const exportFormat = ref<'PDF' | 'PNG'>('PDF');

// PNG van de hele presentatie wordt nog niet ondersteund — we snappen
// het formaat terug naar PDF zodra de user de presentatie als target
// kiest.
watch(exportTarget, (next) => {
  if (next === 'presentation' && exportFormat.value === 'PNG') {
    exportFormat.value = 'PDF';
  }
});

const formatItems = computed(() => [
  { label: 'PDF', value: 'PDF', icon: 'i-lucide-file-text' },
  {
    label: 'PNG',
    value: 'PNG',
    icon: 'i-lucide-image',
    disabled: exportTarget.value === 'presentation',
  },
]);

function openExportModal(): void {
  // Default naar 'presentation' als er geen actieve slide is — anders
  // staat de modal op een disabled-optie en kan de user niet door.
  if (view.state.currentSlideId === null) {
    exportTarget.value = 'presentation';
  }
  exportModalOpen.value = true;
}

function submitExport(): void {
  if (exportTarget.value === 'slide') {
    const id = view.state.currentSlideId;
    if (id === null) return;
    bridge.post({
      type: 'export-document',
      target: 'slide',
      format: exportFormat.value,
      slideId: id,
    });
  } else {
    bridge.post({
      type: 'export-document',
      target: 'presentation',
      format: exportFormat.value,
    });
  }
  exportModalOpen.value = false;
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
      // Set the active slide directly via the store. The sandbox sends
      // the matching `slide-loaded` (and previews) immediately after
      // `init` during the ui-ready handshake, so we don't need to post
      // `pick-slide` and pay an extra round-trip / second scan.
      // `initializing` stays true until that slide-loaded lands so we
      // don't flash the empty-state between init and slide-loaded.
      view.pickSlide(msg.initialSlideId);
    } else {
      initializing.value = false;
    }
    return;
  }
  if (msg.type === 'slide-loaded') {
    // Defensief: main kan `slide-loaded` sturen voor een slide die de user
    // intussen gewisseld heeft. Alleen accepteren als id matcht.
    if (msg.slideId === view.state.currentSlideId) {
      view.setSlidePayload(msg.general, msg.content, msg.graphs);
      loadingSlide.value = false;
      initializing.value = false;
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
  if (msg.type === 'presentation-pdf-parts') {
    // Merge the per-slide single-page PDFs into one multi-page PDF,
    // stamp Welder metadata, trigger the download. Done off the
    // message-handler tick so we don't block the bridge while pdf-lib
    // does its work.
    void (async () => {
      try {
        const merged = await PDFDocument.create();
        for (let i = 0; i < msg.parts.length; i++) {
          const slideDoc = await PDFDocument.load(msg.parts[i]);
          const pages = await merged.copyPages(slideDoc, slideDoc.getPageIndices());
          for (let p = 0; p < pages.length; p++) merged.addPage(pages[p]);
        }
        applyPdfMetadata(merged, msg.title);
        const bytes = await merged.save();
        downloadBlob(bytes, msg.filename, 'application/pdf');
      } catch (err: unknown) {
        const text = err instanceof Error ? err.message : String(err);
        notifications.pushError('PDF samenvoegen mislukt', text);
      }
    })();
    return;
  }
  if (msg.type === 'document-ready') {
    // PDF: round-trip through pdf-lib so we can stamp Welder metadata
    // (title/author/creator) on the document. PNG: no metadata path,
    // download the raw bytes. The browser's own download UI is the
    // success signal — no toast for the happy path.
    if (msg.format === 'PNG') {
      try {
        downloadBlob(msg.bytes, msg.filename, 'image/png');
      } catch (err: unknown) {
        const text = err instanceof Error ? err.message : String(err);
        notifications.pushError('Download mislukt', text);
      }
      return;
    }
    void (async () => {
      try {
        const doc = await PDFDocument.load(msg.bytes);
        applyPdfMetadata(doc, msg.title);
        const bytes = await doc.save();
        downloadBlob(bytes, msg.filename, 'application/pdf');
      } catch (err: unknown) {
        const text = err instanceof Error ? err.message : String(err);
        notifications.pushError('Download mislukt', text);
      }
    })();
    return;
  }
  if (msg.type === 'target-updated' && msg.ok === false) {
    // Surface sandbox-side failures via the Nuxt UI toaster so they
    // don't disappear silently. Successful target-updated messages
    // stay quiet for now (no save-indicator yet — T8+ scope).
    notifications.pushError(
      'Bewerking mislukt',
      typeof msg.error === 'string' && msg.error.length > 0 ? msg.error : undefined,
    );
    return;
  }
  // target-updated (ok=true): toekomstige save-indicator (T8+). Nu stil negeren.
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
    <!-- Splash: plugin initializing — shown until 'init' arrives.
         Sandbox does the heavy work (font load, initial-slide scan,
         image-preview prefetch) before posting init, so when this
         hides the UI is already populated. -->
    <div
      v-if="initializing"
      class="flex h-full flex-col items-center justify-center bg-elevated text-default"
    >
      <div class="flex flex-col items-center gap-4">
        <img :src="welderLogo" alt="Welder" class="h-12 w-auto" />
        <div class="flex items-center gap-2 text-sm text-muted">
          <UIcon name="i-lucide-loader-circle" class="h-4 w-4 animate-spin" />
          <span>Voorbereiden…</span>
        </div>
      </div>
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
              <span class="text-[0.7rem] text-muted/70 tracking-wide">v{{ appVersion }}</span>
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

          <!-- Export — single entry point that opens the picker modal.
               Sits at the bottom of the content (scrolls with it). -->
          <div class="flex flex-col items-center gap-2 pt-2 text-center">
            <p class="text-xs text-muted max-w-sm">
              Klik rechtsboven in Figma op het
              <span
                class="inline-flex items-center justify-center rounded border border-[var(--ui-border)] px-1.5 py-0.5 align-text-bottom text-default"
              >
                <UIcon name="i-lucide-play" class="h-3 w-3" />
              </span>
              play-icoon voor animaties en altijd actuele content. Een export is handig om te delen of printen.
            </p>
            <UButton
              icon="i-lucide-download"
              color="neutral"
              variant="outline"
              size="md"
              @click="openExportModal"
            >
              Exporteer
            </UButton>
          </div>

          <!-- Export modal: kies wat (huidige slide / hele presentatie)
               en welk formaat (PDF / PNG). PNG van een hele presentatie
               geeft één brede page-PNG; PDF geeft een multi-page PDF. -->
          <UModal
            v-model:open="exportModalOpen"
            title="Exporteren"
            :ui="{
              overlay: 'bg-black/40',
              content: 'max-w-md divide-y-0',
            }"
          >
            <template #body>
              <div class="space-y-4">
                <UFormField label="Wat wil je exporteren?" name="export-target">
                  <div class="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      :disabled="view.state.currentSlideId === null"
                      :class="[
                        'flex flex-col items-start gap-2 rounded-[var(--ui-radius)] border p-3 text-left transition-colors',
                        exportTarget === 'slide'
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'border-[var(--ui-border)] hover:bg-elevated',
                        view.state.currentSlideId === null
                          ? 'cursor-not-allowed opacity-50'
                          : 'cursor-pointer',
                      ]"
                      @click="
                        view.state.currentSlideId !== null && (exportTarget = 'slide')
                      "
                    >
                      <UIcon name="i-lucide-file-text" class="h-5 w-5 text-default" />
                      <div>
                        <div class="text-sm font-medium text-default">Huidige slide</div>
                        <div class="text-xs text-muted">
                          {{
                            view.state.currentSlideId === null
                              ? 'Selecteer eerst een slide'
                              : 'Alleen deze slide'
                          }}
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      :class="[
                        'flex cursor-pointer flex-col items-start gap-2 rounded-[var(--ui-radius)] border p-3 text-left transition-colors',
                        exportTarget === 'presentation'
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'border-[var(--ui-border)] hover:bg-elevated',
                      ]"
                      @click="exportTarget = 'presentation'"
                    >
                      <UIcon name="i-lucide-presentation" class="h-5 w-5 text-default" />
                      <div>
                        <div class="text-sm font-medium text-default">Hele presentatie</div>
                        <div class="text-xs text-muted">Alle slides op deze pagina</div>
                      </div>
                    </button>
                  </div>
                </UFormField>
                <UFormField label="Formaat" name="export-format">
                  <USelect
                    v-model="exportFormat"
                    :items="formatItems"
                    icon="i-lucide-file"
                    class="w-full"
                  />
                </UFormField>
              </div>
            </template>
            <template #footer>
              <div class="flex w-full items-center justify-end gap-2">
                <UButton color="neutral" variant="ghost" @click="exportModalOpen = false">
                  Annuleren
                </UButton>
                <UButton
                  color="primary"
                  variant="solid"
                  icon="i-lucide-download"
                  :disabled="exportTarget === 'slide' && view.state.currentSlideId === null"
                  @click="submitExport"
                >
                  Exporteer
                </UButton>
              </div>
            </template>
          </UModal>
        </div>
      </main>
    </div>
  </UApp>
</template>
