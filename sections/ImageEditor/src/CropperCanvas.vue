<script setup lang="ts">
/**
 * CropperCanvas — canvas-based crop UI for a single image fill.
 *
 * ## Responsibilities
 *
 * - Renders the source image on a <canvas> element scaled to fit the
 *   component's bounding box.
 * - Overlays a crop box with eight drag handles (4 corners + 4 edges).
 * - Each handle is a <div role="slider"> with full keyboard support
 *   (Arrow keys = 1 px, Shift+Arrow = 10 px).
 * - Maintains an internal CropRect in normalised image coordinates [0..1].
 * - Converts the CropRect → Transform via cropRectToTransform() and emits
 *   `update:cropTransform` (debounced 300 ms) on every change.
 * - Accepts an `aspectRatio` prop (width / height); when non-null the crop
 *   box is aspect-locked on every resize operation.
 * - Accepts a `disabled` prop; when true, all drag and keyboard interactions
 *   are suppressed.
 *
 * ## Canvas / jsdom note
 *
 * HTMLCanvasElement.prototype.getContext returns null in jsdom. All canvas
 * operations are guarded with `if (ctx)` to prevent null-dereference. Tests
 * mock getContext to a minimal stub; the model logic (CropRect, Transform
 * computation, handle interactions) is fully testable regardless.
 *
 * ## Coordinate systems
 *
 * Three coordinate systems are in play:
 *   1. Normalised image space [0..1 × 0..1] — CropRect lives here.
 *   2. Canvas pixel space — mouse events are translated into this space,
 *      then normalised.
 *   3. Transform matrix space — the final emit value, derived from CropRect.
 *
 * ## Performance
 *
 * The canvas is redrawn via requestAnimationFrame. ResizeObserver tracks
 * the canvas container's size and re-scales on layout changes. Debounce
 * ensures the emit fires at most once per 300 ms burst of pointer/keyboard
 * input, matching the pattern in TitleDescriptionEditor.
 *
 * ## Accessibility
 *
 * Each handle has:
 *   - role="slider"
 *   - aria-label describing its position and axis
 *   - aria-valuemin / aria-valuemax (0 / 100 as percentage)
 *   - aria-valuenow (current value in percentage, rounded)
 *   - aria-orientation (horizontal for left/right/top/bottom edges,
 *     vertical for top/bottom edges, undefined for corner handles)
 *   - tabindex="0" (keyboard reachable)
 *
 * ## Out of scope for v0.1.0 (per ADR-0006)
 *
 * - Rotation, zoom, multi-region crop, filters.
 *
 * Ownership: ui-engineer.
 */

import {
  ref,
  computed,
  watch,
  onMounted,
  onUnmounted,
  useTemplateRef,
  nextTick,
  onBeforeUnmount,
} from 'vue';
import type { Transform, CropRect, HandlePosition } from './types.js';
import { cropRectToTransform, transformToCropRect } from './cropMath.js';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface CropperCanvasProps {
  /**
   * The image to render inside the canvas, as a data URL or object URL.
   * When undefined/empty the canvas shows a neutral placeholder background.
   */
  imageDataUrl?: string;
  /**
   * The current crop transform. When undefined the crop box covers the full
   * image (identity transform).
   */
  cropTransform?: Transform;
  /**
   * Width / height aspect-ratio lock for the crop box.
   * - number — lock (e.g. 16/9, 4/3, 1).
   * - null   — unlocked (free resize).
   * @default null
   */
  aspectRatio?: number | null;
  /**
   * When true all drag and keyboard interactions are suppressed.
   * @default false
   */
  disabled?: boolean;
}

const props = withDefaults(defineProps<CropperCanvasProps>(), {
  aspectRatio: null,
  disabled: false,
});

// ---------------------------------------------------------------------------
// Emits
// ---------------------------------------------------------------------------

export interface CropperCanvasEmits {
  /**
   * Emitted (debounced 300 ms) when the user adjusts the crop box.
   * Carries the new 2×3 Transform matrix.
   */
  'update:cropTransform': [transform: Transform];
}

const emit = defineEmits<CropperCanvasEmits>();

// ---------------------------------------------------------------------------
// Template refs
// ---------------------------------------------------------------------------

