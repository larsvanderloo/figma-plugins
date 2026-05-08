<!--
  CardItemEditor — v-model-gebonden editor voor één card binnen de
  Content-tab (spec §9 T11).

  Props:
    modelValue: { cardNodeId: string; heading: string; paragraph: string;
                   visualHash: string | null | undefined }
    index:      number — 1-based kaart-volgnummer voor de heading.

  Emits:
    update:modelValue — het volledige card-object, debounced op 200ms
      sinds de laatste keystroke. Zelfde pattern als
      TitleDescriptionEditor.
    upload-visual (bytes: Uint8Array) — ruwe PNG/JPG-bytes wanneer de
      user een file kiest. ContentPanel routeert dit naar de main-
      thread via `upload-image` (géén debounce).

  Gedrag:
    - Heading + Paragraph zijn altijd zichtbaar.
    - Visual-upload-knop alleen wanneer `visualHash !== undefined`
      (undefined = card heeft geen image-slot).
    - Interne `local`-refs zodat type-snelheid niet beperkt wordt door
      de debounce. Externe prop-changes (slide-wissel / main-echo)
      resetten de refs via watch(props, ...).
-->
<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import type { CardItem } from '../../types';
import IconPicker from './IconPicker.vue';
import { compressImageForUpload } from '../utils/image-compress';
import { formatBytes } from '../utils/format-bytes';

interface Props {
  modelValue: CardItem;
  index: number;
  /**
   * Data-URL of the card's current visual (PNG/JPG, base64). Sandbox
   * emits `card-visual-preview` with the bytes; ContentPanel converts
   * them and threads the URL down. Null until preview arrives or
   * when the card has no visual slot.
   */
  previewUrl?: string | null;
  /**
   * Byte length of the card's current visual (post-compression, as
   * Figma stores it). null = no visual / not yet known. Drives the
   * status-row label so the size shows up next to the thumbnail.
   */
  sizeBytes?: number | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: CardItem];
  'upload-visual': [bytes: Uint8Array];
}>();

// Lokale reactieve kopie zodat de user-typing niet door de 200ms-
// debounce wordt afgeknepen.
// localIcon is altijd string — icon-picker rendert alleen wanneer
// modelValue.icon !== null (T32).
const localHeading = ref<string>(props.modelValue.heading);
const localParagraph = ref<string>(props.modelValue.paragraph);
const localIcon = ref<string>(props.modelValue.icon !== null ? props.modelValue.icon : '');
// Card `Style` variant — true = Outline, false = Default (filled).
// Hidden in the UI when modelValue.style === null (card-instance has
// no `Style` variant prop; e.g. flattened CardWrap layout-variants).
const localOutline = ref<boolean>(props.modelValue.style === 'Outline');

// Visual-slot aanwezigheid: undefined = geen slot, null = lege slot,
// string = gevulde slot. We tonen de upload-knop alleen als de slot
// bestaat (undefined betekent niet tonen).
const hasVisualSlot = computed<boolean>(() => props.modelValue.visualHash !== undefined);
const hasImage = computed<boolean>(() => typeof props.modelValue.visualHash === 'string');

const visualStatusLabel = computed<string>(() => {
  if (isUploading.value) return 'Bezig met uploaden…';
  if (!hasImage.value) return 'Nog geen visual';
  const size = props.sizeBytes;
  if (typeof size === 'number' && size > 0) return formatBytes(size);
  return 'Visual ingesteld';
});

// Echo-guard: na een eigen emit landt er ~400-600ms later een
// slide-loaded met de net-toegepaste waarde (sandbox commitUndo →
// applyCard → documentchange → debounced postSlideContent → scan →
// post). Zonder guard zou de watch hieronder localHeading /
// localParagraph terugzetten naar de echo-waarde, wat de keystrokes
// die de user in de tussentijd typte clobbert (cursor-spring,
// letter-loss). Zelfde patroon als TableEditor.
let echoExpected = false;
let echoResetTimer: ReturnType<typeof setTimeout> | null = null;
// Bijhouden welke cardNodeId we het laatst gezien hebben zodat
// slide-wissel (dezelfde editor-instance, andere card) niet door de
// echo-guard wordt geblokkeerd.
let lastCardNodeId = props.modelValue.cardNodeId;

