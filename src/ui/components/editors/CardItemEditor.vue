<script setup lang="ts">
import { ref, computed } from 'vue';
import type { CardItem } from '../../../shared/types';
import IconPicker from '../ui/IconPicker.vue';
import WInput from '../ui/WInput.vue';
import WTextarea from '../ui/WTextarea.vue';

import { compressImageForUpload } from '../../utils/image-compress';
import { formatBytes } from '../../utils/format-bytes';
import { useLiveText } from '../../composables/useLiveText';

interface Props {
  modelValue: CardItem;
  index: number;
  previewUrl?: string | null;
  sizeBytes?: number | null;
  iconDisabled?: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: CardItem];
  'upload-visual': [bytes: Uint8Array];
}>();

const hasVisualSlot = computed<boolean>(() => props.modelValue.visualHash !== undefined);
const hasImage = computed<boolean>(() => typeof props.modelValue.visualHash === 'string');

const visualStatusLabel = computed<string>(() => {
  if (isUploading.value) return 'Bezig met uploaden…';
  if (!hasImage.value) return 'Nog geen visual';
  const size = props.sizeBytes;
  if (typeof size === 'number' && size > 0) return formatBytes(size);
  return 'Visual ingesteld';
});

function emitWith(patch: Partial<CardItem>): void {
  emit('update:modelValue', { ...props.modelValue, ...patch });
}

// Live meetypen op het canvas: elke aanslag komt binnen via het
// `live`-event en gaat gedebounced (useLiveText) dezelfde emit-route op
// als een commit — de delta-guard in useCardEditor blijft de dedupe-laag.
// De waarde wordt bij het vuren pas gespreid over props.modelValue, zodat
// tussentijdse wijzigingen aan andere velden niet worden teruggedraaid.
// Commit (blur/Enter) cancel()t het lopende timertje eerst: anders zou de
// debounce ná de commit nog een verouderde waarde posten.
let liveHeadingValue = '';
const liveHeading = useLiveText(() => emitWith({ heading: liveHeadingValue }));
function onHeadingLive(value: string): void {
  liveHeadingValue = value;
  liveHeading.schedule();
}
function onHeadingCommit(value: string): void {
  liveHeading.cancel();
  emitWith({ heading: value });
}

let liveParagraphValue = '';
const liveParagraph = useLiveText(() => emitWith({ paragraph: liveParagraphValue }));
function onParagraphLive(value: string): void {
  liveParagraphValue = value;
  liveParagraph.schedule();
}
function onParagraphCommit(value: string): void {
  liveParagraph.cancel();
  emitWith({ paragraph: value });
}
function onIconChange(value: string): void {
  emitWith({ icon: value });
}
function onOutlineToggle(value: boolean): void {
  if (props.modelValue.style === null) return;
  emitWith({ style: value ? 'Outline' : 'Default' });
}

const selectedVisualFile = ref<File | null>(null);
const isUploading = ref<boolean>(false);

async function onVisualFileChange(file: File | null | undefined): Promise<void> {
  if (file === null || file === undefined) return;
  isUploading.value = true;
  try {
    const buffer = await file.arrayBuffer();
    const raw = new Uint8Array(buffer);
    const bytes = await compressImageForUpload(raw);
    emit('upload-visual', bytes);
  } finally {
    isUploading.value = false;
    selectedVisualFile.value = null;
  }
}
</script>

<template>
  <div class="space-y-4">
    <h3 class="text-sm font-semibold text-highlighted">Kaart {{ index }}</h3>
    <USwitch
      v-if="modelValue.style !== null"
      :model-value="modelValue.style === 'Outline'"
      label="Outline"
      :ui="{ root: 'flex-row-reverse justify-between w-full', wrapper: 'ms-0' }"
      @update:model-value="onOutlineToggle"
    />

    <UFormField v-if="hasVisualSlot" label="Afbeelding">
      <div
        v-if="previewUrl"
        class="relative w-full overflow-hidden rounded-xl bg-muted select-none h-32"
      >
        <img :src="previewUrl" class="absolute inset-0 h-full w-full object-cover" alt="" />
      </div>
      <div class="flex items-center justify-between gap-2">
        <div class="flex min-w-0 items-center gap-1.5 text-xs text-muted">
          <UIcon
            :name="hasImage ? 'i-lucide-image' : 'i-lucide-image-off'"
            class="size-4 shrink-0"
            aria-hidden="true"
          />
          <span class="truncate">{{ visualStatusLabel }}</span>
        </div>
        <UFileUpload
          v-model="selectedVisualFile"
          as="div"
          accept="image/*"
          :dropzone="false"
          :preview="false"
          reset
          @update:model-value="onVisualFileChange"
        >
          <template #default="{ open }">
            <UButton
              color="neutral"
              variant="outline"
              icon="i-lucide-upload"
              :loading="isUploading"
              :disabled="isUploading"
              @click="open()"
            >
              {{ hasImage ? 'Vervangen' : 'Uploaden' }}
            </UButton>
          </template>
        </UFileUpload>
      </div>
    </UFormField>

    <UFormField label="Titel">
      <div class="flex items-center gap-2">
        <IconPicker
          :model-value="modelValue.icon ?? ''"
          :disabled="iconDisabled || modelValue.icon === null"
          @update:model-value="onIconChange"
        />
        <WInput
          :model-value="modelValue.heading"
          placeholder="Koptekst"
          class="flex-1"
          @update:model-value="onHeadingCommit"
          @live="onHeadingLive"
        />
      </div>
    </UFormField>

    <UFormField label="Omschrijving">
      <WTextarea
        :model-value="modelValue.paragraph"
        :rows="3"
        :autoresize="true"
        placeholder="Alineatekst"
        class="w-full"
        @update:model-value="onParagraphCommit"
        @live="onParagraphLive"
      />
    </UFormField>
  </div>
</template>