const canvasEl = useTemplateRef<HTMLCanvasElement>('canvas');
const containerEl = useTemplateRef<HTMLDivElement>('container');

// ---------------------------------------------------------------------------
// Canvas context
// ---------------------------------------------------------------------------

let ctx: CanvasRenderingContext2D | null = null;

// ---------------------------------------------------------------------------
// Canvas drawing — rAF handle
// Declared early so scheduleRedraw() can reference it before its definition
// is reached. The watch({ immediate: true }) below can trigger scheduleRedraw
// synchronously (e.g. via the Image load shim in tests) before the let
// declaration at the bottom of the drawing block would normally be hoisted.
// ---------------------------------------------------------------------------

let rafId: number | null = null;

// ---------------------------------------------------------------------------
// Image loading
// ---------------------------------------------------------------------------

const loadedImage = ref<HTMLImageElement | null>(null);

function loadImage(url: string): void {
  const img = new Image();
  img.onload = () => {
    loadedImage.value = img;
    scheduleRedraw();
  };
  img.onerror = () => {
    loadedImage.value = null;
  };
  img.src = url;
}

watch(
  () => props.imageDataUrl,
  (url) => {
    if (url) {
      loadImage(url);
    } else {
      loadedImage.value = null;
      scheduleRedraw();
    }
  },
  { immediate: true },
);

// ---------------------------------------------------------------------------
// Canvas geometry — canvas pixel dimensions
// ---------------------------------------------------------------------------

const canvasW = ref<number>(240);
const canvasH = ref<number>(160);

// ---------------------------------------------------------------------------
// Convert Transform ↔ CropRect
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Internal crop rect — normalised [0..1]
// ---------------------------------------------------------------------------

const cropRect = ref<CropRect>(
  props.cropTransform ? transformToCropRect(props.cropTransform) : { x: 0, y: 0, w: 1, h: 1 },
);

// Keep in sync with prop changes (e.g. slide switch)
watch(
  () => props.cropTransform,
  (t) => {
    cropRect.value = t ? transformToCropRect(t) : { x: 0, y: 0, w: 1, h: 1 };
    scheduleRedraw();
  },
);

// ---------------------------------------------------------------------------
// Debounced emit
// ---------------------------------------------------------------------------

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function clearPending(): void {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

function scheduleEmit(): void {
  clearPending();
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    emit('update:cropTransform', cropRectToTransform(cropRect.value));
  }, 300);
}

// ---------------------------------------------------------------------------
// Clamp helpers
// ---------------------------------------------------------------------------

const MIN_CROP = 0.05; // minimum crop dimension in normalised units

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

/**
 * Enforce aspect ratio on a proposed new crop rect.
 * Adjusts w and h so w / h === aspectRatio, anchored at the current x, y.
 * If the adjusted dimensions would overflow [0..1], they are clamped and
 * the other axis is adjusted accordingly.
 */
function applyAspectLock(rect: CropRect, ratio: number): CropRect {
  let { x, y, w, h } = rect;

  // Derive h from w, then clamp to available space.
  h = w / ratio;

  // If h overflows, derive w from the max available h instead.
  const maxH = 1 - y;
  if (h > maxH) {
    h = maxH;
    w = h * ratio;
  }

  // Clamp w to available space.
  const maxW = 1 - x;
  if (w > maxW) {
    w = maxW;
    h = w / ratio;
  }

  return { x, y, w: clamp(w, MIN_CROP, 1 - x), h: clamp(h, MIN_CROP, 1 - y) };
}

/**
 * Apply a handle delta (dx, dy in normalised units) and return the new CropRect.
 * Each handle adjusts different edges of the crop box.
 */
function applyHandleDelta(
  rect: CropRect,
  handle: HandlePosition,
  dx: number,
  dy: number,
  ratio: number | null,
): CropRect {
  let { x, y, w, h } = rect;

  switch (handle) {
    case 'top-left':
      x += dx;
      y += dy;
      w -= dx;
      h -= dy;
      break;
    case 'top':
      y += dy;
      h -= dy;
      break;
    case 'top-right':
      y += dy;
      w += dx;
      h -= dy;
      break;
    case 'right':
      w += dx;
      break;
    case 'bottom-right':
      w += dx;
      h += dy;
      break;
    case 'bottom':
      h += dy;
      break;
    case 'bottom-left':
      x += dx;
      w -= dx;
      h += dy;
      break;
    case 'left':
      x += dx;
      w -= dx;
      break;
  }

  // Clamp to valid bounds.
  x = clamp(x, 0, x + w - MIN_CROP);
  y = clamp(y, 0, y + h - MIN_CROP);
  w = clamp(w, MIN_CROP, 1 - x);
  h = clamp(h, MIN_CROP, 1 - y);

  const updated: CropRect = { x, y, w, h };

  // Apply aspect lock after clamping.
  if (ratio !== null && ratio > 0) {
    return applyAspectLock(updated, ratio);
  }

  return updated;
}

