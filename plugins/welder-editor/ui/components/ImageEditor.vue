<script setup lang="ts">
/**
 * ImageEditor — section for editing a single image fill slot.
 *
 * ## Architecture
 *
 * Replaces the hand-rolled CropperCanvas (ADR-0006 Option B) with
 * vue-picture-cropper (Wave 1 PR #53). ADR-0006 is superseded.
 *
 * Two states:
 *   - thumbnail  — shows the current image preview + Crop / Upload buttons
 *   - cropper    — shows CropperComponent from useCropper() + Apply / Cancel buttons
 *
 * ## Apply flow
 *
 * 1. useCropper provides CropperComponent (renders cropperjs) + cropperApi.
 * 2. applyCrop() calls cropperApi.getBlob() → arrayBuffer() → Uint8Array.
 * 3. Emits `upload` with raw bytes — same as the file-upload path.
 * 4. Main thread treats this as a normal upload-image message; no transform math.
 *
 * ## Section discipline
 *
 * - Emits only — does NOT dispatch messages directly.
 * - Does NOT fetch data. Data flows in via props.
 * - Local refs only for UI state (isUploading, isCropOpen, etc.) — no Pinia store.
 *
 * ## Accessibility
 *
 * - Hidden file input triggered via visible UButton (not aria-hidden).
 * - aria-live region announces upload status.
 * - Status row with UIcon + text label for image state.
 * - All interactive elements keyboard-reachable via Nuxt UI defaults.
 *
 * Owner: ui-engineer. Resolves MON-2894451805.
 */

import { ref, computed } from 'vue';
import { useCropper } from 'vue-picture-cropper';
import 'cropperjs/dist/cropper.css';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ImageEditorProps {
  /**
   * Current image state: whether an image is set and its hash.
   */
  modelValue: {
    hasImage: boolean;
    imageHash: string | null;
  };
  /**
   * Base64 data-URL (e.g. `data:image/png;base64,...`) of the current fill bytes.
   * null = no preview yet. Fed by the parent via the image-upload:result message.
   */
  previewUrl: string | null;
  /**
   * Width of the Figma image slot in pixels.
   * null = unknown; falls back to a fixed-height preview box.
   * Together with fillH, determines the aspect ratio of the preview and the
   * locked aspect ratio of the crop rect.
   */
  fillW: number | null;
  /**
   * Height of the Figma image slot in pixels.
   * null = unknown; falls back to a fixed-height preview box.
   */
  fillH: number | null;
  /**
   * When true, the file picker and crop buttons are disabled.
   * @default false
   */
  disabled?: boolean;
}

const props = withDefaults(defineProps<ImageEditorProps>(), {
  disabled: false,
});

// ---------------------------------------------------------------------------
// Emits
// ---------------------------------------------------------------------------

export interface ImageEditorEmits {
  /**
   * Emitted when the user picks a new image file or applies a crop.
   * Carries raw image bytes as Uint8Array.
   * Parent wires this to actions.applyImage({ imageWrapId, bytes }).
   */
  upload: [bytes: Uint8Array];
}

const emit = defineEmits<ImageEditorEmits>();

// ---------------------------------------------------------------------------
// Local UI state — no Pinia (per section discipline)
// ---------------------------------------------------------------------------

const fileInput = ref<HTMLInputElement | null>(null);
const isUploading = ref<boolean>(false);
const isCropOpen = ref<boolean>(false);
const cropSourceUrl = ref<string | null>(null);
const sizeWarning = ref<string | null>(null);

// ---------------------------------------------------------------------------
// Cropper setup (vue-picture-cropper)
// ---------------------------------------------------------------------------

/**
 * Reactive cropperjs options. aspectRatio derived from Figma slot dimensions:
 * - finite number when both fillW + fillH are known and positive
 * - NaN = free aspect ratio (cropperjs treats NaN as free)
 *
 * viewMode: 1 — clamp crop rect to image boundaries.
 * background: false — hide checkerboard pattern.
 * autoCrop: true — initialise crop box on mount.
 */
const cropperOptions = computed(() => {
  const aspect =
    props.fillW !== null && props.fillH !== null && props.fillW > 0 && props.fillH > 0
      ? props.fillW / props.fillH
      : NaN;
  return {
    viewMode: 1 as const,
    aspectRatio: aspect,
    autoCrop: true,
    background: false,
  };
});

/**
 * Reactive props object passed to useCropper. Re-evaluated when cropSourceUrl
 * or cropperOptions changes so the cropper reacts to a new source image.
 */
const cropperProps = computed(() => ({
  img: cropSourceUrl.value ?? '',
  options: cropperOptions.value,
}));

/**
 * useCropper returns a [Component, api] tuple.
 * - CropperComponent — the Vue component to render in the template.
 * - cropperApi — getBlob / getDataURL / getFile, thin wrapper over cropperjs.
 */
const [CropperComponent, cropperApi] = useCropper(cropperProps);

// ---------------------------------------------------------------------------
// Preview box layout
// ---------------------------------------------------------------------------

/**
 * Inline style for the preview/cropper box. Sets aspect-ratio CSS property
 * when slot dimensions are known and within a reasonable range (0.4–3.0).
 * Outside that range we fall back to a fixed height so extreme panorama or
 * portrait fills don't produce unusably tiny or oversized thumbnails.
 */
const previewBoxStyle = computed<Record<string, string>>(() => {
  if (props.fillW === null || props.fillH === null) return {};
  if (props.fillW <= 0 || props.fillH <= 0) return {};
  const ratio = props.fillW / props.fillH;
  if (ratio < 0.4 || ratio > 3.0) return {};
  return { aspectRatio: String(ratio) };
});

