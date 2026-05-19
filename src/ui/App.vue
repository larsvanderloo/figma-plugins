<!--
  Welder Slide Editor — iframe root.

  Layout:
    - Splash while the sandbox initializes and reconciles stale icons.
    - Tabbed sidebar for Basis and Onderdelen, with panel components owning
      their domain editors.
    - Export modal, resize handle, and bottom navigation live at app-shell
      level until they are split into dedicated shell components.

  Bridge-wiring:
    - onMounted registers the bridge handler for init / slide-loaded /
      slide-summary / target-updated / export responses, then posts ui-ready.
    - Domain edits flow through composables and the typed bridge contract.
-->
<script setup lang="ts">
import { useToast } from '@nuxt/ui/composables';
import { PDFDocument } from 'pdf-lib';
import { computed, onMounted, ref, watch } from 'vue';
import welderLogo from './assets/welder-logo.svg';
import ContentPanel from './components/panels/ContentPanel.vue';
import GeneralPanel from './components/panels/GeneralPanel.vue';
import GraphsPanel from './components/panels/GraphsPanel.vue';
import { useExport } from './composables/useExport';
import { useIconReconcile } from './composables/useIconReconcile';
import { usePluginBridge } from './composables/usePluginBridge';
import { APP_VERSION } from './generated/app-version';
import { getLucideSvg } from './lucide-svgs';
import { useIconRecents } from './stores/useIconRecents';
import { useNotifications } from './stores/useNotifications';
import { usePluginView } from './stores/usePluginView';

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

const bridge = usePluginBridge();
const view = usePluginView();
const exporter = useExport();

// Surfaced as a "v0.x.y" UBadge in the splash and header so plugin users
// and beta testers reporting bugs can identify the package build.
const appVersion = APP_VERSION;
const iconRecents = useIconRecents();
const notifications = useNotifications();
// Hand the Nuxt UI toast handle to the notifications store. Resolves
// via inject() chain through `<UApp>`, so this MUST happen inside a
// component setup. Doing it once at app root.
notifications.init(useToast());

// Auto-reconcile Card + Badge icons after library republishes wipe
// their icon-slot child overrides. Mounted at app root (not inside the
// per-tab editors) so it fires even when the user is on a tab whose
// panel isn't currently displaying the affected section.
useIconReconcile();

// true until the first 'init' message arrives from main thread
const initializing = ref<boolean>(true);

// Cross-slide icon reconcile state. Sandbox walks every slide on
// startup and posts `stale-icons` with the list of stale cards/badges.
// While this is in flight (between ui-ready and the all-clear), the
// splash stays visible so the user opens a fully-reconciled file
// instead of seeing master defaults flash before getting fixed.
const reconciling = ref<boolean>(true);
// Hard cap on splash time, in case the stale-icons message never
// arrives (e.g. very old sandbox build, or scan errors out silently).
const STALE_DEADLINE_MS = 8000;
// Grace period after the LAST update-card post is fired — we don't
// wait for every individual target-updated ack, we assume the bridge
// processes them in order and 1.5s is plenty for the queue to drain.
const STALE_FALLBACK_MS = 1500;
// Show the splash while EITHER init is pending OR reconcile is in
// flight (capped by the safety timer below).
const showSplash = computed<boolean>(() => initializing.value || reconciling.value);

let reconcileFallbackTimer: ReturnType<typeof setTimeout> | null = null;
let reconcileDeadlineTimer: ReturnType<typeof setTimeout> | null = null;
function finishReconcile(): void {
  if (reconcileFallbackTimer !== null) {
    clearTimeout(reconcileFallbackTimer);
    reconcileFallbackTimer = null;
  }
  if (reconcileDeadlineTimer !== null) {
    clearTimeout(reconcileDeadlineTimer);
    reconcileDeadlineTimer = null;
  }
  reconciling.value = false;
}
// Safety: never trap the user behind the splash if `stale-icons`
// somehow never arrives.
reconcileDeadlineTimer = setTimeout(finishReconcile, STALE_DEADLINE_MS);

