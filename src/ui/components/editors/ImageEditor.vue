<!--
  ImageEditor — v-model-gebonden editor voor de
  General → Image-sectie (spec §9 T10 + T28c).

  Props:
    modelValue: { hasImage: boolean; imageHash: string | null }

  Emits:
    upload (bytes: Uint8Array) — ruwe PNG/JPG-bytes die App.vue naar
      de main-thread stuurt via `upload-image`. Wordt gefired door
      zowel de "Vervangen"-flow (nieuwe file) als de "Toepassen"-flow
      van de cropper (gecropte bytes van de huidige preview).

  Architectuur-switch (T28c): custom drag-focal-point + imageTransform-
  matrix is vervangen door een canvas-based crop met vue-picture-cropper.
  Main-thread blijft op scaleMode: 'FILL' — we uploaden gecropte bytes.

  FIG-MSG-01: bytes gaan via typed `upload-image`-message (Uint8Array
    overleeft structured-cloning tussen iframe en main-thread).
-->
<script setup lang="ts">
import { ref, computed } from 'vue';
import { useCropper } from 'vue-picture-cropper';
import 'cropperjs/dist/cropper.css';
import { compressImageForUpload } from '../../utils/image-compress';
import { formatBytes } from '../../utils/format-bytes';

export interface ImageValue {
  hasImage: boolean;
  imageHash: string | null;
}

interface Props {
  modelValue: ImageValue;
  /**
   * Base64 data-URL (bv. `data:image/png;base64,...`) van de huidige fill-bytes.
   * null = geen preview nog. Wordt gevoed door GeneralPanel via de
   * `image-preview`-bridge-message (T28a).
   */
  previewUrl: string | null;
  /**
   * Breedte van het Figma image-slot in pixels. null = onbekend (fallback h-36).
   * Samen met fillH bepaalt dit de aspect-ratio van de preview-box én de
   * gelockte aspect-ratio van het crop-rect, zodat wat de user bijsnijdt
   * exact past in het Figma-slot (scaleMode FILL, geen rek).
   */
  fillW: number | null;
  /**
   * Hoogte van het Figma image-slot in pixels. null = onbekend (fallback h-36).
   */
  fillH: number | null;
  /**
   * Byte length of the current image (post-compression, as Figma stores it).
   * null = no image / not yet known. Drives the status-row label so the
   * user can see how heavy the slide is at a glance.
   */
  sizeBytes?: number | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  upload: [bytes: Uint8Array];
}>();

const selectedImageFile = ref<File | null>(null);
const isUploading = ref<boolean>(false);
const sizeWarning = ref<string | null>(null);

// Cropper state (T28c): panel zichtbaar + welke bron-URL in de cropper
// geladen wordt. cropSourceUrl wordt op "Bijsnijden"-click gelijk aan
// de huidige previewUrl; de cropper laadt die in een <img> en initieert
// cropperjs. Op "Toepassen" extracten we de cropped blob en uploaden de
// bytes via de bestaande `upload`-emit — main-thread hoeft niets nieuws.
const isCropOpen = ref<boolean>(false);
const cropSourceUrl = ref<string | null>(null);

// Opties voor cropperjs; reactive via computed omdat aspect-ratio van
// fillW/fillH afhangt. NaN = free aspect (fallback wanneer slot-dimensies
// niet bekend zijn). viewMode=1 beperkt het crop-rect tot binnen de image.
// background=false verbergt het schaakbord-patroon — past beter bij de
// Welder-branding.
const cropperOptions = computed(() => {
  const aspect =
    props.fillW !== null && props.fillH !== null && props.fillW > 0 && props.fillH > 0
      ? props.fillW / props.fillH
      : NaN;
  return {
    viewMode: 1 as 1,
    aspectRatio: aspect,
    autoCrop: true,
    background: false,
  };
});

// useCropper geeft een [Component, cropperApi] tuple terug. De vue-picture-
// cropper v1 API exposeert getBlob/getDataURL/getFile via deze api-object;
// het is niet hetzelfde als de ruwe cropperjs-instance maar een thin wrapper.
// Lazy args: we passen een computed door zodat `img` up-to-date blijft wanneer
// de user een andere preview laadt tijdens een openstaande cropper-sessie.
const cropperProps = computed(() => ({
  img: cropSourceUrl.value ?? '',
  options: cropperOptions.value,
}));
const [CropperComponent, cropperApi] = useCropper(cropperProps);

// Berekend inline-style voor de thumbnail-box: aspect-ratio op basis van
// fill-dimensies wanneer beschikbaar. Zelfde klemming als voorheen zodat
// extreme panorama/portret-fills geen enorme of piepkleine thumbnail geven.
const previewBoxStyle = computed<Record<string, string>>(() => {
  const empty: Record<string, string> = {};
  if (props.fillW === null || props.fillH === null) return empty;
  if (props.fillW <= 0 || props.fillH <= 0) return empty;
  const ratio = props.fillW / props.fillH;
  if (ratio < 0.4 || ratio > 3.0) return empty;
  return { aspectRatio: String(ratio) };
});