// ---------------------------------------------------------------------------
// Canvas drawing
// ---------------------------------------------------------------------------

function scheduleRedraw(): void {
  if (rafId !== null) return;
  rafId = requestAnimationFrame(() => {
    rafId = null;
    redraw();
  });
}

function redraw(): void {
  if (!ctx) return;
  const cw = canvasW.value;
  const ch = canvasH.value;

  ctx.clearRect(0, 0, cw, ch);

  // Background.
  ctx.fillStyle = 'var(--color-canvas-bg, #f3f4f6)';
  ctx.fillRect(0, 0, cw, ch);

  // Draw image if loaded.
  const img = loadedImage.value;
  if (img && img.width > 0 && img.height > 0) {
    ctx.drawImage(img, 0, 0, cw, ch);
  }

  // Darken the masked region (outside crop box).
  const r = cropRect.value;
  const bx = r.x * cw;
  const by = r.y * ch;
  const bw = r.w * cw;
  const bh = r.h * ch;

  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  // Top band
  ctx.fillRect(0, 0, cw, by);
  // Bottom band
  ctx.fillRect(0, by + bh, cw, ch - (by + bh));
  // Left band
  ctx.fillRect(0, by, bx, bh);
  // Right band
  ctx.fillRect(bx + bw, by, cw - (bx + bw), bh);

  // Crop box border.
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1;
  ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);

  // Rule-of-thirds grid lines.
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 0.5;
  for (let i = 1; i <= 2; i++) {
    const gx = bx + (bw / 3) * i;
    const gy = by + (bh / 3) * i;
    ctx.beginPath();
    ctx.moveTo(gx, by);
    ctx.lineTo(gx, by + bh);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(bx, gy);
    ctx.lineTo(bx + bw, gy);
    ctx.stroke();
  }
}

// ---------------------------------------------------------------------------
// Compute handle pixel positions for rendering overlays and interaction.
// ---------------------------------------------------------------------------

interface HandleGeometry {
  position: HandlePosition;
  cx: number; // centre x in canvas pixels
  cy: number; // centre y in canvas pixels
  cursor: string;
  ariaLabel: string;
  ariaOrientation: 'horizontal' | 'vertical' | undefined;
  ariaValueX: number; // percentage (0–100) for x-axis value
  ariaValueY: number; // percentage (0–100) for y-axis value
}

