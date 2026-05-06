<script setup lang="ts">
/**
 * ImageEditor — image replace + crop section.
 *
 * Lifted from sections/ImageEditor/src/ImageEditor.vue.
 * Import paths updated: types from imageEditorTypes.js, CropperCanvas from flat layout.
 * Uses UButton (Nuxt UI v4) replacing the hand-rolled pick button.
 * Uses UAlert for error display (replacing inline <p role="alert">).
 *
 * Props-only renderer. Emits update:image (bytes) + update:cropTransform.
 * Does NOT import store.
 * Owner: ui-engineer. Sprint 5 Task 5.6.
 */

import { ref, computed, useId, useTemplateRef } from 'vue';
import type { Transform, ImageModel } from './imageEditorTypes.js';
import type { CropperCanvasProps } from './CropperCanvas.vue';
import CropperCanvas from './CropperCanvas.vue';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ImageEditorProps {
  model: ImageModel;
  imageDataUrl?: string;
  aspectRatio?: number | null;
  disabled?: boolean;
  loading?: boolean;
  error?: string;
}

const props = withDefaults(defineProps<ImageEditorProps>(), {
  aspectRatio: null,
  disabled: false,
  loading: false,
});

// ---------------------------------------------------------------------------
// Emits
// ---------------------------------------------------------------------------

const emit = defineEmits<{
  'update:image': [bytes: Uint8Array];
  'update:cropTransform': [transform: Transform];
}>();

// ---------------------------------------------------------------------------
// IDs
// ---------------------------------------------------------------------------

const fileInputId = useId();
const statusRegionId = useId();

// ---------------------------------------------------------------------------
// Template refs
// ---------------------------------------------------------------------------

const fileInputEl = useTemplateRef<HTMLInputElement>('fileInput');

// ---------------------------------------------------------------------------
// Local state
// ---------------------------------------------------------------------------

const uploadError = ref<string | null>(null);
const statusMessage = ref<string>('');

// ---------------------------------------------------------------------------
// Computed
// ---------------------------------------------------------------------------

const hasImage = computed<boolean>(() => props.model.imageHash !== null);

const displayError = computed<string | null>(() => props.error ?? uploadError.value);

const cropperProps = computed<Partial<CropperCanvasProps>>(() => {
  const p: Partial<CropperCanvasProps> = {
    aspectRatio: props.aspectRatio,
    disabled: props.disabled,
  };
  if (props.imageDataUrl !== undefined) {
    p.imageDataUrl = props.imageDataUrl;
  }
  if (props.model.cropTransform !== undefined) {
    p.cropTransform = props.model.cropTransform;
  }
  return p;
});

// ---------------------------------------------------------------------------
// File picker handlers
// ---------------------------------------------------------------------------

function onPickerClick(): void {
  if (props.disabled) return;
  uploadError.value = null;
  fileInputEl.value?.click();
}

async function onFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  input.value = '';

  if (!ACCEPTED_TYPES.includes(file.type)) {
    uploadError.value = `Unsupported file type: ${file.type || 'unknown'}. Use PNG, JPEG, or WebP.`;
    statusMessage.value = uploadError.value;
    return;
  }

  if (file.size > MAX_FILE_BYTES) {
    uploadError.value = `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 10 MB.`;
    statusMessage.value = uploadError.value;
    return;
  }

  try {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    uploadError.value = null;
    statusMessage.value = `Image "${file.name}" selected.`;
    emit('update:image', bytes);
  } catch {
    uploadError.value = 'Failed to read the selected file. Please try again.';
    statusMessage.value = uploadError.value;
  }
}

// ---------------------------------------------------------------------------
// Crop transform relay
// ---------------------------------------------------------------------------

function onCropTransformUpdate(transform: Transform): void {
  emit('update:cropTransform', transform);
}
</script>

<template>
  <section class="image-editor" :aria-label="'Image editor for ' + model.imageWrapId">
    <!-- aria-live region -->
    <div :id="statusRegionId" role="status" aria-live="polite" aria-atomic="true" class="sr-only">
      {{ statusMessage }}
    </div>

    <!-- File picker -->
    <div class="image-editor__picker-row">
      <input
        :id="fileInputId"
        ref="fileInput"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        :disabled="disabled"
        class="image-editor__file-input"
        aria-label="Choose image file"
        tabindex="-1"
        @change="onFileChange"
      />

      <UButton
        type="button"
        :disabled="disabled"
        :aria-disabled="disabled ? 'true' : undefined"
        :aria-controls="fileInputId"
        aria-label="Replace image — choose a PNG, JPEG, or WebP file"
        variant="outline"
        color="neutral"
        size="sm"
        @click="onPickerClick"
      >
        Replace image
      </UButton>

      <span v-if="hasImage" class="image-editor__status-hint">Image loaded</span>
      <span v-else class="image-editor__status-hint image-editor__status-hint--empty">
        No image — placeholder fill
      </span>
    </div>

    <!-- Error -->
    <UAlert
      v-if="displayError"
      color="error"
      variant="subtle"
      :description="displayError"
      role="alert"
    />

    <!-- Crop section -->
    <div v-if="hasImage" class="image-editor__crop-section">
      <p class="image-editor__crop-label" aria-hidden="true">Crop</p>

      <div
        v-if="loading"
        role="img"
        aria-busy="true"
        aria-label="Loading image preview"
        class="image-editor__crop-skeleton"
      />

      <CropperCanvas v-else v-bind="cropperProps" @update:crop-transform="onCropTransformUpdate" />
    </div>

    <div v-else class="image-editor__no-image">
      <p class="image-editor__no-image-text">Replace the image above to enable crop controls.</p>
    </div>
  </section>
</template>

<style scoped>
.image-editor {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.image-editor__picker-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.image-editor__file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}

.image-editor__status-hint {
  font-size: 11px;
  color: var(--color-label, #6b7280);
}

.image-editor__status-hint--empty {
  color: var(--color-label-muted, #9ca3af);
  font-style: italic;
}

.image-editor__crop-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.image-editor__crop-label {
  margin: 0;
  font-size: 11px;
  font-weight: 500;
  color: var(--color-label, #6b7280);
  user-select: none;
}

.image-editor__crop-skeleton {
  width: 100%;
  height: 160px;
  border-radius: 4px;
  background: linear-gradient(
    90deg,
    var(--color-skeleton-a, #e5e7eb) 0%,
    var(--color-skeleton-b, #f3f4f6) 50%,
    var(--color-skeleton-a, #e5e7eb) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 1.4s ease-in-out infinite;
}

@media (prefers-reduced-motion: reduce) {
  .image-editor__crop-skeleton {
    animation: none;
    background: var(--color-skeleton-a, #e5e7eb);
  }
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.image-editor__no-image {
  padding: 12px 8px;
  border: 1px dashed var(--color-input-border, #d1d5db);
  border-radius: 4px;
  text-align: center;
}

.image-editor__no-image-text {
  margin: 0;
  font-size: 11px;
  color: var(--color-label-muted, #9ca3af);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
</style>