// ── Resize handle ──────────────────────────────────────────────────
// Drag the bottom-right corner to resize the plugin window. Posts a
// throttled `resize-ui` on every animation frame so the iframe tracks
// the cursor 1:1 without flooding the bridge. Sandbox both applies the
// size AND persists it via clientStorage.
const MIN_W = 380;
const MIN_H = 480;
const resizing = ref<boolean>(false);
let resizeFrame: number | null = null;
let resizeOriginX = 0;
let resizeOriginY = 0;
let resizeStartW = 0;
let resizeStartH = 0;
let pendingW = 0;
let pendingH = 0;

function onResizePointerDown(event: PointerEvent): void {
  event.preventDefault();
  resizing.value = true;
  resizeOriginX = event.clientX;
  resizeOriginY = event.clientY;
  resizeStartW = window.innerWidth;
  resizeStartH = window.innerHeight;
  window.addEventListener('pointermove', onResizePointerMove);
  window.addEventListener('pointerup', onResizePointerUp);
  window.addEventListener('pointercancel', onResizePointerUp);
}

function onResizePointerMove(event: PointerEvent): void {
  pendingW = Math.max(MIN_W, resizeStartW + (event.clientX - resizeOriginX));
  pendingH = Math.max(MIN_H, resizeStartH + (event.clientY - resizeOriginY));
  if (resizeFrame !== null) return;
  resizeFrame = requestAnimationFrame(function () {
    resizeFrame = null;
    bridge.post({ type: 'resize-ui', width: pendingW, height: pendingH });
  });
}

function onResizePointerUp(): void {
  resizing.value = false;
  if (resizeFrame !== null) {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = null;
  }
  // Final post with the latest values so the persisted size matches
  // exactly what the user sees on release.
  if (pendingW > 0 && pendingH > 0) {
    bridge.post({ type: 'resize-ui', width: pendingW, height: pendingH });
  }
  window.removeEventListener('pointermove', onResizePointerMove);
  window.removeEventListener('pointerup', onResizePointerUp);
  window.removeEventListener('pointercancel', onResizePointerUp);
}

// Bottom-nav tab state. `general` = title / badge / image / theme;
// `content` = cards / timeline / graphs. Defaults to general
// since slide identity edits are the most common entry point.
type TabId = 'general' | 'content';
const activeTab = ref<TabId>('general');

const hasContentOrGraphs = computed<boolean>(() => view.hasContent || view.hasGraphs);

// Auto-flip to whichever tab actually has content when switching slides
// so the user never lands on an empty tab. Watches the panel-presence
// flags rather than the slide id so it also handles content appearing
// asynchronously (e.g. after image-preview hydration).
watch(
  () => ({ g: view.hasGeneral, c: hasContentOrGraphs.value }),
  function (next, prev) {
    if (activeTab.value === 'general' && !next.g && next.c) activeTab.value = 'content';
    else if (activeTab.value === 'content' && !next.c && next.g) activeTab.value = 'general';
    // Surface initial choice when a slide is first picked.
    if (!prev || (!prev.g && !prev.c)) {
      activeTab.value = next.g ? 'general' : next.c ? 'content' : 'general';
    }
  },
  { immediate: true },
);

// One-shot guard: when the sandbox hydrates the recents list via
// `setItems`, the deep watcher below would otherwise echo the
// just-loaded array back as a save. Flipped on hydration, consumed
// by the next watcher tick.
let skipIconRecentsSave = false;

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

const exportTargetItems = computed(() => [
  {
    label: 'Huidige slide',
    description:
      view.state.currentSlideId === null ? 'Selecteer eerst een slide' : 'Alleen deze slide',
    value: 'slide',
    icon: 'i-lucide-file-text',
    disabled: view.state.currentSlideId === null,
  },
  {
    label: 'Hele presentatie',
    description: 'Alle slides op deze pagina',
    value: 'presentation',
    icon: 'i-lucide-presentation',
  },
]);

const bottomTabItems = [
  { label: 'Basis', value: 'general', icon: 'i-lucide-square-pen' },
  { label: 'Onderdelen', value: 'content', icon: 'i-lucide-layers' },
];

