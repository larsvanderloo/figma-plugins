<!--
  TitleDescriptionEditor — v-model-gebonden editor voor de
  General → Title & Description sectie (spec §9 T8 + §13 T30).

  Props:
    modelValue: {
      heading: string;
      paragraph: string | null;
      headingDim: Array<[number, number]> | null;
    }

  Emits:
    update:modelValue — het volledige object, debounced op 200ms
      sinds de laatste keystroke in één van beide velden.
    update:headingDim — canonicale char-ranges voor heading-accent
      (spec §13 T30). Emit na elke chip-toggle; parent post
      `update-accent` naar main.

  Gedrag:
    - `<UInput>` voor heading (altijd aanwezig).
    - `<UTextarea>` voor paragraph — alleen gerenderd als
      `modelValue.paragraph !== null` (CopyWrap zonder Paragraph).
    - Inline word-chips onder heading-input (spec §13 T30).
      Alleen zichtbaar wanneer `headingDim !== null` (library-guard).
      Paragraph-accent is permanent out-of-scope.
    - Debounce-timer in een lokale ref; clear + reset bij elke edit
      zodat we pas na 200ms stilte één emit firen. Zelfde patroon als
      chart-builder App.vue (manual setTimeout, geen lodash-dep).
    - Interne `local`-state is reactief gekoppeld aan modelValue via
      watch(props, ...) zodat externe updates (bv. slide-wissel) de
      velden resetten zonder de lokale debounce te verstoren.
    - DIM-FLUSH: wanneer `localHeading.length` verandert t.o.v. de
      laatst-gescande lengte worden `dimWords` gecleared en een lege
      ranges-emit gedaan — char-indices zijn niet meer geldig na edit.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';

export interface TitleDescriptionValue {
  heading: string;
  paragraph: string | null;
  headingDim: Array<[number, number]> | null;
}

interface Props {
  modelValue: TitleDescriptionValue;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: TitleDescriptionValue];
  'update:headingDim': [ranges: Array<[number, number]>];
}>();

// Lokale reactieve kopie zodat de user type-snelheid niet wordt
// afgeknepen door de 200ms-debounce. De emit gebeurt na debounce.
const localHeading = ref<string>(props.modelValue.heading);
const localParagraph = ref<string>(props.modelValue.paragraph ?? '');

// Paragraph-aanwezigheid is statisch per CopyWrap; we leiden hem af
// uit de prop. Wanneer de prop van null → string switcht (slide-wissel)
// updaten we de lokale ref via de watcher hieronder.
const hasParagraph = ref<boolean>(props.modelValue.paragraph !== null);

// ------------------------------------------------------------
// Accent-state (spec §13 T30) — word-index-gebaseerd.
// `dimWords` bevat indices van word-tokens (niet char-offsets).
// `lastScannedLength` bewaart de heading-length op het moment dat
// we `dimWords` voor het laatst hydrateerden uit char-ranges — zodra
// de length verandert flushen we (char-indices niet meer geldig).
// ------------------------------------------------------------
const dimWords = ref<Set<number>>(new Set());
let lastScannedLength = props.modelValue.heading.length;

/** Token-shape uit de tokeniser. Whitespace-tokens hebben geen wordIndex. */
interface WordToken {
  type: 'word';
  text: string;
  wordIndex: number;
  charStart: number;
  charEnd: number;
}
interface SpaceToken {
  type: 'space';
  text: string;
  charStart: number;
  charEnd: number;
}
type Token = WordToken | SpaceToken;

/** Split de heading op whitespace-runs; behoud char-offsets per token. */
const tokens = computed<Token[]>(() => {
  const parts = localHeading.value.split(/(\s+)/);
  const out: Token[] = [];
  let cursor = 0;
  let wordIdx = 0;
  for (let i = 0; i < parts.length; i++) {
    const text = parts[i];
    if (text === '') continue;
    const start = cursor;
    const end = cursor + text.length;
    if (/^\s+$/.test(text)) {
      out.push({ type: 'space', text: text, charStart: start, charEnd: end });
    } else {
      out.push({ type: 'word', text: text, wordIndex: wordIdx, charStart: start, charEnd: end });
      wordIdx += 1;
    }
    cursor = end;
  }
  return out;
});

/** Overlap-check: is `[tokStart, tokEnd)` geraakt door één van de ranges? */
function rangesOverlap(ranges: Array<[number, number]>, start: number, end: number): boolean {
  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i];
    if (r[0] < end && start < r[1]) return true;
  }
  return false;
}

/**
 * Hydrateer `dimWords` vanuit `headingDim`-char-ranges op de huidige
 * heading-tekst. Elk word-token dat overlap heeft met een range wordt
 * als dimmed gemarkeerd.
 */
function hydrateDimWords(headingDim: Array<[number, number]> | null): void {
  const next = new Set<number>();
  if (headingDim !== null && headingDim.length > 0) {
    for (const tok of tokens.value) {
      if (tok.type !== 'word') continue;
      if (rangesOverlap(headingDim, tok.charStart, tok.charEnd)) {
        next.add(tok.wordIndex);
      }
    }
  }
  dimWords.value = next;
  lastScannedLength = localHeading.value.length;
}

