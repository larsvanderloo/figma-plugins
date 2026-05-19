<!--
  CardItemEditor — editor for one Card in the Content tab.

  Text fields (WInput/WTextarea) commit on blur/enter so typing doesn't
  trigger a sandbox round-trip per keystroke. Discrete controls (icon
  picker, outline toggle, file upload) commit immediately.
-->
<script setup lang="ts">
import { ref, computed } from 'vue';
import type { CardItem } from '../../../types';
import IconPicker from '../ui/IconPicker.vue';
import WInput from '../ui/WInput.vue';
import WTextarea from '../ui/WTextarea.vue';
import WCard from '../ui/WCard.vue';

import { compressImageForUpload } from '../../utils/image-compress';
import { formatBytes } from '../../utils/format-bytes';

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
  <WCard :title="`Kaart ${index}`">
    <template #actions>
      <USwitch
        v-if="modelValue.style !== null"
        :model-value="modelValue.style === 'Outline'"
        label="Rand"
        size="xs"
        :ui="{
          root: 'flex-row-reverse items-center',
          wrapper: 'me-2 ms-0',
          label: 'text-xs font-medium text-muted',
        }"
        @update:model-value="onOutlineToggle"
      />
    </template>

    <div class="space-y-4">
      <UFormField v-if="hasVisualSlot" label="Afbeelding">
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
                size="md"
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
            size="md"
            class="flex-1"
            @update:model-value="onHeadingCommit"
          />
        </div>
      </UFormField>

      <UFormField label="Omschrijving">
        <WTextarea
          :model-value="modelValue.paragraph"
          :rows="3"
          :autoresize="true"
          placeholder="Alineatekst"
          size="md"
          class="w-full"
          @update:model-value="onParagraphCommit"
        />
      </UFormField>
    </div>
  </WCard>
</template>
