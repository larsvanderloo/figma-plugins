<!--
  DropzoneUpload — herbruikbare drag-and-drop upload-zone (spec §13 v0.1.x).

  Props:
    hasFile:  boolean — of er al een bestand ingesteld is (toont "vervangen"-copy)
    accept:   string  — MIME-filter, standaard "image/*"
    loading:  boolean — toont spinner, blokkeert interactie
    label:    string  — optionele override voor de status-tekst;
                        als niet meegegeven: afgeleid van hasFile

  Emits:
    upload (bytes: Uint8Array) — ruwe bytes na file-selectie of drop

  Gedrag:
    - Gehele zone is klikbaar → triggert verborgen <input type="file">
    - Drag-and-drop: isDragging-ref wisselt de highlight-border
    - On file selected/dropped: arrayBuffer → Uint8Array → emit upload
    - Zachte 2MB-waarschuwing als <p class="text-xs text-warning">
    - Input-value reset na keuze (zelfde file opnieuw kiezen werkt)

  FIG-MSG-01: bytes gaan via typed upload-message (Uint8Array overleeft
    structured-cloning tussen iframe en main-thread).
-->
<script setup lang="ts">
import { ref, computed } from 'vue';

interface Props {
  hasFile: boolean;
  accept?: string;
  loading?: boolean;
  label?: string;
}

const props = withDefaults(defineProps<Props>(), {
  accept: 'image/*',
  loading: false,
  label: undefined,
});

const emit = defineEmits<{
  upload: [bytes: Uint8Array];
}>();

const fileInput = ref<HTMLInputElement | null>(null);
const isDragging = ref<boolean>(false);
const sizeWarning = ref<string | null>(null);

/** 2MB grens — Figma ondersteunt meer maar grotere files leiden tot
 *  trage renders. Puur een UX-waarschuwing, we blokkeren niet. */
const SOFT_MAX_BYTES = 2 * 1024 * 1024;

const statusLabel = computed<string>(() => {
  if (props.label !== undefined) return props.label;
  return props.hasFile ? 'Afbeelding ingesteld' : 'Nog geen afbeelding';
});

function openFilePicker(): void {
  if (props.loading) return;
  if (fileInput.value !== null) fileInput.value.click();
}

async function processFile(file: File): Promise<void> {
  sizeWarning.value = null;
  if (file.size > SOFT_MAX_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    sizeWarning.value = 'Groot bestand (' + mb + ' MB) — upload kan even duren.';
  }
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  emit('upload', bytes);
}

async function onFileInputChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const files = input.files;
  if (files === null || files.length === 0) return;
  await processFile(files[0]);
  // Reset zodat hetzelfde bestand opnieuw gekozen kan worden.
  input.value = '';
}

function onDragOver(event: DragEvent): void {
  event.preventDefault();
  isDragging.value = true;
}

function onDragLeave(event: DragEvent): void {
  event.preventDefault();
  isDragging.value = false;
}

async function onDrop(event: DragEvent): Promise<void> {
  event.preventDefault();
  isDragging.value = false;
  if (props.loading) return;
  const files = event.dataTransfer ? event.dataTransfer.files : null;
  if (files === null || files.length === 0) return;
  await processFile(files[0]);
}
</script>

<template>
  <div class="space-y-2">
    <div
      :class="[
        'border-2 border-dashed rounded-xl py-6 px-4 cursor-pointer',
        'flex flex-col items-center gap-3 text-center',
        'transition-colors hover:border-[--ui-border-accented] hover:bg-[--ui-bg-elevated]',
        isDragging ? 'border-[--ui-border-accented] bg-[--ui-bg-elevated]' : 'border-[--ui-border]',
        loading ? 'pointer-events-none opacity-60' : '',
      ]"
      @click="openFilePicker"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
    >
      <!-- Icoon in grijs cirkeltje -->
      <span class="flex items-center justify-center size-10 rounded-full bg-[--ui-bg-elevated]">
        <UIcon
          :name="loading ? 'i-lucide-loader-circle' : 'i-lucide-upload'"
          :class="['size-5 text-muted', loading ? 'animate-spin' : '']"
        />
      </span>

      <div class="space-y-0.5">
        <p class="text-sm font-medium text-default">
          {{ hasFile ? 'Vervang afbeelding' : 'Sleep een afbeelding hier' }}
        </p>
        <p class="text-xs text-muted">of klik om te bladeren</p>
      </div>

      <p v-if="hasFile" class="text-xs text-muted">{{ statusLabel }} ✓</p>
    </div>

    <p v-if="sizeWarning" class="text-xs text-warning">
      {{ sizeWarning }}
    </p>

    <input
      ref="fileInput"
      type="file"
      :accept="accept"
      style="display: none"
      @change="onFileInputChange"
    />
  </div>
</template>
