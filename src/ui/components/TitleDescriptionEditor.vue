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

// Per-segment "A" font-size — linearly interpolated across the option
// range so the leftmost segment is small and the rightmost reads large.
// Apple's iOS Settings → Text Size picker uses the same per-segment "A"
// scaling, which is more legible than abstract size names for non-
// designers.
const SEGMENT_MIN_PX = 11;
const SEGMENT_MAX_PX = 20;
function segmentSizePx(idx: number, total: number): number {
  if (total <= 1) return SEGMENT_MAX_PX;
  const t = idx / (total - 1);
  return SEGMENT_MIN_PX + (SEGMENT_MAX_PX - SEGMENT_MIN_PX) * t;
}

function onSizePick(idx: number): void {
  const s = props.modelValue.size;
  if (s === null) return;
  const next = s.options[idx];
  if (typeof next === 'string' && next !== s.current) {
    emit('commit:size', next);
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
  const t0 = performance.now();
  const next = new Set(dimWords.value);
  if (next.has(wordIndex)) next.delete(wordIndex);
  else next.add(wordIndex);
  dimWords.value = next;
  const t1 = performance.now();
  const ranges = buildCharRanges();
  const t2 = performance.now();
  emit('update:headingDim', ranges);
  const t3 = performance.now();
  console.log(
    '[accent-perf] click → set-flip ' + (t1 - t0).toFixed(1) + 'ms · build-ranges ' +
      (t2 - t1).toFixed(1) + 'ms · emit ' + (t3 - t2).toFixed(1) + 'ms · words=' +
      next.size + ' · ranges=' + ranges.length,
  );
}
</script>

<template>
  <div class="space-y-4">
    <div v-if="modelValue.size !== null" class="space-y-1.5">
      <div class="flex items-center justify-between gap-2 h-6">
        <label class="text-sm font-medium text-default">Tekstgrootte</label>
      </div>
      <!--
        Single absolutely-positioned pill animates between segments via
        `transform: translateX(100% * idx)`. Each button is flex-1 so the
        pill (which mirrors that width via `calc((100% - 4px) / N)`)
        lines up segment-for-segment. p-0.5 = 2px ring around the track,
        deducted twice in the width calc.
      -->
      <div class="relative flex items-stretch bg-elevated rounded-lg p-0.5">
        <div
          class="absolute inset-y-0.5 left-0.5 rounded-md bg-default shadow-sm ring-1 ring-accented transition-transform duration-200 ease-out pointer-events-none"
          :style="{
            width: `calc((100% - 4px) / ${modelValue.size.options.length})`,
            transform: `translateX(calc(100% * ${sizeIndex}))`,
          }"
          aria-hidden="true"
        />
        <button
          v-for="(option, idx) in modelValue.size.options"
          :key="option"
          type="button"
          class="relative z-10 flex-1 flex items-center justify-center h-9 rounded-md transition-colors focus:outline-none"
          :class="
            idx === sizeIndex
              ? 'text-default'
              : 'text-muted hover:text-default'
          "
          :title="option"
          :aria-label="option"
          :aria-pressed="idx === sizeIndex"
          @click="onSizePick(idx)"
        >
          <span
            class="font-semibold leading-none"
            :style="{ fontSize: segmentSizePx(idx, modelValue.size.options.length) + 'px' }"
          >A</span>
        </button>
      </div>
    </div>

    <div class="space-y-1.5">
      <div class="flex items-center justify-between gap-2 h-6">
        <span class="text-sm font-medium text-default">Titel</span>
        <label class="flex items-center gap-2 text-xs text-muted cursor-pointer select-none">
          <span>Tonen</span>
          <USwitch
            :model-value="modelValue.headingVisible"
            size="xs"
            @update:model-value="onHeadingVisibilityToggle"
          />
        </label>
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
      <div class="flex items-center justify-between gap-2 h-6">
        <label class="text-sm font-medium text-default">Accent</label>
      </div>
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
      <div class="flex items-center justify-between gap-2 h-6">
        <span class="text-sm font-medium text-default">Omschrijving</span>
        <label
          v-if="modelValue.paragraphVisible !== null"
          class="flex items-center gap-2 text-xs text-muted cursor-pointer select-none"
          :class="!modelValue.headingVisible ? 'opacity-50 cursor-not-allowed' : ''"
        >
          <span>Tonen</span>
          <USwitch
            :model-value="modelValue.paragraphVisible"
            :disabled="!modelValue.headingVisible"
            size="xs"
            @update:model-value="onParagraphVisibilityToggle"
          />
        </label>
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

  </div>
</template>
