<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import WCard from '../ui/WCard.vue';
import WInput from '../ui/WInput.vue';
import WTextarea from '../ui/WTextarea.vue';
import IconPicker from '../ui/IconPicker.vue';
import { useTitleDescriptionEditor } from '../../composables/useTitleDescriptionEditor';
import { useBadgeEditor } from '../../composables/useBadgeEditor';
import { useLiveText } from '../../composables/useLiveText';

export interface TitleDescriptionValue {
  heading: string;
  paragraph: string | null;
  headingVisible: boolean;
  paragraphVisible: boolean | null;
  headingDim: Array<[number, number]> | null;
  size: { current: string; options: ReadonlyArray<string> } | null;
}

export interface BadgeValue {
  label: string;
  icon: string;
  visible: boolean | null;
}

const td = useTitleDescriptionEditor();
const bd = useBadgeEditor();

const hasParagraph = computed<boolean>(() => td.model !== null && td.model.paragraph !== null);
const showHeadingFields = computed<boolean>(() => td.model !== null && td.model.headingVisible);
const showAccentFields = computed<boolean>(
  () => td.model !== null && td.model.headingVisible && td.model.headingDim !== null,
);
const showParagraphSection = computed<boolean>(
  () => hasParagraph.value && td.model !== null && td.model.headingVisible,
);
const showParagraphInput = computed<boolean>(
  () => showParagraphSection.value && td.model !== null && td.model.paragraphVisible !== false,
);

const sizeRadioItems = computed<Array<{ value: string; label: string }>>(() => {
  const s = td.model?.size ?? null;
  if (s === null) return [];
  return s.options.map((option) => ({ value: option, label: option }));
});

const SEGMENT_MIN_PX = 11;
const SEGMENT_MAX_PX = 20;
function segmentSizePx(idx: number, total: number): number {
  if (total <= 1) return SEGMENT_MAX_PX;
  const t = idx / (total - 1);
  return SEGMENT_MIN_PX + (SEGMENT_MAX_PX - SEGMENT_MIN_PX) * t;
}

function onSizePick(idx: number): void {
  const s = td.model?.size ?? null;
  if (s === null) return;
  const next = s.options[idx];
  if (typeof next === 'string' && next !== s.current) {
    td.commitSize(next);
  }
}

function onSizeChange(value: string | number | undefined): void {
  const s = td.model?.size ?? null;
  if (s === null || typeof value !== 'string') return;
  const idx = s.options.indexOf(value);
  if (idx >= 0) onSizePick(idx);
}

function sizeLabelPx(value: string): number {
  const s = td.model?.size ?? null;
  if (s === null) return SEGMENT_MAX_PX;
  const idx = s.options.indexOf(value);
  return segmentSizePx(idx >= 0 ? idx : 0, s.options.length);
}

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
  if (td.model === null) return [];
  const parts = td.model.heading.split(/(\s+)/);
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

hydrateDimWords(td.model?.headingDim ?? null);
watch(
  () => td.model?.headingDim ?? null,
  (next) => hydrateDimWords(next),
);

