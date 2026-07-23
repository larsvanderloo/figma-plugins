<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, nextTick } from 'vue';
import { useOnboarding } from '../../stores/useOnboarding';

const onboarding = useOnboarding();

const VIEWPORT_PADDING = 12;
const ANCHOR_GAP = 10;
const TOOLTIP_WIDTH = 280;

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const targetRect = ref<TargetRect | null>(null);
const tooltipRef = ref<HTMLElement | null>(null);
const tooltipHeight = ref<number>(120);

const hasTarget = computed<boolean>(() => onboarding.currentStep.target !== null);

const showModal = computed<boolean>(() => onboarding.isActive && !hasTarget.value);
const showTooltip = computed<boolean>(() => onboarding.isActive && hasTarget.value);

const totalSteps = computed<number>(() => onboarding.steps.length);
const stepNumber = computed<number>(() => onboarding.stepIndex + 1);

function findTarget(): HTMLElement | null {
  const sel = onboarding.currentStep.target;
  if (sel === null) return null;
  return document.querySelector<HTMLElement>(`[data-tour="${sel}"]`);
}

function measure(): void {
  const el = findTarget();
  if (el === null) {
    targetRect.value = null;
    return;
  }
  const rect = el.getBoundingClientRect();
  targetRect.value = {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
  if (tooltipRef.value !== null) {
    tooltipHeight.value = tooltipRef.value.offsetHeight;
  }
}

const tooltipStyle = computed<Record<string, string>>(() => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const rect = targetRect.value;
  if (rect === null) {
    return { display: 'none', top: '0', left: '0', width: TOOLTIP_WIDTH + 'px' };
  }

  const spaceBelow = vh - (rect.top + rect.height);
  const placeBelow = spaceBelow >= tooltipHeight.value + ANCHOR_GAP + 16;

  const targetCenterX = rect.left + rect.width / 2;
  let left = targetCenterX - TOOLTIP_WIDTH / 2;
  left = Math.max(VIEWPORT_PADDING, Math.min(left, vw - TOOLTIP_WIDTH - VIEWPORT_PADDING));

  const top = placeBelow
    ? rect.top + rect.height + ANCHOR_GAP
    : Math.max(VIEWPORT_PADDING, rect.top - tooltipHeight.value - ANCHOR_GAP);

  return {
    display: 'block',
    top: top + 'px',
    left: left + 'px',
    width: TOOLTIP_WIDTH + 'px',
  };
});

const connectorStyle = computed<Record<string, string>>(() => {
  const rect = targetRect.value;
  if (rect === null) return { display: 'none', top: '0', left: '0' };
  const vh = window.innerHeight;
  const spaceBelow = vh - (rect.top + rect.height);
  const placeBelow = spaceBelow >= tooltipHeight.value + ANCHOR_GAP + 16;
  const cx = rect.left + rect.width / 2;
  const cy = placeBelow ? rect.top + rect.height + ANCHOR_GAP / 2 : rect.top - ANCHOR_GAP / 2;
  return {
    display: 'block',
    top: cy - 4 + 'px',
    left: cx - 4 + 'px',
  };
});

const spotlightStyle = computed<Record<string, string>>(() => {
  const rect = targetRect.value;
  if (rect === null) {
    return { display: 'none', top: '0', left: '0', width: '0', height: '0' };
  }
  return {
    display: 'block',
    top: rect.top - 6 + 'px',
    left: rect.left - 6 + 'px',
    width: rect.width + 12 + 'px',
    height: rect.height + 12 + 'px',
  };
});

let rafId: number | null = null;
function scheduleMeasure(): void {
  if (rafId !== null) return;
  rafId = requestAnimationFrame(() => {
    rafId = null;
    measure();
  });
}

let mainEl: HTMLElement | null = null;