// Re-sync van prop → local: bij slide-wissel of foreign edit. Echo's
// van eigen emits worden geskipt zolang de guard openstaat. Wanneer
// het cardNodeId verandert is het géén echo (slide-wissel / reorder);
// dan sync'en we onvoorwaardelijk en resetten de guard.
watch(
  () => props.modelValue,
  (next) => {
    const isDifferentCard = next.cardNodeId !== lastCardNodeId;
    if (echoExpected && !isDifferentCard) return;
    if (isDifferentCard) {
      echoExpected = false;
      if (echoResetTimer !== null) {
        clearTimeout(echoResetTimer);
        echoResetTimer = null;
      }
    }
    lastCardNodeId = next.cardNodeId;
    localHeading.value = next.heading;
    localParagraph.value = next.paragraph;
    localIcon.value = next.icon !== null ? next.icon : '';
    localOutline.value = next.style === 'Outline';
  },
);

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function armEchoGuard(): void {
  echoExpected = true;
  if (echoResetTimer !== null) clearTimeout(echoResetTimer);
  echoResetTimer = setTimeout(() => {
    echoExpected = false;
    echoResetTimer = null;
  }, 2000);
}

function buildPayload(): CardItem {
  return {
    cardNodeId: props.modelValue.cardNodeId,
    heading: localHeading.value,
    paragraph: localParagraph.value,
    icon: localIcon.value,
    visualHash: props.modelValue.visualHash,
    // Pass null through unchanged when the card variant doesn't
    // expose Style; otherwise reflect the current toggle state.
    style:
      props.modelValue.style === null
        ? null
        : localOutline.value
          ? 'Outline'
          : 'Default',
  };
}

/**
 * Debounced emit — used for text inputs (heading / paragraph). Coalesces
 * keystroke bursts into one round-trip per 200ms.
 */
function scheduleEmit(): void {
  if (debounceTimer !== null) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    armEchoGuard();
    emit('update:modelValue', buildPayload());
  }, 200);
}

/**
 * Immediate emit — used for discrete user actions (toggle, icon pick)
 * where waiting for the debounce window adds perceptible lag without
 * coalescing benefit. Cancels any pending debounced emit so a typing-
 * burst-then-toggle still results in exactly one emit.
 */
function emitNow(): void {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  armEchoGuard();
  emit('update:modelValue', buildPayload());
}

function onOutlineToggle(value: boolean): void {
  localOutline.value = value;
  emitNow();
}

function onHeadingInput(value: string): void {
  localHeading.value = value;
  scheduleEmit();
}

function onParagraphInput(value: string): void {
  localParagraph.value = value;
  scheduleEmit();
}

function onIconChange(value: string): void {
  localIcon.value = value;
  emitNow();
}

// File-input ref + upload-handling.
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
  <section
    class="space-y-3 rounded-[calc(var(--ui-radius)*4)] bg-default px-5 py-8 shadow-[0_4px_16px_-6px_rgba(0,0,0,0.08)]"
  >
    <div class="flex items-center justify-between gap-3">
      <h3 class="text-base font-semibold text-default">Kaart {{ index }}</h3>
      <!-- Style toggle — only when the Card variant exposes a `Style`
           prop. Hidden on flattened CardWrap layouts that have no
           variant. Off = Default (filled), On = Outline (bordered). -->
      <label
        v-if="modelValue.style !== null"
        class="flex items-center gap-2 text-xs text-muted cursor-pointer select-none"
      >
        <span>Outline</span>
        <USwitch
          :model-value="localOutline"
          size="xs"
          @update:model-value="onOutlineToggle"
        />
      </label>
    </div>

    <!--
      Visual / Icon block — both occupy the same slot above the text
      inputs (mutually exclusive: icon picker shows on Stack Icon /
      Icon Side variants, the visual thumbnail + status row show on
      Type=Image / Type=User variants). Mirrors the position of the
      icon picker so the UI rhythm is consistent across variants.
    -->
    <UFormField v-if="modelValue.icon !== null" name="icon" label="Icoon" size="md">
      <IconPicker :model-value="localIcon" @update:model-value="onIconChange" />
    </UFormField>

    <div v-if="hasVisualSlot" class="space-y-2">
      <div
        v-if="previewUrl"
        class="relative w-full overflow-hidden rounded-xl bg-[--ui-bg-muted] select-none h-32"
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

    <UFormField name="heading" label="Koptekst" size="md">
      <UInput
        :model-value="localHeading"
        placeholder="Koptekst"
        class="w-full"
        @update:model-value="onHeadingInput"
      />
    </UFormField>

    <UFormField name="paragraph" label="Alinea" size="md">
      <UTextarea
        :model-value="localParagraph"
        :rows="3"
        :autoresize="true"
        placeholder="Alineatekst"
        class="w-full"
        @update:model-value="onParagraphInput"
      />
    </UFormField>

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
