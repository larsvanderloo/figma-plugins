<script setup lang="ts">
/**
 * ImageEditor — section for editing a single ImageWrap fill slot.
 *
 * ## Responsibilities
 *
 * Two functions:
 *
 * 1. **Replace image fill** — a file picker (<input type="file">) styled via
 *    a visible <button> proxy. When the user selects a file the raw bytes are
 *    read as ArrayBuffer → Uint8Array and emitted as `update:image`. The
 *    consuming plugin view wires this to `actions.applyImage(bytes)` which
 *    posts the `apply-image` message to the code side, which calls
 *    `figma.createImage(bytes)`.
 *
 * 2. **Crop transform** — a <CropperCanvas> component rendered when
 *    `imageDataUrl` is provided. User drag/keyboard adjustments emit
 *    `update:cropTransform` (debounced 300 ms inside CropperCanvas). The
 *    consuming plugin view wires this to an `apply-crop` action (v0.2.0).
 *
 * ## Section discipline
 *
 * - Emits only — does NOT dispatch messages directly. App.vue wires events.
 * - Does NOT fetch data. Data flows in via props (model + imageDataUrl).
 * - Sections accept `loading` and `error` in their props contract; this
 *   section surfaces a `loading` state (spinner placeholder while the code
 *   side retrieves image bytes) and an `error` state (file type / size
 *   validation failures).
 *
 * ## Accessibility
 *
 * - The hidden <input type="file"> is associated with the visible trigger
 *   button via `aria-controls`.
 * - The trigger button has an explicit aria-label.
 * - When `model.imageHash` is null the crop section is hidden entirely
 *   (no image to crop) and a helper text is shown.
 * - When `disabled` is true the button and CropperCanvas are both inert.
 * - An aria-live="polite" region announces async status updates (upload
 *   success / error).
 *
 * ## File validation (client-side, pre-emit)
 *
 * Accepted MIME types: image/png, image/jpeg, image/webp.
 * Maximum file size: 10 MB (client-side guard; code side re-validates).
 * Out-of-range files set `uploadError` and do not emit.
 *
 * Ownership: ui-engineer.
 */

