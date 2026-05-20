// ============================================================
// useOnboarding — anchored, contextual first-run tour.
//
// Each step has an optional `target` (a `data-tour` attribute on
// the relevant UI element) so the floating banner can re-position
// itself near the element being explained. Steps with a
// `precondition` are filtered out when the slide doesn't have
// that surface — e.g. the "Kaarten" step only shows when the
// current slide actually has a CardWrap.
//
// Action steps (`passive: false`) gate the "Volgende" button on a
// reactive predicate (currentSlideId, activeTab, etc.). Passive
// steps just explain.
//
// Persistence mirrors `useIconRecents`: sandbox reads
// `welder-onboarding-seen-v1` from `figma.clientStorage` on
// `ui-ready`, posts `onboarding-seen`. First-run users see the
// tour; the help button replays it anytime.
// ============================================================

import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { usePluginBridge } from '../composables/usePluginBridge';
import { usePluginView } from './usePluginView';

export type StepId =
  | 'welcome'
  | 'select-slide'
  | 'kleurthema'
  | 'presentatie-tonen'
  | 'titel'
  | 'titel-tonen'
  | 'tekstgrootte'
  | 'accenten'
  | 'omschrijving'
  | 'badge'
  | 'afbeelding'
  | 'switch-to-content'
  | 'kaartweergave'
  | 'kaarten'
  | 'tijdlijn'
  | 'tabellen'
  | 'export'
  | 'hulp'
  | 'done';

export interface OnboardingStep {
  id: StepId;
  icon: string;
  title: string;
  body: string;
  /** Passive = no action needed; Volgende always enabled. */
  passive: boolean;
  /** `data-tour="<value>"` selector on a target UI element. `null` = centered banner. */
  target: string | null;
}

interface StepConfig {
  step: OnboardingStep;
  precondition?: () => boolean;
}

