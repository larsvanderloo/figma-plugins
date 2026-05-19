<!--
  CardItemEditor — editor for one Card in the Content tab.

  Text fields (BInput/BTextarea) commit on blur/enter so typing doesn't
  trigger a sandbox round-trip per keystroke. Discrete controls (icon
  picker, outline toggle, file upload) commit immediately.
-->
<script setup lang="ts">
import { ref, computed } from 'vue';
import type { CardItem } from '../../types';
import IconPicker from './IconPicker.vue';
import BInput from './BInput.vue';
import BTextarea from './BTextarea.vue';
import { compressImageForUpload } from '../utils/image-compress';
import { formatBytes } from '../utils/format-bytes';

interface Props {
  modelValue: CardItem;
  index: number;
  previewUrl?: string | null;
  sizeBytes?: number | null;
  /** When true, the icon picker stays visible but is non-interactive
   *  (used by the global "Alleen tekst" card-size tile). */
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

function onHeadingCommit(value: string): void {
  emitWith({ heading: value });
}
function onParagraphCommit(value: string): void {
  emitWith({ paragraph: value });
}
function onIconChange(value: string): void {
  emitWith({ icon: value });
}
function onOutlineToggle(value: boolean): void {
  if (props.modelValue.style === null) return;
  emitWith({ style: value ? 'Outline' : 'Default' });
}

const fileInput = ref<HTMLInputElement | null>(null);
const isUploading = ref<boolean>(false);

function triggerFileInput(): void {
  if (fileInput.value !== null) fileInput.value.click();
}

async function onFileSelected(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const files = input.files;
  if (files === null || files.length === 0) return;
  const file = files[0];
  isUploading.value = true;
  try {
    const buffer = await file.arrayBuffer();
    const raw = new Uint8Array(buffer);
    const bytes = await compressImageForUpload(raw);
    emit('upload-visual', bytes);
  } finally {
    isUploading.value = false;
    input.value = '';
  }
}
</script>

<template>
  <section class="space-y-4 px-5 py-5">
    <div class="flex items-center justify-between gap-3">
      <h3 class="text-sm font-semibold text-highlighted">Kaart {{ index }}</h3>
      <label
        v-if="modelValue.style !== null"
        class="flex items-center gap-2 text-xs text-muted cursor-pointer select-none"
      >
        <span>Rand</span>
        <USwitch
          :model-value="modelValue.style === 'Outline'"
          size="xs"
          @update:model-value="onOutlineToggle"
        />
      </label>
    </div>

    <div v-if="hasVisualSlot" class="space-y-2">
      <label class="text-sm font-medium text-default">Afbeelding</label>
      <div
        v-if="previewUrl"
        class="relative w-full overflow-hidden rounded-xl bg-muted select-none h-32"
      >
        <img :src="previewUrl" class="absolute inset-0 h-full w-full object-cover" alt="" />
      </div>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon
            :name="hasImage ? 'i-lucide-image' : 'i-lucide-image-off'"
            class="size-4 shrink-0 text-muted"
          />
          <span class="text-xs text-muted">
            {{ visualStatusLabel }}
          </span>
        </div>
        <UButton
          size="md"
          color="neutral"
          variant="outline"
          icon="i-lucide-upload"
          :loading="isUploading"
          :disabled="isUploading"
          @click="triggerFileInput"
        >
          {{ hasImage ? 'Vervangen' : 'Uploaden' }}
        </UButton>
      </div>
    </div>

    <div class="space-y-1.5">
      <label class="text-sm font-medium text-default">Titel</label>
      <div class="flex items-center gap-2">
        <IconPicker
          :model-value="modelValue.icon ?? ''"
          :disabled="iconDisabled || modelValue.icon === null"
          @update:model-value="onIconChange"
        />
        <BInput
          :model-value="modelValue.heading"
          placeholder="Koptekst"
          size="md"
          class="flex-1"
          @update:model-value="onHeadingCommit"
        />
      </div>
    </div>

    <div class="space-y-1.5">
      <label class="text-sm font-medium text-default">Omschrijving</label>
      <BTextarea
        :model-value="modelValue.paragraph"
        :rows="3"
        :autoresize="true"
        placeholder="Alineatekst"
        size="md"
        class="w-full"
        @update:model-value="onParagraphCommit"
      />
    </div>

    <input
      v-if="hasVisualSlot"
      ref="fileInput"
      type="file"
      accept="image/*"
      style="display: none"
      @change="onFileSelected"
    />
  </section>
</template>