function onActiveTabChange(value: string | number): void {
  if (value === 'general' || value === 'content') activeTab.value = value;
}

function onExportTargetChange(value: string | number | undefined): void {
  if (value === 'slide' || value === 'presentation') exportTarget.value = value;
}

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
    exporter.exportSlide(id, exportFormat.value);
  } else {
    exporter.exportPresentation(exportFormat.value);
  }
  exportModalOpen.value = false;
}

// Register bridge-handlers vóór de ui-ready handshake zodat we het init-
// bericht niet missen (main kan onmiddellijk terugantwoorden).
bridge.onMessage((msg) => {
  if (msg.type === 'init') {
    if (msg.runtime !== undefined) {
      view.setRuntime(msg.runtime);
    }
    initializing.value = false;
    return;
  }
  if (msg.type === 'slide-loaded') {
    view.setSlideLoaded(msg.summary, msg.general, msg.content, msg.graphs);
    initializing.value = false;
    return;
  }
  if (msg.type === 'stale-icons') {
    // Re-apply each stale entry by sending the same update messages
    // the picker uses. Sandbox handles them per-slide. After firing
    // the batch, start a short grace timer so the splash stays
    // visible while the bridge drains — sandbox applies are async.
    const cardCount = msg.cards.length;
    const badgeCount = msg.badges.length;
    console.log(
      '[icon-reconcile] sandbox flagged ' +
        cardCount +
        ' card icon(s) + ' +
        badgeCount +
        ' badge icon(s) as stale',
    );
    for (let i = 0; i < msg.cards.length; i++) {
      const entry = msg.cards[i];
      const svg = getLucideSvg(entry.iconIntended);
      if (svg === null) continue;
      bridge.post({
        type: 'update-card',
        slideId: entry.slideId,
        cardNodeId: entry.cardNodeId,
        payload: { icon: entry.iconIntended, iconSvg: svg },
      });
    }
    for (let i = 0; i < msg.badges.length; i++) {
      const entry = msg.badges[i];
      const svg = getLucideSvg(entry.iconIntended);
      if (svg === null) continue;
      bridge.post({
        type: 'update-general',
        slideId: entry.slideId,
        section: 'badge',
        payload: { icon: entry.iconIntended, iconSvg: svg },
      });
    }
    // Even with zero stale entries we still need to clear the splash —
    // the sandbox always posts stale-icons (possibly empty) once its
    // scan finishes.
    if (cardCount === 0 && badgeCount === 0) {
      finishReconcile();
    } else {
      reconcileFallbackTimer = setTimeout(finishReconcile, STALE_FALLBACK_MS);
    }
    return;
  }
  if (msg.type === 'slide-summary') {
    view.setSummary(msg.summary);
    return;
  }
  if (msg.type === 'slide-deselected') {
    view.clearSlide();
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
</script>

<template>
  <UApp>
    <!-- Splash: plugin initializing — shown until 'init' arrives.
         Sandbox does the heavy work (font load, initial-slide scan,
         image-preview prefetch) before posting init, so when this
         hides the UI is already populated. -->
    <div
      v-if="showSplash"
      class="flex h-full flex-col items-center justify-center bg-elevated text-default"
    >
      <div class="flex flex-col items-center gap-4">
        <img :src="welderLogo" alt="Welder" class="h-12 w-auto" />
        <div class="flex items-center gap-2 text-sm text-muted">
          <UIcon name="i-lucide-loader-circle" class="h-4 w-4 animate-spin" />
          <span>{{ initializing ? 'Voorbereiden…' : 'Iconen synchroniseren…' }}</span>
        </div>
      </div>
    </div>

    <!-- Real UI — shown once 'init' received AND the cross-slide
         icon-reconcile pass finishes (or its deadline times out). -->
    <div v-else class="relative flex h-full flex-col bg-elevated text-default">
      <main class="flex-1 overflow-y-auto">
        <div class="mx-auto max-w-2xl space-y-3 p-3 pb-28">
          <!-- Empty states first; they pre-empt the tab content. -->
          <UEmpty
            v-if="view.noSlide"
            icon="i-lucide-mouse-pointer-click"
            description="Klik op een slide in Figma om te beginnen met bewerken."
            variant="subtle"
            size="sm"
          />

          <UEmpty
            v-else-if="view.allEmpty"
            icon="i-lucide-file-x"
            description="Geen bewerkbare inhoud op deze slide."
            variant="subtle"
            size="sm"
          />

          <!-- Tab-based content. Only one panel renders at a time so the
               page stays focused. GeneralPanel handles its own internal
               disable state; ContentPanel + GraphsPanel sit in a fieldset
               that disables when the slide is skipped. -->
          <template v-else>
            <Transition
              mode="out-in"
              enter-active-class="transition duration-150 ease-out"
              enter-from-class="opacity-0 translate-y-1"
              leave-active-class="transition duration-100 ease-in"
              leave-to-class="opacity-0 translate-y-1"
            >
              <div v-if="activeTab === 'general' && view.hasGeneral" key="general">
                <GeneralPanel />
              </div>
              <fieldset
                v-else-if="activeTab === 'content' && hasContentOrGraphs"
                key="content"
                :disabled="view.isSkipped"
                :class="
                  view.isSkipped
                    ? 'space-y-3 opacity-50 pointer-events-none'
                    : 'space-y-3'
                "
                style="border: 0; padding: 0; margin: 0; min-width: 0"
              >
                <ContentPanel v-if="view.hasContent" />
                <GraphsPanel v-if="view.hasGraphs" />
              </fieldset>
              <UEmpty
                v-else
                key="empty-tab"
                icon="i-lucide-circle-off"
                :description="
                  activeTab === 'general'
                    ? 'Geen algemene instellingen voor deze slide.'
                    : 'Geen kaarten of grafieken op deze slide.'
                "
                variant="subtle"
                size="sm"
              />
            </Transition>
          </template>

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
                  <URadioGroup
                    :model-value="exportTarget"
                    :items="exportTargetItems"
                    value-key="value"
                    variant="card"
                    orientation="horizontal"
                    indicator="hidden"
                    size="sm"
                    :ui="{
                      fieldset: 'grid grid-cols-2 gap-2',
                      item: 'p-0 overflow-hidden',
                      wrapper: 'w-full',
                      label: 'w-full cursor-pointer',
                    }"
                    @update:model-value="onExportTargetChange"
                  >
                    <template #label="{ item }">
                      <span
                        class="flex flex-col items-start gap-2 p-3 text-left transition-colors"
                        :class="
                          exportTarget === item.value
                            ? 'bg-primary/5 text-primary'
                            : 'bg-default text-default hover:bg-elevated'
                        "
                      >
                        <UIcon :name="item.icon" class="h-5 w-5" />
                        <span>
                          <span class="block text-sm font-medium">{{ item.label }}</span>
                          <span class="block text-xs text-muted">{{ item.description }}</span>
                        </span>
                      </span>
                    </template>
                  </URadioGroup>
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

      <!--
        Bottom scrim — gradient fade from page background up into
        transparent, so the scrolling content visually tucks beneath
        the floating navbar instead of clashing through it. Same iOS
        pattern Music / Files / Health use under their tab bars.
      -->
      <div
        class="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-linear-to-t from-elevated from-30% to-transparent"
        aria-hidden="true"
      />

      <!--
        Floating bottom navbar — brand on the left, tab segments on the
        right. Sits over the scrim + scrolling content; `pb-28` on the
        main gutter keeps the last bits of content above the navbar.
      -->
      <nav
        class="pointer-events-none absolute inset-x-0 bottom-4 flex items-center justify-center gap-2 px-3"
        aria-label="Welder-navigatie"
      >
        <div
          class="pointer-events-auto flex items-center gap-2.5 rounded-full bg-default/65 backdrop-blur-xl pl-3.5 pr-3 py-3 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.22)] ring-1 ring-default/40"
        >
          <!--
            Inline W-only mark — same paths as the full Welder logo
            without the wordmark, so the navbar reads as a brand icon
            instead of a logo card. Fill is the Welder brand orange.
          -->
          <svg
            viewBox="100 100 720 540"
            class="h-7 w-auto shrink-0"
            fill="#f70"
            aria-label="Welder"
            role="img"
          >
            <circle cx="721.4" cy="233.6" r="88.5" />
            <path
              d="M278,155.5c-6-10.1-19-13.4-29.1-7.4l-42.6,25.3c-50.5,29.9-67.1,95.1-37.2,145.5l166.3,280.4c6,10.1,19,13.4,29.1,7.4l42.6-25.3c50.5-29.9,67.1-95.1,37.2-145.6l-166.3-280.4Z"
            />
            <path
              d="M528.4,155.5c-6-10.1-19-13.4-29.1-7.4l-42.6,25.3c-50.5,29.9-67.1,95.1-37.2,145.5l166.3,280.4c6,10.1,19,13.4,29.1,7.4l42.6-25.3c50.5-29.9,67.1-95.1,37.2-145.6l-166.3-280.4Z"
            />
          </svg>
          <USeparator orientation="vertical" class="h-6" />
          <UTabs
            :model-value="activeTab"
            :items="bottomTabItems"
            :content="false"
            variant="pill"
            size="lg"
            :ui="{
              root: 'w-[14rem]',
              list: 'grid grid-cols-[6rem_8rem] rounded-full bg-elevated p-1',
              indicator: 'rounded-full bg-default shadow-[0_1px_2px_rgba(0,0,0,0.06)]',
              trigger: 'h-8 rounded-full px-0 data-[state=active]:text-default',
              leadingIcon: 'size-4',
            }"
            @update:model-value="onActiveTabChange"
          />
        </div>

        <!--
          Floating export button — same height + glass treatment as the
          nav pill. Sits to the right of the tab picker so the existing
          export entry at the bottom of the scroll area can be retired.
        -->
        <UButton
          color="neutral"
          variant="ghost"
          square
          icon="i-lucide-download"
          class="pointer-events-auto size-12 rounded-full bg-default/65 backdrop-blur-xl shadow-[0_12px_32px_-12px_rgba(0,0,0,0.18)] ring-1 ring-default/40 text-muted hover:text-primary hover:bg-default/70 transition-colors flex items-center justify-center"
          :title="'Exporteer · v' + appVersion"
          aria-label="Exporteer"
          :ui="{ leadingIcon: 'size-5' }"
          @click="openExportModal"
        />
      </nav>

      <!--
        Version label — tiny muted text centered at the very bottom of
        the iframe, below the floating navbar. Just enough to identify
        which build is running without competing with the controls.
      -->
      <div
        class="pointer-events-none absolute inset-x-0 bottom-1 flex justify-center"
        aria-hidden="true"
      >
        <span class="text-[10px] text-muted/50 tracking-wide">v{{ appVersion }}</span>
      </div>

      <!--
        Resize handle — drag the bottom-right corner to resize the plugin
        window. Sandbox persists the size via clientStorage so reopening
        the plugin restores the last picked dimensions. While dragging,
        `cursor-nwse-resize` is forced on the whole page so the cursor
        doesn't flicker as it crosses over child elements.
      -->
      <div
        :class="[
          'absolute bottom-0 right-0 size-6 cursor-nwse-resize select-none flex items-end justify-end p-1.5 text-muted/60 hover:text-muted transition-colors',
          resizing ? '[&]:text-default' : '',
        ]"
        role="separator"
        aria-label="Plugin-grootte aanpassen"
        @pointerdown="onResizePointerDown"
      >
        <svg viewBox="0 0 10 10" class="h-3 w-3" aria-hidden="true">
          <path
            d="M9 1 L1 9 M9 5 L5 9 M9 9 L9 9"
            stroke="currentColor"
            stroke-width="1.4"
            stroke-linecap="round"
            fill="none"
          />
        </svg>
      </div>
      <!-- Lock cursor + disable selection globally while dragging so the
           pointer doesn't flicker over inputs / buttons. -->
      <div
        v-if="resizing"
        class="fixed inset-0 z-9999 cursor-nwse-resize select-none"
        aria-hidden="true"
      />
    </div>
  </UApp>
</template>