const useFixedHeight = computed<boolean>(() => {
  return Object.keys(previewBoxStyle.value).length === 0;
});

const SOFT_MAX_BYTES = 2 * 1024 * 1024;

const statusLabel = computed<string>(() => {
  if (isUploading.value) return 'Bezig met uploaden…';
  if (props.modelValue.hasImage) {
    const size = props.sizeBytes;
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
    emit('upload', bytes);
  } finally {
    isUploading.value = false;
    selectedImageFile.value = null;
  }
}

/**
 * Open the cropper on the current preview. Sourcing from `previewUrl`
 * means every Bijsnijden re-crops what's currently on the slide —
 * deliberately consistent across iterations. Quality compounds with
 * each pass (each crop re-encodes JPEG q=0.85), so the user should
 * treat Bijsnijden as a destructive operation: get the framing right
 * the first time, or re-upload the source.
 */
function openCrop(): void {
  if (props.previewUrl === null) return;
  cropSourceUrl.value = props.previewUrl;
  isCropOpen.value = true;
}

/** Sluit het cropper-panel zonder te committen. */
function cancelCrop(): void {
  isCropOpen.value = false;
  cropSourceUrl.value = null;
}

/** Commit: haal de gecropte regio op als PNG-blob, converteer naar
 *  Uint8Array en emit `upload`. De main-thread behandelt dit als een
 *  gewone upload-image — scaleMode FILL, geen transform-math. */
async function applyCrop(): Promise<void> {
  try {
    const blob = await cropperApi.getBlob({ imageSmoothingQuality: 'high' });
    if (blob === null) return;
    const buffer = await blob.arrayBuffer();
    const raw = new Uint8Array(buffer);
    const bytes = await compressImageForUpload(raw);
    emit('upload', bytes);
  } finally {
    isCropOpen.value = false;
    cropSourceUrl.value = null;
  }
}
</script>

<template>
  <div class="space-y-2">
    <!--
      Cropper-panel — verschijnt zodra isCropOpen true is. De CropperComponent
      laadt cropSourceUrl in een <img> en initieert cropperjs met de gelockte
      aspect-ratio van het Figma-slot. Geen drag-focal-point meer; de user
      past nu direct het crop-rect aan.
    -->
    <div v-if="isCropOpen && cropSourceUrl !== null" class="space-y-2">
      <div
        class="w-full overflow-hidden rounded-xl bg-muted"
        :class="{ 'h-64': useFixedHeight }"
        :style="previewBoxStyle"
      >
        <CropperComponent class="h-full w-full" />
      </div>
      <div class="flex items-center justify-end gap-2">
        <UButton size="md" color="neutral" variant="outline" @click="cancelCrop">
          Annuleren
        </UButton>
        <UButton size="md" color="primary" variant="solid" icon="i-lucide-check" @click="applyCrop">
          Toepassen
        </UButton>
      </div>
    </div>

    <!--
      Thumbnail — rendert alleen wanneer er fill-bytes zijn binnengekomen
      én de cropper niet open staat. Geen drag, geen hover-hint: dit is
      een read-only miniatuur; bijsnijden gaat via de "Bijsnijden"-knop.
    -->
    <div
      v-else-if="previewUrl !== null"
      class="relative w-full overflow-hidden rounded-xl bg-muted select-none"
      :class="{ 'h-36': useFixedHeight }"
      :style="previewBoxStyle"
    >
      <img :src="previewUrl" class="absolute inset-0 h-full w-full object-cover" alt="" />
    </div>

    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <UIcon
          :name="modelValue.hasImage ? 'i-lucide-image' : 'i-lucide-image-off'"
          class="size-4 shrink-0 text-muted"
        />
        <span class="text-xs text-muted">{{ statusLabel }}</span>
      </div>
      <div class="flex items-center gap-2">
        <UButton
          v-if="previewUrl !== null && !isCropOpen"
          size="md"
          color="neutral"
          variant="outline"
          icon="i-lucide-crop"
          :disabled="previewUrl === null"
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
              size="md"
              color="neutral"
              variant="outline"
              icon="i-lucide-upload"
              :loading="isUploading"
              :disabled="isUploading"
              @click="open()"
            >
              {{ modelValue.hasImage ? 'Vervangen' : 'Uploaden' }}
            </UButton>
          </template>
        </UFileUpload>
      </div>
    </div>

    <p v-if="sizeWarning" class="text-xs text-warning">
      {{ sizeWarning }}
    </p>
  </div>
</template>
