<script setup lang="ts">
import CardItemEditor from '../editors/CardItemEditor.vue';
import InstructorCardEditor from '../editors/InstructorCardEditor.vue';
import TimelineItemEditor from '../editors/TimelineItemEditor.vue';
import type { TimelineItem } from '../../../shared/types';
import { useCardEditor } from '../../composables/useCardEditor';
import { useInstructorEditor } from '../../composables/useInstructorEditor';
import { useTimelineEditor } from '../../composables/useTimelineEditor';
import EditorWrapper from '../ui/EditorWrapper.vue';
import WCard from '../ui/WCard.vue';

const cardEditor = useCardEditor();
const instructorEditor = useInstructorEditor();
const timelineEditor = useTimelineEditor();
type CardSize = 'NO_ICON' | 'SM' | 'LG';

const sizeOptions: Array<{ value: CardSize; label: string; icon: string }> = [
  { value: 'NO_ICON', label: 'Alleen tekst', icon: 'i-lucide-type' },
  { value: 'SM', label: 'Compact', icon: 'i-lucide-rows-3' },
  { value: 'LG', label: 'Standaard', icon: 'i-lucide-rows-2' },
];

function onCardSizeChange(value: string | number | undefined): void {
  if (value === 'NO_ICON' || value === 'SM' || value === 'LG') {
    cardEditor.commitCardSize(value);
  }
}
</script>

<template>
  <UContainer class="space-y-4">
    <UEmpty
      v-if="
        cardEditor.cards.length === 0 &&
        instructorEditor.items.length === 0 &&
        timelineEditor.items.length === 0
      "
      icon="i-lucide-layers"
      description="Geen onderdelen op deze slide."
      variant="naked"
    />

    <EditorWrapper v-if="cardEditor.cards.length > 0" title="Kaarten" data-tour="kaarten">
      <WCard>
        <UFormField label="Kaartweergave" data-tour="kaartweergave">
        <URadioGroup
          :model-value="cardEditor.cardSize"
          :items="sizeOptions"
          value-key="value"
          variant="card"
          orientation="horizontal"
          indicator="hidden"
          :ui="{ fieldset: 'grid grid-cols-3 gap-2', item: 'min-w-0' }"
          @update:model-value="onCardSizeChange"
        >
          <template #label="{ item }">
            <span
              class="relative flex flex-col items-center justify-center gap-1.5 px-3 py-3 transition-colors"
              :class="
                cardEditor.cardSize === item.value
                  ? 'text-primary'
                  : 'text-default'
              "
            >
              <UIcon
                :name="item.icon"
                class="size-5 transition-opacity"
                :class="{ 'opacity-60': cardEditor.isApplyingCardSize && cardEditor.cardSize === item.value }"
              />
              <span
                class="text-xs font-medium transition-opacity"
                :class="{ 'opacity-60': cardEditor.isApplyingCardSize && cardEditor.cardSize === item.value }"
              >
                {{ item.label }}
              </span>
              <span
                v-if="cardEditor.isApplyingCardSize && cardEditor.cardSize === item.value"
                class="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden"
                aria-hidden="true"
              >
                <span class="block h-full w-1/3 bg-primary/80 animate-tile-progress" />
              </span>
            </span>
          </template>
        </URadioGroup>
        </UFormField>

        <template
          v-for="(card, idx) in cardEditor.cards"
          :key="card.cardNodeId"
        >
          <USeparator />
          <CardItemEditor
            :model-value="card"
            :index="idx + 1"
            :preview-url="cardEditor.previewUrls[card.cardNodeId] || null"
            :size-bytes="cardEditor.previewSizes[card.cardNodeId] || null"
            :icon-disabled="cardEditor.cardSize === 'NO_ICON'"
            @update:model-value="cardEditor.update"
            @upload-visual="(bytes) => cardEditor.uploadVisual(card.cardNodeId, bytes)"
          />
        </template>
      </WCard>
    </EditorWrapper>

    <EditorWrapper v-if="instructorEditor.items.length > 0" title="Instructeurs">
      <WCard>
        <template
          v-for="(card, idx) in instructorEditor.items"
          :key="card.cardNodeId"
        >
          <USeparator v-if="idx > 0" />
          <InstructorCardEditor
            :model-value="card"
            :index="idx + 1"
            @update:model-value="instructorEditor.update"
          />
        </template>
      </WCard>
    </EditorWrapper>

    <EditorWrapper v-if="timelineEditor.items.length > 0" title="Tijdlijn" data-tour="tijdlijn">
      <WCard>
        <template
          v-for="(item, idx) in timelineEditor.items"
          :key="item.copyWrapNodeId"
        >
          <USeparator v-if="idx > 0" />
          <TimelineItemEditor
            :model-value="item"
            :index="idx + 1"
            @update:model-value="(val: TimelineItem) => timelineEditor.update(item.copyWrapNodeId, val)"
          />
        </template>
      </WCard>
    </EditorWrapper>
  </UContainer>
</template>