onMounted(() => {
  mainEl = document.querySelector<HTMLElement>('main');
  window.addEventListener('resize', scheduleMeasure);
  window.addEventListener('scroll', scheduleMeasure, true);
  if (mainEl !== null) mainEl.addEventListener('scroll', scheduleMeasure);
  void nextTick(() => measure());
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', scheduleMeasure);
  window.removeEventListener('scroll', scheduleMeasure, true);
  if (mainEl !== null) mainEl.removeEventListener('scroll', scheduleMeasure);
  if (rafId !== null) cancelAnimationFrame(rafId);
});

watch(
  () => onboarding.currentStep.id,
  () => void nextTick(() => measure()),
);
watch(
  () => onboarding.isActive,
  (open) => {
    if (open) void nextTick(() => measure());
  },
);
watch(
  () => onboarding.canAdvance,
  () => void nextTick(() => measure()),
);

function onSkip(): void {
  onboarding.close();
}

function onNext(): void {
  onboarding.advance();
}

function onModalToggle(next: boolean): void {
  if (!next) onboarding.close();
}

const isLast = computed<boolean>(() => onboarding.isLast);
</script>

<template>
  <UModal
    :open="showModal"
    :title="onboarding.currentStep.title"
    :dismissible="true"
    @update:open="onModalToggle"
  >
    <template #body>
      <div class="flex flex-col items-center gap-4 py-2 text-center">
        <span class="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <UIcon :name="onboarding.currentStep.icon" class="size-6" />
        </span>
        <p class="text-sm text-default leading-relaxed">
          {{ onboarding.currentStep.body }}
        </p>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full items-center justify-between gap-2">
        <span class="text-xs text-muted">{{ stepNumber }} / {{ totalSteps }}</span>
        <div class="flex gap-2">
          <UButton color="neutral" variant="ghost" size="xs" @click="onSkip">
            Overslaan
          </UButton>
          <UButton color="primary" variant="solid" size="sm" @click="onNext">
            {{ isLast ? 'Klaar' : 'Aan de slag' }}
          </UButton>
        </div>
      </div>
    </template>
  </UModal>

  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="opacity-0 scale-95"
    leave-active-class="transition duration-150 ease-in"
    leave-to-class="opacity-0 scale-95"
  >
    <Teleport v-if="showTooltip" to="body">
      <!-- The 9999px shadow spread dims the whole viewport, leaving a cut-out around the target. -->
      <div
        class="pointer-events-none fixed z-40 rounded-lg ring-2 ring-primary/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] transition-all duration-200"
        :style="spotlightStyle"
        aria-hidden="true"
      />

      <span
        class="pointer-events-none fixed z-50 block size-2 rounded-full bg-primary ring-2 ring-white/90"
        :style="connectorStyle"
        aria-hidden="true"
      />

      <div
        ref="tooltipRef"
        class="pointer-events-auto fixed z-50 rounded-xl bg-neutral-800 text-white p-4 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.5)] ring-1 ring-black/20"
        :style="tooltipStyle"
        role="dialog"
        aria-label="Rondleiding"
      >
        <div class="flex items-start justify-between gap-2">
          <h3 class="text-sm font-semibold pr-6">{{ onboarding.currentStep.title }}</h3>
          <button
            type="button"
            class="-mr-1 -mt-1 flex size-6 shrink-0 items-center justify-center rounded text-neutral-400 hover:text-white transition-colors"
            aria-label="Sluit rondleiding"
            @click="onSkip"
          >
            <UIcon name="i-lucide-x" class="size-4" />
          </button>
        </div>
        <p class="mt-1 text-xs text-neutral-300 leading-relaxed">
          {{ onboarding.currentStep.body }}
        </p>
        <div class="mt-3 flex items-center justify-between gap-2">
          <span class="text-xs font-medium text-neutral-400">{{ stepNumber }} / {{ totalSteps }}</span>
          <UButton
            color="primary"
            variant="solid"
            size="xs"
            :disabled="!onboarding.canAdvance"
            @click="onNext"
          >
            {{ isLast ? 'Klaar' : 'Volgende' }}
          </UButton>
        </div>
      </div>
    </Teleport>
  </Transition>
</template>