import { ref, computed, useId, useTemplateRef } from 'vue';
import type { Transform, ImageModel } from './types.js';
import CropperCanvas from './CropperCanvas.vue';
import type { CropperCanvasProps } from './CropperCanvas.vue';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ImageEditorProps {
  /**
   * The current ImageWrap state. Drives the crop section visibility and
   * provides the imageHash for the crop UI.
   */
  model: ImageModel;
  /**
   * Data URL (or object URL) for the current image fill.
   * Provided by App.vue after the image-upload:result round-trip.
   * When undefined the crop section shows a loading skeleton.
   */
  imageDataUrl?: string;
  /**
   * Optional aspect-ratio lock for the crop box.
   * - number — width / height (e.g. 16/9).
   * - null   — unlocked (default).
   * @default null
   */
  aspectRatio?: number | null;
  /**
   * When true the file picker and crop handles are disabled.
   * @default false
   */
  disabled?: boolean;
  /**
   * When true shows a loading skeleton in the crop area.
   * Used while App.vue is awaiting the image-upload:result response.
   * @default false
   */
  loading?: boolean;
  /**
   * An error string to display in the section (e.g. from a failed
   * apply-image:result). When set, the error is shown in the aria-live
   * region and inline below the file picker.
   */
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

export interface ImageEditorEmits {
  /**
   * Emitted when the user picks a new image file.
   * Carries raw image bytes as Uint8Array.
   * App.vue wires this to actions.applyImage({ imageWrapId, bytes }).
   */
  'update:image': [bytes: Uint8Array];
  /**
   * Emitted (debounced 300 ms, from CropperCanvas) when the crop box changes.
   * App.vue wires this to the apply-crop action (v0.2.0).
   */
  'update:cropTransform': [transform: Transform];
}

const emit = defineEmits<ImageEditorEmits>();

// ---------------------------------------------------------------------------
// IDs for accessibility wiring
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

/** Client-side validation error (file type / size). Cleared on next pick. */
const uploadError = ref<string | null>(null);

/** Status message announced via aria-live (success / transient error). */
const statusMessage = ref<string>('');

// ---------------------------------------------------------------------------
// Computed
// ---------------------------------------------------------------------------

/** True when an image is available for cropping. */
const hasImage = computed<boolean>(() => props.model.imageHash !== null);

/** Combined error: prop-level external error or local upload validation error. */
const displayError = computed<string | null>(() => props.error ?? uploadError.value);

/**
 * Props forwarded to CropperCanvas. We use v-bind so that optional props
 * that are undefined are simply absent (not bound as `undefined`), which
 * satisfies exactOptionalPropertyTypes on CropperCanvas's prop contract.
 */
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

  // Reset input so the same file can be re-picked after an error.
  input.value = '';

  // Validate MIME type.
  if (!ACCEPTED_TYPES.includes(file.type)) {
    uploadError.value = `Unsupported file type: ${file.type || 'unknown'}. Use PNG, JPEG, or WebP.`;
    statusMessage.value = uploadError.value;
    return;
  }

  // Validate size.
  if (file.size > MAX_FILE_BYTES) {
    uploadError.value = `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 10 MB.`;
    statusMessage.value = uploadError.value;
    return;
  }

  // Read bytes.
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
    <!-- ------------------------------------------------------------------ -->
    <!-- aria-live region — announces upload status / errors asynchronously  -->
    <!-- ------------------------------------------------------------------ -->
    <div :id="statusRegionId" role="status" aria-live="polite" aria-atomic="true" class="sr-only">
      {{ statusMessage }}
    </div>

    <!-- ------------------------------------------------------------------ -->
    <!-- File picker                                                          -->
    <!-- ------------------------------------------------------------------ -->
    <div class="image-editor__picker-row">
      <!-- Hidden native file input -->
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

      <!-- Visible trigger button (proxies the hidden input) -->
      <button
        type="button"
        :disabled="disabled"
        :aria-disabled="disabled ? 'true' : undefined"
        :aria-controls="fileInputId"
        aria-label="Replace image — choose a PNG, JPEG, or WebP file"
        class="image-editor__pick-button"
        @click="onPickerClick"
      >
        Replace image
      </button>

      <!-- Current image status hint -->
      <span v-if="hasImage" class="image-editor__status-hint"> Image loaded </span>
      <span v-else class="image-editor__status-hint image-editor__status-hint--empty">
        No image — placeholder fill
      </span>
    </div>

    <!-- ------------------------------------------------------------------ -->
    <!-- Validation / external error                                          -->
    <!-- ------------------------------------------------------------------ -->
    <p v-if="displayError" role="alert" class="image-editor__error">
      {{ displayError }}
    </p>

    <!-- ------------------------------------------------------------------ -->
    <!-- Crop section — only shown when an image is present                  -->
    <!-- ------------------------------------------------------------------ -->
    <div v-if="hasImage" class="image-editor__crop-section">
      <p class="image-editor__crop-label" aria-hidden="true">Crop</p>

      <!-- Loading skeleton while App.vue awaits image bytes -->
      <div
        v-if="loading"
        role="img"
        aria-busy="true"
        aria-label="Loading image preview"
        class="image-editor__crop-skeleton"
      />

      <!-- CropperCanvas -->
      <CropperCanvas v-else v-bind="cropperProps" @update:crop-transform="onCropTransformUpdate" />
    </div>

    <!-- No-image placeholder -->
    <div v-else class="image-editor__no-image">
      <p class="image-editor__no-image-text">Replace the image above to enable crop controls.</p>
    </div>
  </section>
</template>

<style scoped>
/*
 * Compact density — matches the Figma plugin iframe context.
 * Colors reference CSS custom properties so they adapt to Figma's light/dark
 * themes. Fallback values are Tailwind slate equivalents.
 */

.image-editor {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* ---- File picker ---- */

.image-editor__picker-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

/* Visually hide the native input while keeping it accessible to AT */
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

.image-editor__pick-button {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.5;
  color: var(--color-button-text, #111827);
  background: var(--color-button-bg, #f9fafb);
  border: 1px solid var(--color-button-border, #d1d5db);
  border-radius: 4px;
  cursor: pointer;
  outline: none;
  white-space: nowrap;
}

.image-editor__pick-button:hover:not(:disabled) {
  background: var(--color-button-hover-bg, #f3f4f6);
}

.image-editor__pick-button:focus-visible {
  outline: 2px solid var(--color-focus-ring, #2563eb);
  outline-offset: 2px;
}

.image-editor__pick-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.image-editor__status-hint {
  font-size: 11px;
  color: var(--color-label, #6b7280);
}

.image-editor__status-hint--empty {
  color: var(--color-label-muted, #9ca3af);
  font-style: italic;
}

/* ---- Error ---- */

.image-editor__error {
  margin: 0;
  padding: 6px 8px;
  font-size: 11px;
  line-height: 1.4;
  color: var(--color-error-text, #b91c1c);
  background: var(--color-error-bg, #fef2f2);
  border: 1px solid var(--color-error-border, #fecaca);
  border-radius: 4px;
}

/* ---- Crop section ---- */

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

/* Respect prefers-reduced-motion */
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

/* ---- No-image placeholder ---- */

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

/* sr-only utility */
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