/**
 * Map `dimWords` (word-indices) terug naar canonical char-ranges.
 * Aaneengesloten dim-words (inclusief whitespace ertussen) worden
 * samengevoegd tot één range; merge-heuristiek: neem elk word-token
 * dat `dimWords` bevat, en als de vorige range eindigt waar deze
 * begint (eventueel met whitespace ertussen) merge we ze.
 */
function buildCharRanges(): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const tok of tokens.value) {
    if (tok.type !== 'word') continue;
    if (!dimWords.value.has(tok.wordIndex)) continue;
    const last = out.length > 0 ? out[out.length - 1] : null;
    if (last !== null && last[1] === tok.charStart) {
      last[1] = tok.charEnd;
    } else {
      out.push([tok.charStart, tok.charEnd]);
    }
  }
  return out;
}

// Initiële hydratatie op mount (via initial-computed-trigger).
hydrateDimWords(props.modelValue.headingDim);

// Externe prop-wijzigingen (slide-wissel, main-thread-echo) moeten de
// lokale refs resetten. Gesplitst in drie granulaire watches zodat een
// chip-toggle (die alleen headingDim muteert) nooit localHeading
// overschrijft midden in een user-keystroke (root cause T30-bug).

// Heading — reset alleen wanneer de externe waarde verschilt van onze
// lokale typ-state (voorkomt dat onze eigen debounce-emit als echo
// terugkomt en een in-progress edit ongedaan maakt).
watch(
  () => props.modelValue.heading,
  (next) => {
    if (next !== localHeading.value) {
      localHeading.value = next;
      lastScannedLength = next.length;
    }
  },
);

// Paragraph — paragraph-edits lopen niet via de chip-toggle-cycle,
// simpele sync volstaat.
watch(
  () => props.modelValue.paragraph,
  (next) => {
    localParagraph.value = next ?? '';
    hasParagraph.value = next !== null;
  },
);

// DimRanges — her-hydrateer chip-state vanuit nieuwe ranges (slide-
// wissel of main-thread-echo na toggleWord-emit).
watch(
  () => props.modelValue.headingDim,
  (next) => {
    hydrateDimWords(next);
  },
);

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleEmit(): void {
  if (debounceTimer !== null) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    emit('update:modelValue', {
      heading: localHeading.value,
      paragraph: hasParagraph.value ? localParagraph.value : null,
      // headingDim gaat via z'n eigen emit; we echoën hier de prop-waarde
      // door zodat de v-model-payload consistent blijft voor parents die
      // het object één-op-één doorgeven.
      headingDim: props.modelValue.headingDim,
    });
  }, 200);
}

function onHeadingInput(value: string): void {
  localHeading.value = value;
  // DIM-FLUSH: length-mismatch → char-indices niet meer geldig. Clear
  // lokaal en emit lege ranges naar parent (main-thread schrijft dan
  // heel de string als Text-fill terug, raw-hex accent wordt gestript).
  if (localHeading.value.length !== lastScannedLength) {
    if (dimWords.value.size > 0) {
      dimWords.value = new Set();
      emit('update:headingDim', []);
    }
    lastScannedLength = localHeading.value.length;
  }
  scheduleEmit();
}

function onParagraphInput(value: string): void {
  localParagraph.value = value;
  scheduleEmit();
}

function toggleWord(wordIndex: number): void {
  const next = new Set(dimWords.value);
  if (next.has(wordIndex)) {
    next.delete(wordIndex);
  } else {
    next.add(wordIndex);
  }
  dimWords.value = next;
  emit('update:headingDim', buildCharRanges());
}
</script>

<template>
  <div class="space-y-3">
    <UFormField name="heading" label="Koptekst" size="md">
      <UInput
        :model-value="localHeading"
        placeholder="Slidetitel"
        class="w-full"
        @update:model-value="onHeadingInput"
      />
    </UFormField>

    <div v-if="modelValue.headingDim !== null" class="space-y-1.5">
      <label class="text-xs font-medium text-default">Accent</label>
      <div class="flex flex-wrap gap-2">
        <template v-for="(tok, i) in tokens" :key="i">
          <UButton
            v-if="tok.type === 'word'"
            size="xs"
            :variant="dimWords.has(tok.wordIndex) ? 'solid' : 'subtle'"
            :aria-pressed="dimWords.has(tok.wordIndex)"
            @click="toggleWord(tok.wordIndex)"
          >
            {{ tok.text }}
          </UButton>
          <span v-else class="text-xs">&nbsp;</span>
        </template>
      </div>
      <p class="text-xs text-muted">Klik op woorden om ze te accentueren.</p>
    </div>

    <UFormField v-if="hasParagraph" name="paragraph" label="Onderschrift" size="md">
      <UTextarea
        :model-value="localParagraph"
        :rows="3"
        :autoresize="true"
        placeholder="Onderschrifttekst"
        class="w-full"
        @update:model-value="onParagraphInput"
      />
    </UFormField>
  </div>
</template>
