<!--
  IconPicker — popover-gebaseerde icon-kiezer met scroll-lazy-loading.

  Toont alle 1754 Lucide-icons uit de statisch gegenereerde
  lucide-icon-names.ts. Icons worden in chunks van 80 geladen op basis
  van scrollpositie zodat de DOM niet overbelast raakt.

  Props:
    modelValue: string — huidige icon-naam (zonder 'i-lucide-' prefix)

  Emits:
    update:modelValue — nieuwe icon-naam na selectie

  Gebruik:
    <IconPicker v-model="iconName" />
-->
<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';
import { ALL_LUCIDE_ICONS } from '../lucide-icon-names';
import { usePluginBridge } from '../composables/usePluginBridge';
import { useIconRecents } from '../stores/useIconRecents';

interface Props {
  modelValue: string;
}

const props = defineProps<Props>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const open = ref<boolean>(false);
const ready = ref<boolean>(false);
const search = ref<string>('');
const CHUNK = 40;
const displayCount = ref<number>(CHUNK);

// Icon-cache loading indicator (non-blocking, FIG-MSG-01).
// Flips to true when main-thread posts 'icons-ready' after primeIconCache resolves.
const iconsReady = ref<boolean>(false);
const { onMessage } = usePluginBridge();
const unsubIconsReady = onMessage(function (msg) {
  if (msg.type === 'icons-ready') {
    iconsReady.value = true;
  }
});
onUnmounted(unsubIconsReady);

// Recently-picked icons. Source of truth is `useIconRecents`, which is
// hydrated by App.vue from `figma.clientStorage` via the message bus.
// Cross-instance: picking in any IconPicker reflects in all of them.
const iconRecents = useIconRecents();

const filtered = computed<string[]>(function () {
  var q = search.value.toLowerCase().trim();
  if (q.length === 0) return ALL_LUCIDE_ICONS;
  return ALL_LUCIDE_ICONS.filter(function (name) {
    return name.indexOf(q) >= 0;
  });
});

// Reset lazy-load counter wanneer de zoekterm wijzigt.
watch(filtered, function () {
  displayCount.value = CHUNK;
});

// Slice naar de momenteel zichtbare set.
const visible = computed<string[]>(function () {
  return filtered.value.slice(0, displayCount.value);
});

const displayIcon = computed<string>(function () {
  return props.modelValue.length > 0 ? props.modelValue : 'circle';
});

function select(name: string): void {
  iconRecents.record(name);
  emit('update:modelValue', name);
  open.value = false;
  search.value = '';
  displayCount.value = CHUNK;
}

function clearSearch(): void {
  search.value = '';
}

function onSearchInput(value: string): void {
  search.value = value;
}

function onOpenChange(val: boolean): void {
  open.value = val;
  if (val) {
    // Popover opent direct; grid rendert een animatieframe later zodat
    // de openingsanimatie niet blokkeert door 40+ SVG-nodes tegelijk.
    ready.value = false;
    requestAnimationFrame(function () {
      ready.value = true;
    });
  } else {
    ready.value = false;
    search.value = '';
    displayCount.value = CHUNK;
  }
}

function onGridScroll(event: Event): void {
  var el = event.target as HTMLElement;
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) {
    var next = displayCount.value + CHUNK;
    displayCount.value = next > filtered.value.length ? filtered.value.length : next;
  }
}
</script>

<template>
  <UPopover :open="open" @update:open="onOpenChange" :ui="{ content: 'p-4 w-80' }">
    <!-- Trigger: selector-stijl knop met groot icon-preview + chevron -->
    <UButton
      variant="soft"
      color="neutral"
      class="max-w-[96px] gap-2 p-2"
      @click="onOpenChange(true)"
    >
      <span
        class="flex items-center justify-center size-8 rounded-md shrink-0 bg-[--ui-bg-elevated]"
      >
        <UIcon :name="`i-lucide-${displayIcon}`" class="size-5" />
      </span>
      <UIcon name="i-lucide-chevron-down" class="size-4 text-[--ui-text-muted] shrink-0" />
    </UButton>

    <template #content>
      <!-- Zoekbalk met clear-knop -->
      <div class="flex items-center gap-2 mb-3">
        <UInput
          :model-value="search"
          placeholder="Zoek icon..."
          size="md"
          class="flex-1"
          @update:model-value="onSearchInput"
        />
        <UButton
          v-if="search.length > 0"
          size="xs"
          variant="ghost"
          icon="i-lucide-x"
          @click="clearSearch"
        />
      </div>

      <!-- Non-blocking loading hint: icons cache nog niet gereed -->
      <div v-if="!iconsReady && open && search.length === 0" class="flex items-center gap-1.5 mb-2">
        <UIcon name="i-lucide-loader-2" class="size-3 animate-spin text-[--ui-text-muted]" />
        <span class="text-xs text-muted">Iconen worden geladen...</span>
      </div>

      <!-- Icon-raster met scroll-lazy-loading -->
      <div class="max-h-64 overflow-y-auto" @scroll.passive="onGridScroll">
        <!-- Skeleton terwijl het eerste frame nog niet klaar is -->
        <div v-if="!ready" class="grid grid-cols-6 gap-1">
          <div
            v-for="n in CHUNK"
            :key="n"
            class="aspect-square rounded bg-gray-100 dark:bg-gray-800 animate-pulse"
          />
        </div>

        <template v-else>
          <!-- Recent row — alleen tonen als er recente icons zijn en search leeg is -->
          <template v-if="iconRecents.items.length > 0 && search.length === 0">
            <p class="text-xs text-muted mb-1">Recent</p>
            <div class="grid grid-cols-6 gap-1">
              <button
                v-for="name in iconRecents.items"
                :key="`recent-${name}`"
                type="button"
                class="flex items-center justify-center rounded-xl p-2.5 bg-[--ui-bg] ring-1 ring-[--ui-border] transition-colors hover:bg-[--ui-bg-elevated]"
                :class="{ 'ring-2 ring-[#FF7700] bg-[#FFF4EA]': name === props.modelValue }"
                :title="name"
                @click="select(name)"
              >
                <UIcon :name="`i-lucide-${name}`" class="size-5" />
              </button>
            </div>
            <div class="border-t border-[var(--ui-border)] my-2" />
          </template>

          <!-- Hoofdgrid -->
          <div class="grid grid-cols-6 gap-1">
            <button
              v-for="name in visible"
              :key="name"
              type="button"
              class="flex items-center justify-center rounded-xl p-2.5 bg-[--ui-bg] ring-1 ring-[--ui-border] transition-colors hover:bg-[--ui-bg-elevated]"
              :class="{ 'ring-2 ring-[#FF7700] bg-[#FFF4EA]': name === props.modelValue }"
              :title="name"
              @click="select(name)"
            >
              <UIcon :name="`i-lucide-${name}`" class="size-5" />
            </button>
          </div>

          <!-- No-results state -->
          <p v-if="filtered.length === 0" class="py-4 text-center text-sm text-muted">
            Geen iconen gevonden voor "{{ search }}"
          </p>
        </template>
      </div>
    </template>
  </UPopover>
</template>
