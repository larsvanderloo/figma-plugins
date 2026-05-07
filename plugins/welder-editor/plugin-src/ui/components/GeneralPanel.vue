<!--
  GeneralPanel — orkestrator voor de General-tab (spec §9 T7-T10).

  Drie show-only-if-present-secties:
    1. Title & Description — TitleDescriptionEditor (T8, live).
    2. Badge                — BadgeEditor (T9, live).
    3. Image                — ImageEditor (T10, live — fill-replace only).

  Elke sectie rendert alleen als de bijbehorende key op de `general`-
  store niet-null is. App.vue zorgt voor de overall empty-state
  wanneer general zelf null is, dus hier gaan we ervan uit dat
  `general !== null` bij mount.

  Mutatie-flow:
    - TitleDescription / Badge → `update-general` (debounced 200ms).
    - Image                    → `upload-image` (raw Uint8Array bytes,
      geen debounce — per keuze één upload).
    Main-thread muteert de target-node en stuurt `target-updated` terug.
-->
<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue';
import TitleDescriptionEditor, { type TitleDescriptionValue } from './TitleDescriptionEditor.vue';
import BadgeEditor, { type BadgeValue } from './BadgeEditor.vue';
import ImageEditor, { type ImageValue } from './ImageEditor.vue';
import { usePluginBridge } from '../composables/usePluginBridge';
import { usePluginView } from '../stores/usePluginView';
import { useEditHistory } from '../stores/useEditHistory';

const bridge = usePluginBridge();
const view = usePluginView();
const editHistory = useEditHistory();

const general = computed(() => view.state.general);
const slideId = computed(() => view.state.currentSlideId);

// NOTE: Theme-selector (ThemePicker + slide-theme listener + onThemeSelect +
// set-variable-mode dispatch) is tijdelijk uit de UI verwijderd. Zie
// spec.md §13-T-backlog. De main-thread stuurt nog wel `slide-theme`-
// berichten; die worden hier stil genegeerd tot de feature terugkomt.

// ------------------------------------------------------------
// Image-preview (spec §9 T28b) — bytes van de huidige ImagePaint,
// geserveerd door T28a na iedere `slide-loaded` of `upload-image`-ack.
// We converteren naar een data-URL zodat ImageEditor hem rechtstreeks
// in een <img>-tag kan weergeven voor drag-to-reposition.
// fillW/fillH: dimensies van het Figma image-slot — door te geven
// aan ImageEditor voor aspect-ratio-match van de preview-box.
// ------------------------------------------------------------
const imagePreviewUrl = ref<string | null>(null);
const imageFillW = ref<number | null>(null);
const imageFillH = ref<number | null>(null);
const imageSizeBytes = ref<number | null>(null);

/** Uint8Array → data-URL. Detect MIME via magic-bytes; chunked btoa
 *  voorkomt stack-overflow op grote fill-bytes (≥2 MB). */
function bytesToDataUrl(bytes: Uint8Array): string {
  var mime = 'image/png';
  // JPEG: FF D8 FF — PNG default anders (89 50 4E 47 tekent ook PNG).
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    mime = 'image/jpeg';
  }
  var binary = '';
  var chunkSize = 8192;
  for (var i = 0; i < bytes.length; i += chunkSize) {
    var chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return 'data:' + mime + ';base64,' + btoa(binary);
}

const unsubPreview = bridge.onMessage(function (msg: any) {
  if (msg.type !== 'image-preview') return;
  // Scope-guard: alleen accepteren als de imageWrapId matcht met de
  // actieve image-sectie (voorkomt dat een stale preview een nieuwe
  // slide kapuut maakt).
  const img = general.value && general.value.image;
  if (img === null || img === undefined) return;
  if (msg.imageWrapId !== img.imageWrapId) return;
  imagePreviewUrl.value = bytesToDataUrl(msg.bytes);
  imageSizeBytes.value = msg.bytes.length;
  // Slot-dimensies doorgeven voor aspect-ratio-match van de preview-box.
  // fillW/fillH zijn 0 als onbekend (code.ts fallback).
  imageFillW.value = typeof msg.fillW === 'number' && msg.fillW > 0 ? msg.fillW : null;
  imageFillH.value = typeof msg.fillH === 'number' && msg.fillH > 0 ? msg.fillH : null;
});

// Reset op slide-wissel — anders blijft een vorige preview hangen op
// een nieuwe slide die (nog) geen `image-preview` heeft ontvangen.
watch(
  function () {
    return view.state.currentSlideId;
  },
  function () {
    imagePreviewUrl.value = null;
    imageFillW.value = null;
    imageFillH.value = null;
    imageSizeBytes.value = null;
  },
);

onUnmounted(function () {
  unsubPreview();
});