export const useOnboarding = defineStore('onboarding', () => {
  const view = usePluginView();

  const isActive = ref<boolean>(false);
  const hasSeen = ref<boolean>(false);
  const stepIndex = ref<number>(0);
  const activeTab = ref<string | null>(null);

  /** All possible steps with their preconditions. Filtered into `steps` reactively. */
  const ALL_STEPS: StepConfig[] = [
    // ── Welcome ───────────────────────────────────────────────
    {
      step: {
        id: 'welcome',
        icon: 'i-lucide-presentation',
        title: 'Bewerk je Figma-presentatie',
        body: 'Welder laat je tekst, iconen en afbeeldingen aanpassen in Figma Slides — zonder het ontwerp aan te raken.',
        passive: true,
        target: null,
      },
    },
    // ── Slide selecteren ───────────────────────────────────────
    {
      step: {
        id: 'select-slide',
        icon: 'i-lucide-mouse-pointer-click',
        title: 'Klik op een slide in Figma',
        body: 'Welder laadt de inhoud van die slide in dit paneel.',
        passive: false,
        target: null,
      },
      // Skip if a slide is already loaded.
      precondition: () => view.state.currentSlideId === null,
    },
    // ── Slide-instellingen ────────────────────────────────────
    {
      step: {
        id: 'kleurthema',
        icon: 'i-lucide-palette',
        title: 'Kies het kleurthema',
        body: 'Wissel het thema van deze slide. De ontwerper bepaalt welke thema\'s beschikbaar zijn.',
        passive: true,
        target: 'kleurthema',
      },
      precondition: () => view.state.general?.theme !== null && view.state.general?.theme !== undefined,
    },
    {
      step: {
        id: 'presentatie-tonen',
        icon: 'i-lucide-eye-off',
        title: 'Slide overslaan in de presentatie',
        body: 'Schakel uit om de slide te verbergen bij het afspelen. De slide blijft in Figma zichtbaar.',
        passive: true,
        target: 'presentatie-tonen',
      },
      precondition: () => view.currentSummary !== null && view.currentSummary.isSkipped !== null,
    },
    // ── Tekst ─────────────────────────────────────────────────
    {
      step: {
        id: 'titel',
        icon: 'i-lucide-type',
        title: 'Bewerk de titel',
        body: 'Typ hier. De slide werkt direct bij.',
        passive: true,
        target: 'titel',
      },
      precondition: () => view.state.general?.titleDescription !== null && view.state.general?.titleDescription !== undefined,
    },
    {
      step: {
        id: 'titel-tonen',
        icon: 'i-lucide-eye',
        title: 'Verberg de titel',
        body: 'Schakel uit om de titel van de slide te halen. De tekst blijft bewaard.',
        passive: true,
        target: 'titel-tonen',
      },
      precondition: () => view.state.general?.titleDescription !== null && view.state.general?.titleDescription !== undefined,
    },
    {
      step: {
        id: 'tekstgrootte',
        icon: 'i-lucide-text-cursor',
        title: 'Kies de titelgrootte',
        body: 'Vier maten — van H3 (compact) tot Display (schermvullend).',
        passive: true,
        target: 'tekstgrootte',
      },
      precondition: () => view.state.general?.titleDescription?.size !== null && view.state.general?.titleDescription?.size !== undefined,
    },
    {
      step: {
        id: 'accenten',
        icon: 'i-lucide-highlighter',
        title: 'Accentueer woorden in de titel',
        body: 'Klik op een woord om het te markeren. De accentkleur volgt het thema van de slide.',
        passive: true,
        target: 'accenten',
      },
      precondition: () => {
        const td = view.state.general?.titleDescription;
        return td !== null && td !== undefined && td.headingVisible && td.headingDim !== null;
      },
    },
    {
      step: {
        id: 'omschrijving',
        icon: 'i-lucide-align-left',
        title: 'Voeg een omschrijving toe',
        body: 'Korte toelichting onder de titel. Schakel uit om te verbergen.',
        passive: true,
        target: 'omschrijving',
      },
      precondition: () => {
        const td = view.state.general?.titleDescription;
        return td !== null && td !== undefined && td.paragraph !== null;
      },
    },
    {
      step: {
        id: 'badge',
        icon: 'i-lucide-tag',
        title: 'Voeg een badge toe',
        body: 'Kies een icoon en typ een label. Klik het icoon aan om uit 1.970 opties te kiezen.',
        passive: true,
        target: 'badge',
      },
      precondition: () => view.state.general?.badge !== null && view.state.general?.badge !== undefined,
    },
    {
      step: {
        id: 'afbeelding',
        icon: 'i-lucide-image',
        title: 'Plaats een afbeelding',
        body: 'Upload, vervang of snij bij. JPG en PNG werken direct.',
        passive: true,
        target: 'afbeelding',
      },
      precondition: () => view.state.general?.image !== null && view.state.general?.image !== undefined,
    },
    // ── Onderdelen ────────────────────────────────────────────
    {
      step: {
        id: 'switch-to-content',
        icon: 'i-lucide-layers',
        title: 'Open Onderdelen',
        body: 'Klik op Onderdelen voor kaarten, tijdlijnen en tabellen.',
        passive: false,
        target: 'tabs',
      },
      precondition: () => view.hasContent || view.hasGraphs,
    },
    {
      step: {
        id: 'kaartweergave',
        icon: 'i-lucide-layout-grid',
        title: 'Kies de kaartopmaak',
        body: 'Alleen tekst, compact of standaard — bepaalt of iconen zichtbaar zijn.',
        passive: true,
        target: 'kaartweergave',
      },
      precondition: () => {
        const cards = view.state.content?.cards;
        return cards !== undefined && cards.length > 0;
      },
    },
    {
      step: {
        id: 'kaarten',
        icon: 'i-lucide-rows-3',
        title: 'Bewerk de kaarten',
        body: 'Titel, tekst, icoon en afbeelding per kaart.',
        passive: true,
        target: 'kaarten',
      },
      precondition: () => {
        const cards = view.state.content?.cards;
        return cards !== undefined && cards.length > 0;
      },
    },
    {
      step: {
        id: 'tijdlijn',
        icon: 'i-lucide-milestone',
        title: 'Bewerk de tijdlijn',
        body: 'Titel en tekst per tijdlijnpunt. Volgorde aanpassen doe je in Figma.',
        passive: true,
        target: 'tijdlijn',
      },
      precondition: () => {
        const items = view.state.content?.timelineItems;
        return items !== undefined && items.length > 0;
      },
    },
    {
      step: {
        id: 'tabellen',
        icon: 'i-lucide-table',
        title: 'Bewerk de tabel',
        body: 'Voeg rijen en kolommen toe, pas de weergave aan, of importeer een CSV.',
        passive: true,
        target: 'tabel',
      },
      precondition: () => view.hasGraphs,
    },
    // ── Afsluiting ────────────────────────────────────────────
    {
      step: {
        id: 'export',
        icon: 'i-lucide-download',
        title: 'Exporteer je presentatie',
        body: 'Eén slide of de hele presentatie, PDF of PNG. Via de knop rechtsonder.',
        passive: true,
        target: 'export-button',
      },
    },
    {
      step: {
        id: 'hulp',
        icon: 'i-lucide-circle-help',
        title: 'Herhaal de rondleiding',
        body: 'Klik op het ?-icoon om deze uitleg opnieuw te starten.',
        passive: true,
        target: 'help-button',
      },
    },
    {
      step: {
        id: 'done',
        icon: 'i-lucide-check',
        title: 'Je bent klaar',
        body: 'Selecteer een slide en begin met bewerken. Vragen? Klik op het ?-icoon.',
        passive: true,
        target: null,
      },
    },
  ];

  /** Filtered list of steps applicable to the current slide. Reactive. */
  const steps = computed<OnboardingStep[]>(() => {
    return ALL_STEPS.filter((entry) => {
      if (entry.precondition === undefined) return true;
      return entry.precondition();
    }).map((entry) => entry.step);
  });

  const currentStep = computed<OnboardingStep>(() => {
    const list = steps.value;
    if (list.length === 0) return ALL_STEPS[0].step;
    const idx = Math.min(stepIndex.value, list.length - 1);
    return list[idx];
  });

  const isLast = computed<boolean>(() => stepIndex.value >= steps.value.length - 1);

  /** Reactive gate on the "Volgende" button for action steps. */
  const canAdvance = computed<boolean>(() => {
    const step = currentStep.value;
    if (step.passive) return true;
    if (step.id === 'select-slide') return view.state.currentSlideId !== null;
    if (step.id === 'switch-to-content') return activeTab.value === 'content';
    return true;
  });

  const actionCompleted = computed<boolean>(() => {
    return !currentStep.value.passive && canAdvance.value;
  });

  function setSeenFromSandbox(seen: boolean): void {
    hasSeen.value = seen;
    if (!seen) {
      stepIndex.value = 0;
      isActive.value = true;
    }
  }

  function open(): void {
    stepIndex.value = 0;
    isActive.value = true;
  }

  function close(): void {
    isActive.value = false;
    if (!hasSeen.value) {
      hasSeen.value = true;
      const bridge = usePluginBridge();
      bridge.post({ type: 'set-onboarding-seen' });
    }
  }

  function advance(): void {
    if (!canAdvance.value) return;
    if (isLast.value) {
      close();
    } else {
      stepIndex.value += 1;
    }
  }

  function back(): void {
    if (stepIndex.value > 0) stepIndex.value -= 1;
  }

  function notifyTabChange(tab: string): void {
    activeTab.value = tab;
  }

  return {
    isActive,
    hasSeen,
    stepIndex,
    steps,
    currentStep,
    canAdvance,
    actionCompleted,
    isLast,
    setSeenFromSandbox,
    open,
    close,
    advance,
    back,
    notifyTabChange,
  };
});
