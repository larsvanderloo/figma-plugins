<script setup lang="ts">
import { useToast } from '@nuxt/ui/composables';
import { computed, onMounted, ref, watch } from 'vue';
import welderLogo from './assets/welder-logo.svg';
import ContentPanel from './components/panels/ContentPanel.vue';
import GeneralPanel from './components/panels/GeneralPanel.vue';
import GraphsPanel from './components/panels/GraphsPanel.vue';
import { useExport } from './composables/useExport';
import { useIconReconcile } from './composables/useIconReconcile';
import { usePluginBridge } from './composables/usePluginBridge';
import { usePluginMessages } from './composables/usePluginMessages';
import { useIconRecents } from './stores/useIconRecents';
import { useNotifications } from './stores/useNotifications';
import { useOnboarding } from './stores/useOnboarding';
import { usePluginView } from './stores/usePluginView';
import OnboardingTour from './components/ui/OnboardingTour.vue';

const bridge = usePluginBridge();
const view = usePluginView();
const exporter = useExport();
const appVersion = __APP_VERSION__;
const iconRecents = useIconRecents();
const notifications = useNotifications();
const onboarding = useOnboarding();
notifications.init(useToast());
useIconReconcile();
const initializing = ref<boolean>(true);
const reconciling = ref<boolean>(true);
const STALE_DEADLINE_MS = 8000;
const STALE_FALLBACK_MS = 1500;
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
function scheduleReconcileFallback(): void {
  reconcileFallbackTimer = setTimeout(finishReconcile, STALE_FALLBACK_MS);
}
reconcileDeadlineTimer = setTimeout(finishReconcile, STALE_DEADLINE_MS);
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
  if (pendingW > 0 && pendingH > 0) {
    bridge.post({ type: 'resize-ui', width: pendingW, height: pendingH });
  }
  window.removeEventListener('pointermove', onResizePointerMove);
  window.removeEventListener('pointerup', onResizePointerUp);
  window.removeEventListener('pointercancel', onResizePointerUp);
}
type TabId = 'general' | 'content';
const activeTab = ref<TabId>('general');

const hasContentOrGraphs = computed<boolean>(() => view.hasContent || view.hasGraphs);
watch(
  () => ({ g: view.hasGeneral, c: hasContentOrGraphs.value }),
  function (next, prev) {
    if (activeTab.value === 'general' && !next.g && next.c) activeTab.value = 'content';
    else if (activeTab.value === 'content' && !next.c && next.g) activeTab.value = 'general';
    if (!prev || (!prev.g && !prev.c)) {
      activeTab.value = next.g ? 'general' : next.c ? 'content' : 'general';
    }
  },
  { immediate: true },
);

watch(
  activeTab,
  (next) => onboarding.notifyTabChange(next),
  { immediate: true },
);
let skipIconRecentsSave = false;
const exportModalOpen = ref<boolean>(false);
const exportTarget = ref<'slide' | 'presentation'>('slide');
const exportFormat = ref<'PDF' | 'PNG'>('PDF');
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
  if (value === 'general' || value === 'content') {
    activeTab.value = value;
    onboarding.notifyTabChange(value);
  }
}

function onExportTargetChange(value: string | number | undefined): void {
  if (value === 'slide' || value === 'presentation') exportTarget.value = value;
}

function openExportModal(): void {
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
usePluginMessages({
  view: view,
  iconRecents: iconRecents,
  notifications: notifications,
  onboarding: onboarding,
  initializing: initializing,
  finishReconcile: finishReconcile,
  scheduleReconcileFallback: scheduleReconcileFallback,
  suppressNextIconRecentsSave: () => {
    skipIconRecentsSave = true;
  },
});
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
    <div
      v-if="showSplash"
      class="flex h-full flex-col items-center justify-center gap-4 bg-elevated text-default"
    >
      <img :src="welderLogo" alt="Welder" class="h-12 w-auto" />
      <div class="flex items-center gap-2 text-sm text-muted">
        <UIcon name="i-lucide-loader-circle" class="h-4 w-4 animate-spin" />
        <span>{{ initializing ? 'Voorbereiden…' : 'Iconen synchroniseren…' }}</span>
      </div>
    </div>

    <div v-else class="relative flex h-full flex-col bg-elevated text-default">
      <main class="flex-1 overflow-y-auto w-full space-y-3 p-3 pb-28">
        <UEmpty
          v-if="view.noSlide"
          icon="i-lucide-mouse-pointer-click"
          description="Klik op een slide in Figma om te beginnen met bewerken."
          variant="subtle"
        />

        <UEmpty
          v-else-if="view.allEmpty"
          icon="i-lucide-file-x"
          description="Geen bewerkbare inhoud op deze slide."
          variant="subtle"
        />

        <template v-else>
          <Transition
            mode="out-in"
            enter-active-class="transition duration-150 ease-out"
            enter-from-class="opacity-0 translate-y-1"
            leave-active-class="transition duration-100 ease-in"
            leave-to-class="opacity-0 translate-y-1"
          >
            <GeneralPanel
              v-if="activeTab === 'general' && view.hasGeneral"
              key="general"
            />
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
            />
          </Transition>
        </template>

        <UModal
          v-model:open="exportModalOpen"
          title="Exporteren"
        >
          <template #body>
            <UFormField label="Wat wil je exporteren?" name="export-target">
              <URadioGroup
                :model-value="exportTarget"
                :items="exportTargetItems"
                value-key="value"
                variant="card"
                orientation="horizontal"
                indicator="hidden"
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

      </main>
      <OnboardingTour />

      <div
        class="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-linear-to-t from-elevated from-30% to-transparent"
        aria-hidden="true"
      />

      <nav
        class="pointer-events-none absolute inset-x-0 bottom-4 flex items-center justify-center gap-2 px-3"
        aria-label="Welder-navigatie"
      >
        <div
          class="pointer-events-auto flex items-center gap-2.5 rounded-full bg-default/65 backdrop-blur-xl pl-3.5 pr-3 py-3 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.22)] ring-1 ring-default/40"
        >
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
            data-tour="tabs"
            @update:model-value="onActiveTabChange"
          />
        </div>

        <UButton
          color="neutral"
          variant="ghost"
          square
          icon="i-lucide-circle-help"
          class="pointer-events-auto size-12 rounded-full bg-default/65 backdrop-blur-xl shadow-[0_12px_32px_-12px_rgba(0,0,0,0.18)] ring-1 ring-default/40 text-muted hover:text-primary hover:bg-default/70 transition-colors flex items-center justify-center"
          title="Uitleg"
          aria-label="Uitleg"
          data-tour="help-button"
          @click="onboarding.open()"
        />

        <UButton
          color="neutral"
          variant="ghost"
          square
          icon="i-lucide-download"
          class="pointer-events-auto size-12 rounded-full bg-default/65 backdrop-blur-xl shadow-[0_12px_32px_-12px_rgba(0,0,0,0.18)] ring-1 ring-default/40 text-muted hover:text-primary hover:bg-default/70 transition-colors flex items-center justify-center"
          :title="'Exporteer · v' + appVersion"
          aria-label="Exporteer"
          data-tour="export-button"
          @click="openExportModal"
        />
      </nav>

      <span
        class="pointer-events-none absolute inset-x-0 bottom-1 text-center text-[10px] text-muted/50 tracking-wide"
        aria-hidden="true"
      >v{{ appVersion }}</span>

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
      <div
        v-if="resizing"
        class="fixed inset-0 z-9999 cursor-nwse-resize select-none"
        aria-hidden="true"
      />
    </div>
  </UApp>
</template>