/** v-model-payload voor TitleDescriptionEditor, samengesteld uit de store. */
const titleDescription = computed<TitleDescriptionValue | null>(() => {
  const td = general.value?.titleDescription;
  if (td === null || td === undefined) return null;
  return {
    heading: td.heading,
    paragraph: td.paragraph,
    headingDim: td.headingDim,
  };
});

function onTitleDescriptionUpdate(value: TitleDescriptionValue): void {
  const id = slideId.value;
  if (id === null) return;
  // Lokale store-update voor instant UI-reflectie; main-thread-echo
  // via `target-updated` is alleen voor de save-indicator (T8+).
  const td = view.state.general?.titleDescription;
  if (td) {
    td.heading = value.heading;
    td.paragraph = value.paragraph;
  }
  bridge.post({
    type: 'update-general',
    slideId: id,
    section: 'titleDescription',
    payload: {
      heading: value.heading,
      // Alleen paragraph meesturen als hij niet null is — anders laat
      // de main-thread de textnode met rust (silent skip).
      paragraph: value.paragraph === null ? undefined : value.paragraph,
    },
  });
}

/**
 * Accent-ranges update (spec §13 T30). Heading-only. Lokale store-update
 * voor consistente UI-state, main-thread schrijft de fills via
 * `update-accent`.
 */
function onHeadingDimUpdate(ranges: Array<[number, number]>): void {
  const id = slideId.value;
  if (id === null) return;
  const td = view.state.general?.titleDescription;
  if (td) {
    td.headingDim = ranges;
  }
  bridge.post({
    type: 'update-accent',
    slideId: id,
    dimRanges: ranges,
  });
}

/** v-model-payload voor BadgeEditor, samengesteld uit de store. */
const badge = computed<BadgeValue | null>(() => {
  const b = general.value?.badge;
  if (b === null || b === undefined) return null;
  return {
    label: b.label,
    icon: b.icon,
  };
});

function onBadgeUpdate(value: BadgeValue): void {
  const id = slideId.value;
  if (id === null) return;
  // Lokale store-update voor instant UI-reflectie.
  const b = view.state.general?.badge;
  if (b) {
    b.label = value.label;
    b.icon = value.icon;
  }
  const msg = {
    type: 'update-general' as const,
    slideId: id,
    section: 'badge' as const,
    payload: {
      label: value.label,
      // Leegstring icon alleen skippen als we niks willen muteren;
      // hier sturen we altijd mee zodat de user een icoon kan kiezen.
      icon: value.icon,
    },
  };
  editHistory.recordIssued(msg);
  bridge.post(msg);
}

/** v-model-payload voor ImageEditor — afgeleid uit de imageHash. */
const image = computed<ImageValue | null>(() => {
  const img = general.value?.image;
  if (img === null || img === undefined) return null;
  return {
    hasImage: img.imageHash !== null,
    imageHash: img.imageHash,
  };
});

function onImageUpload(bytes: Uint8Array): void {
  const img = view.state.general?.image;
  if (!img) return;
  // Post raw bytes naar main; structured-cloning levert Uint8Array
  // intact af bij figma.ui.onmessage. `upload-image` is een aparte
  // message-type (§5) — geen debounce, elke upload fires direct.
  // Wordt gefired door zowel de "Vervangen"-flow als de cropper
  // "Toepassen"-flow (T28c): in beide gevallen ontvangt main-thread
  // een kant-en-klaar PNG en past het toe met scaleMode FILL.
  bridge.post({
    type: 'upload-image',
    targetNodeId: img.imageWrapId,
    bytes: bytes,
  });
}
</script>

<template>
  <div
    class="rounded-[calc(var(--ui-radius)*4)] bg-default shadow-[0_4px_16px_-6px_rgba(0,0,0,0.08)] overflow-hidden divide-y divide-[var(--ui-border)]"
  >
    <section v-if="general?.titleDescription && titleDescription" class="space-y-4 px-5 py-6">
      <h3 class="text-sm font-semibold text-highlighted">Titel & omschrijving</h3>
      <TitleDescriptionEditor
        :model-value="titleDescription"
        @update:model-value="onTitleDescriptionUpdate"
        @update:heading-dim="onHeadingDimUpdate"
      />
    </section>

    <section v-if="general?.badge && badge" class="space-y-4 px-5 py-6">
      <h3 class="text-sm font-semibold text-highlighted">Badge</h3>
      <BadgeEditor :model-value="badge" @update:model-value="onBadgeUpdate" />
    </section>

    <section v-if="general?.image && image" class="space-y-4 px-5 py-6">
      <h3 class="text-sm font-semibold text-highlighted">Afbeelding</h3>
      <ImageEditor
        :model-value="image"
        :preview-url="imagePreviewUrl"
        :fill-w="imageFillW"
        :fill-h="imageFillH"
        :size-bytes="imageSizeBytes"
        @upload="onImageUpload"
      />
    </section>
  </div>
</template>
