<!--
  TitleDescriptionEditor — editor for the General → Title & Description
  section. Uses BInput / BTextarea so typing doesn't fire a sandbox
  round-trip per keystroke (commit-on-blur).

  Accent chips (heading-dim word toggles) operate on the LAST-COMMITTED
  heading text. While the user is typing, chips stay frozen against the
  current modelValue.heading; once blur commits the new heading, chips
  re-derive from it. Length change → char-indices invalid → dim-words
  flush automatically.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import BInput from './BInput.vue';
import BTextarea from './BTextarea.vue';
import VisibilityPill from './VisibilityPill.vue';

export interface TitleDescriptionValue {
  heading: string;
  paragraph: string | null;
  headingVisible: boolean;
  paragraphVisible: boolean | null;
  headingDim: Array<[number, number]> | null;
  /** CopyWrap heading-size variant; null when master has no Size prop. */
  size: { current: string; options: ReadonlyArray<string> } | null;
}

interface Props {
  modelValue: TitleDescriptionValue;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: TitleDescriptionValue];
  'update:headingDim': [ranges: Array<[number, number]>];
  'commit:size': [size: string];
  'commit:visibility': [field: 'heading' | 'paragraph', visible: boolean];
}>();

const hasParagraph = computed<boolean>(() => props.modelValue.paragraph !== null);

// ── Heading-size slider (CopyWrap.Size VARIANT) ───────────────────────
// Slider runs UNCONTROLLED: Reka's SliderRoot in controlled mode snaps
// to `step` every time the parent re-passes :model-value during drag,
// which the user reads as a chunky "stepper" feel. Going uncontrolled
// lets the cursor track 1:1 — we only read the value on @change
// (release) and round to the nearest integer option index.
//
// `sliderKey` forces a remount whenever the external value changes
// (slide switch / external commit) so the thumb resets to the canonical
// position without us needing to push a model-value during drag.
const sizeIndex = computed<number>(function () {
  const s = props.modelValue.size;
  if (s === null) return 0;
  const idx = s.options.indexOf(s.current);
  return idx >= 0 ? idx : 0;
});
const sliderKey = ref<number>(0);
// Tracks the slider's live value during drag. Populated by
// `@update:model-value` since USlider's `@change` event ships a
// synthetic Event whose `target.value` is actually empty (the Nuxt UI
// source tries to stuff value into Event init, but the Event
// constructor only accepts bubbles/cancelable/composed there).
const liveSize = ref<number | null>(null);
watch(sizeIndex, function () {
  sliderKey.value += 1;
  liveSize.value = null;
});

function onLiveUpdate(value: number | number[] | undefined): void {
  if (value === undefined) return;
  const num = Array.isArray(value) ? value[0] : Number(value);
  if (isFinite(num)) liveSize.value = num;
}

function onSizeCommit(): void {
  const s = props.modelValue.size;
  if (s === null) return;
  const raw = liveSize.value !== null ? liveSize.value : sizeIndex.value;
  const idx = Math.max(0, Math.min(s.options.length - 1, Math.round(raw)));
  const next = s.options[idx];
  liveSize.value = null;
  if (typeof next === 'string' && next !== s.current) {
    emit('commit:size', next);
  } else {
    // No-op change → bump the key so the thumb settles back to the
    // canonical integer rest position rather than lingering at the
    // user's dropped fractional point.
    sliderKey.value += 1;
  }
}

// ── Accent state (heading word-toggle) ─────────────────────────────────
const dimWords = ref<Set<number>>(new Set());

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

const tokens = computed<Token[]>(() => {
  const parts = props.modelValue.heading.split(/(\s+)/);
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

function rangesOverlap(ranges: Array<[number, number]>, start: number, end: number): boolean {
  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i];
    if (r[0] < end && start < r[1]) return true;
  }
  return false;
}

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
}

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

hydrateDimWords(props.modelValue.headingDim);
watch(
  () => props.modelValue.headingDim,
  (next) => hydrateDimWords(next),
);