const handles = computed<HandleGeometry[]>(() => {
  const r = cropRect.value;
  const cw = canvasW.value;
  const ch = canvasH.value;

  const left = r.x * cw;
  const top = r.y * ch;
  const right = (r.x + r.w) * cw;
  const bottom = (r.y + r.h) * ch;
  const midX = (left + right) / 2;
  const midY = (top + bottom) / 2;

  const xPct = Math.round(r.x * 100);
  const yPct = Math.round(r.y * 100);
  const rPct = Math.round((r.x + r.w) * 100);
  const bPct = Math.round((r.y + r.h) * 100);

  return [
    {
      position: 'top-left',
      cx: left,
      cy: top,
      cursor: 'nwse-resize',
      ariaLabel: 'Crop top-left corner',
      ariaOrientation: undefined,
      ariaValueX: xPct,
      ariaValueY: yPct,
    },
    {
      position: 'top',
      cx: midX,
      cy: top,
      cursor: 'ns-resize',
      ariaLabel: 'Crop top edge',
      ariaOrientation: 'vertical',
      ariaValueX: midX,
      ariaValueY: yPct,
    },
    {
      position: 'top-right',
      cx: right,
      cy: top,
      cursor: 'nesw-resize',
      ariaLabel: 'Crop top-right corner',
      ariaOrientation: undefined,
      ariaValueX: rPct,
      ariaValueY: yPct,
    },
    {
      position: 'right',
      cx: right,
      cy: midY,
      cursor: 'ew-resize',
      ariaLabel: 'Crop right edge',
      ariaOrientation: 'horizontal',
      ariaValueX: rPct,
      ariaValueY: midY,
    },
    {
      position: 'bottom-right',
      cx: right,
      cy: bottom,
      cursor: 'nwse-resize',
      ariaLabel: 'Crop bottom-right corner',
      ariaOrientation: undefined,
      ariaValueX: rPct,
      ariaValueY: bPct,
    },
    {
      position: 'bottom',
      cx: midX,
      cy: bottom,
      cursor: 'ns-resize',
      ariaLabel: 'Crop bottom edge',
      ariaOrientation: 'vertical',
      ariaValueX: midX,
      ariaValueY: bPct,
    },
    {
      position: 'bottom-left',
      cx: left,
      cy: bottom,
      cursor: 'nesw-resize',
      ariaLabel: 'Crop bottom-left corner',
      ariaOrientation: undefined,
      ariaValueX: xPct,
      ariaValueY: bPct,
    },
    {
      position: 'left',
      cx: left,
      cy: midY,
      cursor: 'ew-resize',
      ariaLabel: 'Crop left edge',
      ariaOrientation: 'horizontal',
      ariaValueX: xPct,
      ariaValueY: midY,
    },
  ];
});

// ---------------------------------------------------------------------------
// Pointer drag
// ---------------------------------------------------------------------------

const HANDLE_SIZE = 10; // px, half-size for hit-testing is 5px

interface DragState {
  handle: HandlePosition;
  startX: number;
  startY: number;
  startRect: CropRect;
}

let drag: DragState | null = null;

function onHandlePointerDown(event: PointerEvent, handle: HandlePosition): void {
  if (props.disabled) return;
  event.preventDefault();
  event.stopPropagation();
  (event.target as HTMLElement).setPointerCapture(event.pointerId);
  drag = {
    handle,
    startX: event.clientX,
    startY: event.clientY,
    startRect: { ...cropRect.value },
  };
}

function onPointerMove(event: PointerEvent): void {
  if (!drag || props.disabled) return;
  const cw = canvasW.value;
  const ch = canvasH.value;
  if (cw === 0 || ch === 0) return;

  const dx = (event.clientX - drag.startX) / cw;
  const dy = (event.clientY - drag.startY) / ch;

  cropRect.value = applyHandleDelta(drag.startRect, drag.handle, dx, dy, props.aspectRatio ?? null);
  scheduleRedraw();
  scheduleEmit();
}

function onPointerUp(): void {
  drag = null;
}

// ---------------------------------------------------------------------------
// Keyboard interaction on handles
// ---------------------------------------------------------------------------

function onHandleKeyDown(event: KeyboardEvent, handle: HandlePosition): void {
  if (props.disabled) return;

  const arrowKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
  if (!arrowKeys.includes(event.key)) return;

  // Prevent host shortcuts from leaking — arrow keys are safe inside the
  // plugin iframe and don't shadow Figma's own Cmd-* shortcuts.
  event.preventDefault();

  const step = event.shiftKey ? 10 : 1;
  const cw = canvasW.value || 1;
  const ch = canvasH.value || 1;

  let dx = 0;
  let dy = 0;

  switch (event.key) {
    case 'ArrowLeft':
      dx = -step / cw;
      break;
    case 'ArrowRight':
      dx = step / cw;
      break;
    case 'ArrowUp':
      dy = -step / ch;
      break;
    case 'ArrowDown':
      dy = step / ch;
      break;
  }

  cropRect.value = applyHandleDelta(cropRect.value, handle, dx, dy, props.aspectRatio ?? null);
  scheduleRedraw();
  scheduleEmit();
}

// ---------------------------------------------------------------------------
// ResizeObserver — keep canvas dimensions in sync with layout
// ---------------------------------------------------------------------------

let resizeObserver: ResizeObserver | null = null;

