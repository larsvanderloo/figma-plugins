<script setup lang="ts">
import { ref, computed } from 'vue';
import { useCropper } from 'vue-picture-cropper';
import 'cropperjs/dist/cropper.css';
import { compressImageForUpload } from '../../utils/image-compress';
import { formatBytes } from '../../utils/format-bytes';
import { useImageEditor } from '../../composables/useImageEditor';
import WCard from '../ui/WCard.vue';

export interface ImageValue {
  hasImage: boolean;
  imageHash: string | null;
}

const e = useImageEditor();

const selectedImageFile = ref<File | null>(null);
const isUploading = ref<boolean>(false);
const sizeWarning = ref<string | null>(null);
const isCropOpen = ref<boolean>(false);
const cropSourceUrl = ref<string | null>(null);
const cropperOptions = computed(() => {
  const aspect =
    e.fillW !== null && e.fillH !== null && e.fillW > 0 && e.fillH > 0
      ? e.fillW / e.fillH
      : NaN;
  return {
    viewMode: 1 as 1,
    aspectRatio: aspect,
    autoCrop: true,
    background: false,
  };
});
const cropperProps = computed(() => ({
  img: cropSourceUrl.value ?? '',
  options: cropperOptions.value,
}));
const [CropperComponent, cropperApi] = useCropper(cropperProps);
const previewBoxStyle = computed<Record<string, string>>(() => {
  const empty: Record<string, string> = {};
  if (e.fillW === null || e.fillH === null) return empty;
  if (e.fillW <= 0 || e.fillH <= 0) return empty;
  const ratio = e.fillW / e.fillH;
  if (ratio < 0.4 || ratio > 3.0) return empty;
  return { aspectRatio: String(ratio) };
});

const useFixedHeight = computed<boolean>(() => {
  return Object.keys(previewBoxStyle.value).length === 0;
});

const SOFT_MAX_BYTES = 2 * 1024 * 1024;

const statusLabel = computed<string>(() => {
  if (isUploading.value) return 'Bezig met uploaden…';
  if (e.model !== null && e.model.hasImage) {
    const size = e.sizeBytes;
    if (typeof size === 'number' && size > 0) return formatBytes(size);
    return 'Afbeelding ingesteld';
  }
  return 'Nog geen afbeelding';
});

async function onImageFileChange(file: File | null | undefined): Promise<void> {
  if (file === null || file === undefined) return;
  sizeWarning.value = null;
  if (file.size > SOFT_MAX_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    sizeWarning.value = 'Groot bestand (' + mb + ' MB) — upload kan even duren.';
  }

  isUploading.value = true;
  try {
    const buffer = await file.arrayBuffer();
    const raw = new Uint8Array(buffer);
    const bytes = await compressImageForUpload(raw);
    e.upload(bytes);
  } finally {
    isUploading.value = false;
    selectedImageFile.value = null;
  }
}
function openCrop(): void {
  if (e.previewUrl === null) return;
  cropSourceUrl.value = e.previewUrl;
  isCropOpen.value = true;
}
function cancelCrop(): void {
  isCropOpen.value = false;
  cropSourceUrl.value = null;
}
async function applyCrop(): Promise<void> {
  try {
    const blob = await cropperApi.getBlob({ imageSmoothingQuality: 'high' });
    if (blob === null) return;
    const buffer = await blob.arrayBuffer();
    const raw = new Uint8Array(buffer);
    const bytes = await compressImageForUpload(raw);
    e.upload(bytes);
  } finally {
    isCropOpen.value = false;
    cropSourceUrl.value = null;
  }
}
</script>

<template>
  <WCard>
    <template v-if="isCropOpen && cropSourceUrl !== null">
      <div
        class="w-full overflow-hidden rounded-xl bg-muted"
        :class="{ 'h-64': useFixedHeight }"
        :style="previewBoxStyle"
      >
        <CropperComponent class="h-full w-full" />
      </div>
      <div class="flex items-center justify-end gap-2">
        <UButton color="neutral" variant="outline" @click="cancelCrop">
          Annuleren
        </UButton>
        <UButton color="primary" variant="solid" icon="i-lucide-check" @click="applyCrop">
          Toepassen
        </UButton>
      </div>
    </template>

    <div
      v-else-if="e.previewUrl !== null"
      class="relative w-full overflow-hidden rounded-xl bg-muted select-none"
      :class="{ 'h-36': useFixedHeight }"
      :style="previewBoxStyle"
    >
      <img :src="e.previewUrl" class="absolute inset-0 h-full w-full object-cover" alt="" />
    </div>

    <div class="flex items-center justify-between gap-2">
      <div class="flex min-w-0 items-center gap-1.5 text-xs text-muted">
        <UIcon
          :name="e.model?.hasImage ? 'i-lucide-image' : 'i-lucide-image-off'"
          class="size-4 shrink-0"
          aria-hidden="true"
        />
        <span class="truncate">{{ statusLabel }}</span>
      </div>
      <div class="flex items-center gap-2">
        <UButton
          v-if="e.previewUrl !== null && !isCropOpen"
          color="neutral"
          variant="outline"
          icon="i-lucide-crop"
          :disabled="e.previewUrl === null"
          @click="openCrop"
        >
          Bijsnijden
        </UButton>
        <UFileUpload
          v-model="selectedImageFile"
          as="div"
          accept="image/*"
          :dropzone="false"
          :preview="false"
          reset
          @update:model-value="onImageFileChange"
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
              {{ e.model?.hasImage ? 'Vervangen' : 'Uploaden' }}
            </UButton>
          </template>
        </UFileUpload>
      </div>
    </div>

    <p v-if="sizeWarning" class="text-xs text-warning">
      {{ sizeWarning }}
    </p>
  </WCard>
</template>
