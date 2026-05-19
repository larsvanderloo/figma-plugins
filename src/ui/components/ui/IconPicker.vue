<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';
import { ALL_LUCIDE_ICONS } from '../../lucide-icon-names';
import { usePluginBridge } from '../../composables/usePluginBridge';
import { useIconRecents } from '../../stores/useIconRecents';

interface Props {
  modelValue: string;
  disabled?: boolean;
}

const props = defineProps<Props>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const open = ref<boolean>(false);
const ready = ref<boolean>(false);
const search = ref<string>('');
const CHUNK = 40;
const displayCount = ref<number>(CHUNK);
const iconsReady = ref<boolean>(false);
const { onMessage } = usePluginBridge();
const unsubIconsReady = onMessage(function (msg) {
  if (msg.type === 'icons-ready') {
    iconsReady.value = true;
  }
});
onUnmounted(unsubIconsReady);
const iconRecents = useIconRecents();

const filtered = computed<string[]>(function () {
  var q = search.value.toLowerCase().trim();
  if (q.length === 0) return ALL_LUCIDE_ICONS;
  return ALL_LUCIDE_ICONS.filter(function (name) {
    return name.indexOf(q) >= 0;
  });
});
watch(filtered, function () {
  displayCount.value = CHUNK;
});
const visible = computed<string[]>(function () {
  return filtered.value.slice(0, displayCount.value);
});
const displayIcon = computed<string>(function () {
  return props.modelValue.length > 0 ? props.modelValue : 'square-dashed';
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
  <UPopover
    :open="disabled ? false : open"
    @update:open="onOpenChange"
  >
    <UButton
      variant="outline"
      color="neutral"
      :icon="`i-lucide-${displayIcon}`"
      trailing-icon="i-lucide-chevron-down"
      :disabled="disabled"
    />

    <template #content>
      <div class="flex items-center gap-2 mb-3">
        <UInput
          :model-value="search"
          placeholder="Zoek icon..."
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

      <div v-if="!iconsReady && open && search.length === 0" class="flex items-center gap-1.5 mb-2">
        <UIcon name="i-lucide-loader-2" class="size-3 animate-spin text-muted" />
        <span class="text-xs text-muted">Iconen worden geladen...</span>
      </div>

      <div class="max-h-64 overflow-y-auto" @scroll.passive="onGridScroll">
        <div v-if="!ready" class="grid grid-cols-6 gap-1">
          <USkeleton
            v-for="n in CHUNK"
            :key="n"
            class="aspect-square rounded"
          />
        </div>

        <template v-else>
          <template v-if="iconRecents.items.length > 0 && search.length === 0">
            <p class="text-xs text-muted mb-1">Recent</p>
            <div class="grid grid-cols-6 gap-1">
              <UButton
                v-for="name in iconRecents.items"
                :key="`recent-${name}`"
                :icon="`i-lucide-${name}`"
                :color="name === props.modelValue ? 'primary' : 'neutral'"
                :variant="name === props.modelValue ? 'soft' : 'link'"
                square
                :title="name"
                @click="select(name)"
              />
            </div>
            <USeparator class="my-2" />
          </template>

          <div class="grid grid-cols-6 gap-1">
            <UButton
              v-for="name in visible"
              :key="name"
              :icon="`i-lucide-${name}`"
              :color="name === props.modelValue ? 'primary' : 'neutral'"
              :variant="name === props.modelValue ? 'soft' : 'link'"
              square
              :title="name"
              @click="select(name)"
            />
          </div>

          <p v-if="filtered.length === 0" class="py-4 text-center text-sm text-muted">
            Geen iconen gevonden voor "{{ search }}"
          </p>
        </template>
      </div>
    </template>
  </UPopover>
</template>
