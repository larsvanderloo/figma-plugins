<!--
  TitleDescriptionEditor — editor for the General → Title & Description
  section. Uses WInput / WTextarea so typing doesn't fire a sandbox
  round-trip per keystroke (commit-on-blur).

  Accent markers (heading-dim word toggles) operate on the LAST-COMMITTED
  heading text. While the user is typing, markers stay frozen against the
  current modelValue.heading; once blur commits the new heading, markers
  re-derive from it. Length change → char-indices invalid → dim-words
  flush automatically.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import WInput from '../ui/WInput.vue';
import WTextarea from '../ui/WTextarea.vue';

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
  /** True between an accent edit and the sandbox-side acknowledgement. */
  accentPending?: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  'update:modelValue': [value: TitleDescriptionValue];
  'update:headingDim': [ranges: Array<[number, number]>];
  'commit:headingDim': [];
  'commit:size': [size: string];
  'commit:visibility': [field: 'heading' | 'paragraph', visible: boolean];
}>();

const hasParagraph = computed<boolean>(() => props.modelValue.paragraph !== null);
const showHeadingFields = computed<boolean>(() => props.modelValue.headingVisible);
const showAccentFields = computed<boolean>(
  () => props.modelValue.headingVisible && props.modelValue.headingDim !== null,
);
const showParagraphSection = computed<boolean>(
  () => hasParagraph.value && props.modelValue.headingVisible,
);
const showParagraphInput = computed<boolean>(
  () => showParagraphSection.value && props.modelValue.paragraphVisible !== false,
);

// ── Heading-size picker (CopyWrap.Size VARIANT) ────────────────────────
const sizeRadioItems = computed<Array<{ value: string; label: string }>>(() => {
  const s = props.modelValue.size;
  if (s === null) return [];
  return s.options.map((option) => ({ value: option, label: option }));
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

function onSizeChange(value: string | number | undefined): void {
  const s = props.modelValue.size;
  if (s === null || typeof value !== 'string') return;
  const idx = s.options.indexOf(value);
  if (idx >= 0) onSizePick(idx);
}

function sizeLabelPx(value: string): number {
  const s = props.modelValue.size;
  if (s === null) return SEGMENT_MAX_PX;
  const idx = s.options.indexOf(value);
  return segmentSizePx(idx >= 0 ? idx : 0, s.options.length);
}

// ── Accent state (heading inline word-toggle) ──────────────────────────
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

function onAccentFocusOut(event: FocusEvent): void {
  const current = event.currentTarget;
  const next = event.relatedTarget;
  if (current instanceof Node && next instanceof Node && current.contains(next)) return;
  emit('commit:headingDim');
}
</script>

<template>
  <div class="space-y-4">
    <UFormField v-if="modelValue.size !== null" label="Grootte">
      <URadioGroup
        :model-value="modelValue.size.current"
        :items="sizeRadioItems"
        value-key="value"
        variant="table"
        orientation="horizontal"
        indicator="hidden"
        size="sm"
        :ui="{
          fieldset: 'grid [grid-template-columns:repeat(var(--size-count),minmax(0,1fr))]',
          item: 'justify-center p-0 overflow-hidden',
          wrapper: 'w-full',
          label: 'w-full cursor-pointer',
        }"
        :style="{ '--size-count': modelValue.size.options.length }"
        @update:model-value="onSizeChange"
      >
        <template #label="{ item }">
          <span
            class="flex h-9 items-center justify-center transition-colors"
            :class="item.value === modelValue.size.current ? 'bg-default text-default' : 'text-muted hover:text-default'"
            :title="item.label"
            :aria-label="item.label"
          >
            <span
              class="font-semibold leading-none"
              :style="{ fontSize: sizeLabelPx(item.value) + 'px' }"
            >A</span>
          </span>
        </template>
      </URadioGroup>
    </UFormField>

    <UFormField label="Titel">
      <template #hint>
        <USwitch
          :model-value="modelValue.headingVisible"
          label="Tonen"
          size="xs"
          :ui="{
            root: 'flex-row-reverse items-center',
            wrapper: 'me-2 ms-0',
            label: 'text-xs font-medium text-muted',
          }"
          @update:model-value="onHeadingVisibilityToggle"
        />
      </template>
      <WInput
        v-if="showHeadingFields"
        :model-value="modelValue.heading"
        placeholder="Bijv. Onze missie voor 2026"
        size="md"
        class="w-full"
        @update:model-value="onHeadingCommit"
      />
    </UFormField>

    <UFormField v-if="showAccentFields" label="Accenten">
      <template #hint>
        <div class="h-5 min-w-20 flex justify-end">
          <Transition
            enter-active-class="transition-opacity duration-150"
            enter-from-class="opacity-0"
            leave-active-class="transition-opacity duration-300"
            leave-to-class="opacity-0"
          >
            <span
              v-if="accentPending"
              class="inline-flex h-5 items-center gap-1 rounded-full bg-elevated px-2 text-[11px] font-medium text-muted ring-1 ring-default"
              role="status"
              aria-live="polite"
            >
              <UIcon
                name="i-lucide-loader-circle"
                class="size-3 text-primary animate-spin"
                aria-hidden="true"
              />
              Verwerken...
            </span>
          </Transition>
        </div>
      </template>
      <div
        class="-m-1 rounded-md p-1 ring-1 ring-transparent transition-[background-color,box-shadow]"
        :class="accentPending ? 'bg-elevated/60 ring-primary/30' : ''"
        :aria-busy="accentPending ? 'true' : 'false'"
      >
        <div
          class="flex flex-wrap gap-2"
          role="group"
          aria-label="Accentwoorden"
          @focusout="onAccentFocusOut"
        >
          <template v-for="(tok, i) in tokens" :key="i">
            <UButton
              v-if="tok.type === 'word'"
              type="button"
              size="xs"
              :color="dimWords.has(tok.wordIndex) ? 'primary' : 'neutral'"
              :variant="dimWords.has(tok.wordIndex) ? 'solid' : 'subtle'"
              :aria-pressed="dimWords.has(tok.wordIndex)"
              @click="toggleWord(tok.wordIndex)"
            >
              {{ tok.text }}
            </UButton>
          </template>
        </div>
        <div class="mt-2 h-0.5 overflow-hidden">
          <Transition
            enter-active-class="transition-opacity duration-150"
            enter-from-class="opacity-0"
            leave-active-class="transition-opacity duration-200"
            leave-to-class="opacity-0"
          >
            <UProgress
              v-if="accentPending"
              :model-value="null"
              size="xs"
              color="primary"
              animation="carousel"
            />
          </Transition>
        </div>
      </div>
    </UFormField>

    <UFormField v-if="showParagraphSection" label="Omschrijving">
      <template v-if="modelValue.paragraphVisible !== null" #hint>
        <USwitch
          :model-value="modelValue.paragraphVisible"
          :disabled="!modelValue.headingVisible"
          label="Tonen"
          size="xs"
          :ui="{
            root: 'flex-row-reverse items-center',
            wrapper: 'me-2 ms-0',
            label: 'text-xs font-medium text-muted',
          }"
          @update:model-value="onParagraphVisibilityToggle"
        />
      </template>
      <WTextarea
        v-if="showParagraphInput"
        :model-value="modelValue.paragraph ?? ''"
        :rows="3"
        :autoresize="true"
        placeholder="Een korte toelichting onder de titel"
        size="md"
        class="w-full"
        @update:model-value="onParagraphCommit"
      />
    </UFormField>

  </div>
</template>