// ── Commit handlers ────────────────────────────────────────────────────
function onHeadingCommit(value: string): void {
  const headingChangedLength = value.length !== props.modelValue.heading.length;
  emit('update:modelValue', {
    heading: value,
    paragraph: props.modelValue.paragraph,
    headingVisible: props.modelValue.headingVisible,
    paragraphVisible: props.modelValue.paragraphVisible,
    headingDim: headingChangedLength ? [] : props.modelValue.headingDim,
    size: props.modelValue.size,
  });
  if (headingChangedLength && dimWords.value.size > 0) {
    dimWords.value = new Set();
    emit('update:headingDim', []);
  }
}

function onParagraphCommit(value: string): void {
  emit('update:modelValue', {
    heading: props.modelValue.heading,
    paragraph: hasParagraph.value ? value : null,
    headingVisible: props.modelValue.headingVisible,
    paragraphVisible: props.modelValue.paragraphVisible,
    headingDim: props.modelValue.headingDim,
    size: props.modelValue.size,
  });
}

function onHeadingVisibilityToggle(next: boolean): void {
  emit('commit:visibility', 'heading', next);
}

function onParagraphVisibilityToggle(next: boolean): void {
  emit('commit:visibility', 'paragraph', next);
}

function toggleWord(wordIndex: number): void {
  const next = new Set(dimWords.value);
  if (next.has(wordIndex)) next.delete(wordIndex);
  else next.add(wordIndex);
  dimWords.value = next;
  emit('update:headingDim', buildCharRanges());
}
</script>

<template>
  <div class="space-y-4">
    <div class="space-y-1.5">
      <div class="flex items-center justify-between gap-2">
        <label class="text-xs font-medium text-default">Titel</label>
        <VisibilityPill
          :model-value="modelValue.headingVisible"
          :title="modelValue.headingVisible ? 'Verberg titel' : 'Toon titel'"
          @update:model-value="onHeadingVisibilityToggle"
        />
      </div>
      <BInput
        :model-value="modelValue.heading"
        placeholder="Bijv. Onze missie voor 2026"
        size="md"
        :disabled="!modelValue.headingVisible"
        class="w-full"
        @update:model-value="onHeadingCommit"
      />
    </div>

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

    <div v-if="hasParagraph" class="space-y-1.5">
      <div class="flex items-center justify-between gap-2">
        <label class="text-xs font-medium text-default">Omschrijving</label>
        <VisibilityPill
          v-if="modelValue.paragraphVisible !== null"
          :model-value="modelValue.paragraphVisible"
          :disabled="!modelValue.headingVisible"
          :title="
            !modelValue.headingVisible
              ? 'Zet eerst de titel aan'
              : modelValue.paragraphVisible
                ? 'Verberg omschrijving'
                : 'Toon omschrijving'
          "
          @update:model-value="onParagraphVisibilityToggle"
        />
      </div>
      <BTextarea
        :model-value="modelValue.paragraph ?? ''"
        :rows="3"
        :autoresize="true"
        placeholder="Een korte toelichting onder de titel"
        size="md"
        :disabled="modelValue.paragraphVisible === false"
        class="w-full"
        @update:model-value="onParagraphCommit"
      />
    </div>

    <div v-if="modelValue.size !== null" class="space-y-1.5 pt-1">
      <label class="text-xs font-medium text-default">Tekstgrootte</label>
      <div class="flex items-center gap-3">
        <span class="text-[10px] font-semibold leading-none text-muted shrink-0">A</span>
        <USlider
          :key="sliderKey"
          :default-value="sizeIndex"
          :min="0"
          :max="modelValue.size.options.length - 1"
          :step="0.0001"
          size="sm"
          class="flex-1"
          @update:model-value="onLiveUpdate"
          @change="onSizeCommit"
        />
        <span class="text-base font-bold leading-none text-muted shrink-0">A</span>
      </div>
    </div>
  </div>
</template>