/**
 * True when no aspect-ratio is derivable — the box uses a fixed h-36 / h-64
 * class instead of inline aspect-ratio.
 */
const useFixedHeight = computed<boolean>(() => Object.keys(previewBoxStyle.value).length === 0);

// ---------------------------------------------------------------------------
// Status label
// ---------------------------------------------------------------------------

const SOFT_MAX_BYTES = 2 * 1024 * 1024; // 2 MB

const statusLabel = computed<string>(() => {
  if (isUploading.value) return 'Uploading…';
  if (props.modelValue.hasImage) return 'Image set';
  return 'No image';
});

// ---------------------------------------------------------------------------
// File picker handlers
// ---------------------------------------------------------------------------

function triggerFileInput(): void {
  if (props.disabled) return;
  fileInput.value?.click();
}

async function onFileSelected(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const files = input.files;
  if (files === null || files.length === 0) return;

  const file: File | undefined = files[0];
  if (file === undefined) return;

  sizeWarning.value = null;

  if (file.size > SOFT_MAX_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    sizeWarning.value = `Large file (${mb} MB) — upload may take a moment.`;
  }

  isUploading.value = true;
  try {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    emit('upload', bytes);
  } finally {
    isUploading.value = false;
    input.value = '';
  }
}

// ---------------------------------------------------------------------------
// Crop handlers
// ---------------------------------------------------------------------------

/** Opens the crop panel, loading the current preview as source. */
function openCrop(): void {
  if (props.previewUrl === null || props.disabled) return;
  cropSourceUrl.value = props.previewUrl;
  isCropOpen.value = true;
}

/** Cancels the crop panel without emitting. */
function cancelCrop(): void {
  isCropOpen.value = false;
  cropSourceUrl.value = null;
}

/**
 * Applies the crop: extracts the cropped region as a PNG blob, converts to
 * Uint8Array, and emits `upload`. The parent treats this identically to a
 * file upload — main thread re-registers the image via figma.createImage().
 */
async function applyCrop(): Promise<void> {
  try {
    const blob = await cropperApi.getBlob({ imageSmoothingQuality: 'high' });
    if (blob === null) return;
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    emit('upload', bytes);
  } finally {
    isCropOpen.value = false;
    cropSourceUrl.value = null;
  }
}
</script>

<template>
  <div class="space-y-2">
    <!-- aria-live region for upload status announcements -->
    <div role="status" aria-live="polite" aria-atomic="true" class="sr-only">
      {{ statusLabel }}
    </div>

    <!--
      Cropper panel — shown while isCropOpen is true.
      CropperComponent mounts cropperjs on the img element and initialises with
      the locked aspect ratio derived from fillW / fillH.
    -->
    <div v-if="isCropOpen && cropSourceUrl !== null" class="space-y-2">
      <div
        class="w-full overflow-hidden rounded-xl bg-[--ui-bg-muted]"
        :class="{ 'h-64': useFixedHeight }"
        :style="previewBoxStyle"
      >
        <CropperComponent class="h-full w-full" />
      </div>

      <div class="flex items-center justify-end gap-2">
        <UButton size="md" color="neutral" variant="outline" @click="cancelCrop"> Cancel </UButton>
        <UButton size="md" color="primary" variant="solid" icon="i-lucide-check" @click="applyCrop">
          Apply
        </UButton>
      </div>
    </div>

    <!--
      Thumbnail — shown when a preview is available and the cropper is not open.
      Read-only; user crops via the "Crop" button below.
    -->
    <div
      v-else-if="previewUrl !== null"
      class="relative w-full overflow-hidden rounded-xl bg-[--ui-bg-muted] select-none"
      :class="{ 'h-36': useFixedHeight }"
      :style="previewBoxStyle"
    >
      <img
        :src="previewUrl"
        class="absolute inset-0 h-full w-full object-cover"
        alt=""
        aria-hidden="true"
      />
    </div>

    <!-- Status row + action buttons -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <UIcon
          :name="modelValue.hasImage ? 'i-lucide-image' : 'i-lucide-image-off'"
          class="size-4 shrink-0 text-muted"
          aria-hidden="true"
        />
        <span class="text-xs text-muted">{{ statusLabel }}</span>
      </div>

      <div class="flex items-center gap-2">
        <!-- Crop button — only when there is a preview and the cropper is closed -->
        <UButton
          v-if="previewUrl !== null && !isCropOpen"
          size="md"
          color="neutral"
          variant="outline"
          icon="i-lucide-crop"
          :disabled="disabled || previewUrl === null"
          :aria-label="'Crop image'"
          @click="openCrop"
        >
          Crop
        </UButton>

        <!-- Upload / Replace button -->
        <UButton
          size="md"
          color="neutral"
          variant="outline"
          icon="i-lucide-upload"
          :loading="isUploading"
          :disabled="disabled || isUploading"
          :aria-label="modelValue.hasImage ? 'Replace image' : 'Upload image'"
          @click="triggerFileInput"
        >
          {{ modelValue.hasImage ? 'Replace' : 'Upload' }}
        </UButton>
      </div>
    </div>

    <!-- 2 MB soft size warning -->
    <p v-if="sizeWarning" class="text-xs text-warning" role="status" aria-live="polite">
      {{ sizeWarning }}
    </p>

    <!-- Hidden native file input (image/* — accepts PNG, JPEG, WebP, GIF) -->
    <input
      ref="fileInput"
      type="file"
      accept="image/*"
      :disabled="disabled"
      tabindex="-1"
      aria-hidden="true"
      style="display: none"
      @change="onFileSelected"
    />
  </div>
</template>