// Herpositioneer accent-ranges over een tekst-edit heen in plaats van ze
// te wissen (het oude gedrag — per blur nauwelijks zichtbaar, maar met
// live typing verdween elke nadruk al bij het bijtypen van een woord).
// Prefix/suffix-diff: ranges vóór de edit blijven staan, ranges erna
// schuiven met het lengteverschil mee; alleen een range die de bewerkte
// regio zelf raakt vervalt — dat woord is dan wezenlijk veranderd.
function remapDimRanges(
  oldText: string,
  newText: string,
  ranges: Array<[number, number]>,
): Array<[number, number]> {
  if (ranges.length === 0 || oldText === newText) return ranges;
  const oldLen = oldText.length;
  const newLen = newText.length;
  const minLen = Math.min(oldLen, newLen);
  let prefix = 0;
  while (prefix < minLen && oldText[prefix] === newText[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < minLen - prefix &&
    oldText[oldLen - 1 - suffix] === newText[newLen - 1 - suffix]
  ) {
    suffix++;
  }
  const oldChangeEnd = oldLen - suffix;
  const delta = newLen - oldLen;
  const out: Array<[number, number]> = [];
  for (const [start, end] of ranges) {
    if (end <= prefix) out.push([start, end]);
    else if (start >= oldChangeEnd) out.push([start + delta, end + delta]);
  }
  return out;
}

function onHeadingCommit(value: string): void {
  headingLive.cancel();
  if (td.model === null) return;
  td.update({
    heading: value,
    paragraph: td.model.paragraph,
    headingVisible: td.model.headingVisible,
    paragraphVisible: td.model.paragraphVisible,
    headingDim: remapDimRanges(td.model.heading, value, td.model.headingDim ?? []),
    size: td.model.size,
  });
  // Geen dimWords-wipe meer: de headingDim-watch hydrateert de chips
  // opnieuw zodra de (geremapte) ranges in de store landen.
}

function onParagraphCommit(value: string): void {
  paragraphLive.cancel();
  if (td.model === null) return;
  td.update({
    heading: td.model.heading,
    paragraph: hasParagraph.value ? value : null,
    headingVisible: td.model.headingVisible,
    paragraphVisible: td.model.paragraphVisible,
    headingDim: td.model.headingDim,
    size: td.model.size,
  });
}

function onHeadingVisibilityToggle(next: boolean): void {
  td.commitVisibility('heading', next);
}

function onParagraphVisibilityToggle(next: boolean): void {
  td.commitVisibility('paragraph', next);
}

function toggleWord(wordIndex: number): void {
  const next = new Set(dimWords.value);
  if (next.has(wordIndex)) next.delete(wordIndex);
  else next.add(wordIndex);
  dimWords.value = next;
  td.updateHeadingDim(buildCharRanges());
}

function onAccentFocusOut(event: FocusEvent): void {
  const current = event.currentTarget;
  const next = event.relatedTarget;
  if (current instanceof Node && next instanceof Node && current.contains(next)) return;
  td.flushHeadingDim();
}

function onBadgeLabelCommit(value: string): void {
  badgeLabelLive.cancel();
  if (bd.model === null) return;
  bd.update({ label: value, icon: bd.model.icon, visible: bd.model.visible });
}

function onBadgeIconChange(value: string): void {
  if (bd.model === null) return;
  bd.update({ label: bd.model.label, icon: value, visible: bd.model.visible });
}

function onBadgeVisibilityToggle(next: boolean): void {
  bd.commitVisibility(next);
}

// Live meetypen op het canvas: elke aanslag komt via het `live`-event
// binnen en gaat gedebounced (200ms, zie useLiveText) door exact dezelfde
// commit-handler als blur/Enter — één write per typ-pauze, zelfde gevoel
// als de tabel-grid. De commit-handlers cancel()en eerst de pending tick:
// een commit post zelf direct, anders vuurt dezelfde waarde twee keer.
let liveHeadingValue = '';
const headingLive = useLiveText(() => onHeadingCommit(liveHeadingValue));
function onHeadingLive(value: string): void {
  liveHeadingValue = value;
  headingLive.schedule();
}

let liveParagraphValue = '';
const paragraphLive = useLiveText(() => onParagraphCommit(liveParagraphValue));
function onParagraphLive(value: string): void {
  liveParagraphValue = value;
  paragraphLive.schedule();
}

let liveBadgeLabelValue = '';
const badgeLabelLive = useLiveText(() => onBadgeLabelCommit(liveBadgeLabelValue));
function onBadgeLabelLive(value: string): void {
  liveBadgeLabelValue = value;
  badgeLabelLive.schedule();
}
</script>

<template>
  <WCard v-if="td.model !== null || bd.model !== null">
    <template v-if="td.model !== null">
    <UFormField label="Titel" data-tour="titel">
      <template #hint>
        <USwitch
          :model-value="td.model.headingVisible"
          label="Tonen"
          size="xs"
          data-tour="titel-tonen"
          :ui="{ root: 'flex-row-reverse gap-2' }"
          @update:model-value="onHeadingVisibilityToggle"
        />
      </template>
      <WInput
        v-if="showHeadingFields"
        :model-value="td.model.heading"
        placeholder="Bijv. Onze missie voor 2026"
        class="w-full"
        @update:model-value="onHeadingCommit"
        @live="onHeadingLive"
      />
    </UFormField>

    <UFormField v-if="td.model.size !== null && showHeadingFields" label="Tekstgrootte" data-tour="tekstgrootte">
      <UTabs
        :model-value="td.model.size.current"
        :items="sizeRadioItems"
        value-key="value"
        color="neutral"
        variant="pill"
        size="xs"
        :content="false"
        :ui="{
          trigger: 'h-7 px-2 py-0',
          indicator: 'bg-inverted/15',
        }"
        @update:model-value="onSizeChange"
      >
        <template #default="{ item }">
          <span
            class="font-semibold leading-none"
            :style="{ fontSize: sizeLabelPx(item.value) + 'px' }"
            :title="item.label"
            :aria-label="item.label"
          >A</span>
        </template>
      </UTabs>
    </UFormField>

    <UFormField v-if="showAccentFields" label="Accenten" data-tour="accenten">
      <template #hint>
        <div class="h-5 min-w-20 flex justify-end">
          <Transition
            enter-active-class="transition-opacity duration-150"
            enter-from-class="opacity-0"
            leave-active-class="transition-opacity duration-300"
            leave-to-class="opacity-0"
          >
            <span
              v-if="td.accentPending"
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
        :class="td.accentPending ? 'bg-elevated/60 ring-primary/30' : ''"
        :aria-busy="td.accentPending ? 'true' : 'false'"
      >
        <div
          class="flex flex-wrap items-center gap-2"
          role="group"
          aria-label="Accentwoorden"
          @focusout="onAccentFocusOut"
        >
          <template v-for="(tok, i) in tokens" :key="i">
            <UButton
              v-if="tok.type === 'word'"
              type="button"
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
              v-if="td.accentPending"
              :model-value="null"
              color="primary"
              animation="carousel"
            />
          </Transition>
        </div>
      </div>
    </UFormField>

    <UFormField v-if="showParagraphSection" label="Omschrijving" data-tour="omschrijving">
      <template v-if="td.model.paragraphVisible !== null" #hint>
        <USwitch
          :model-value="td.model.paragraphVisible"
          :disabled="!td.model.headingVisible"
          label="Tonen"
          size="xs"
          :ui="{ root: 'flex-row-reverse gap-2' }"
          @update:model-value="onParagraphVisibilityToggle"
        />
      </template>
      <WTextarea
        v-if="showParagraphInput"
        :model-value="td.model.paragraph ?? ''"
        :rows="3"
        :autoresize="true"
        placeholder="Een korte toelichting onder de titel"
        class="w-full"
        @update:model-value="onParagraphCommit"
        @live="onParagraphLive"
      />
    </UFormField>
    </template>

    <UFormField v-if="bd.model !== null" label="Badge" data-tour="badge">
      <template v-if="bd.model.visible !== null" #hint>
        <USwitch
          :model-value="bd.model.visible"
          label="Tonen"
          size="xs"
          :ui="{ root: 'flex-row-reverse gap-2' }"
          @update:model-value="onBadgeVisibilityToggle"
        />
      </template>
      <div class="flex items-center gap-2">
        <IconPicker
          :model-value="bd.model.icon"
          :disabled="bd.model.visible === false"
          @update:model-value="onBadgeIconChange"
        />
        <WInput
          :model-value="bd.model.label"
          placeholder="Bijv. Belangrijk"
          :disabled="bd.model.visible === false"
          class="flex-1"
          @update:model-value="onBadgeLabelCommit"
          @live="onBadgeLabelLive"
        />
      </div>
    </UFormField>
  </WCard>
</template>