function updateCanvasSize(): void {
  const container = containerEl.value;
  const canvas = canvasEl.value;
  if (!canvas || !container) return;

  const { width, height } = container.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const cssW = Math.max(1, Math.floor(width));
  const cssH = Math.max(1, Math.floor(height));

  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;

  canvasW.value = cssW;
  canvasH.value = cssH;

  // Scale context for HiDPI.
  if (ctx) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  scheduleRedraw();
}

// ---------------------------------------------------------------------------
// Exposed API (for parent getCropTransform() pattern)
// ---------------------------------------------------------------------------

defineExpose({
  /** Returns the current crop transform without waiting for the debounce. */
  getCropTransform(): Transform {
    return cropRectToTransform(cropRect.value);
  },
  /** Returns the current crop rect in normalised coordinates. */
  getCropRect(): CropRect {
    return { ...cropRect.value };
  },
});

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

onMounted(() => {
  const canvas = canvasEl.value;
  if (!canvas) return;

  ctx = canvas.getContext('2d');

  // Wire global pointer events for drag.
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);

  // ResizeObserver on the container.
  const container = containerEl.value;
  if (container) {
    resizeObserver = new ResizeObserver(() => {
      updateCanvasSize();
    });
    resizeObserver.observe(container);
  }

  // Initial sizing and draw.
  nextTick(() => {
    updateCanvasSize();
  }).catch(() => {
    // ignore
  });
});

onBeforeUnmount(() => {
  clearPending();
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
  window.removeEventListener('pointercancel', onPointerUp);
  resizeObserver?.disconnect();
});

// Keep onUnmounted here for symmetry — actual cleanup is in onBeforeUnmount.
onUnmounted(() => {
  // clearPending already called above; nothing else needed.
});
</script>

<template>
  <div
    ref="container"
    class="cropper-canvas"
    :class="{ 'cropper-canvas--disabled': disabled }"
    aria-label="Image crop editor"
  >
    <!-- The drawing surface. aria-hidden because the handles carry the
         semantic information for assistive technology. -->
    <canvas ref="canvas" class="cropper-canvas__canvas" aria-hidden="true" />

    <!-- ------------------------------------------------------------------ -->
    <!-- Crop handles — absolutely positioned over the canvas.               -->
    <!-- Each handle is role="slider" with aria-valuemin/max/now.            -->
    <!-- ------------------------------------------------------------------ -->
    <template v-for="handle in handles" :key="handle.position">
      <div
        :role="'slider'"
        :aria-label="handle.ariaLabel"
        :aria-valuemin="0"
        :aria-valuemax="100"
        :aria-valuenow="
          handle.ariaOrientation === 'horizontal'
            ? handle.ariaValueX
            : handle.ariaOrientation === 'vertical'
              ? handle.ariaValueY
              : handle.ariaValueX
        "
        :aria-orientation="handle.ariaOrientation"
        :aria-disabled="disabled ? 'true' : undefined"
        :tabindex="disabled ? -1 : 0"
        class="cropper-canvas__handle"
        :style="{
          left: `${handle.cx - HANDLE_SIZE / 2}px`,
          top: `${handle.cy - HANDLE_SIZE / 2}px`,
          cursor: disabled ? 'default' : handle.cursor,
        }"
        :data-handle="handle.position"
        @pointerdown="(e) => onHandlePointerDown(e, handle.position)"
        @keydown="(e) => onHandleKeyDown(e, handle.position)"
      />
    </template>
  </div>
</template>

<style scoped>
.cropper-canvas {
  position: relative;
  width: 100%;
  height: 160px; /* default; callers can override with inline style or class */
  overflow: hidden;
  border-radius: 4px;
  background: var(--color-canvas-bg, #f3f4f6);
  touch-action: none; /* prevent scroll interference during drag */
}

.cropper-canvas__canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.cropper-canvas__handle {
  position: absolute;
  width: 10px;
  height: 10px;
  background: #ffffff;
  border: 1.5px solid rgba(0, 0, 0, 0.6);
  border-radius: 2px;
  box-sizing: border-box;
  /* Enlarge hit-target without enlarging visual */
  padding: 0;
  /* Focus ring */
  outline: none;
}

.cropper-canvas__handle:focus-visible {
  outline: 2px solid var(--color-focus-ring, #2563eb);
  outline-offset: 2px;
}

/* Disabled state */
.cropper-canvas--disabled .cropper-canvas__handle {
  opacity: 0.4;
  pointer-events: none;
}
</style>
