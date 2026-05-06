<!--
  ThemePicker — bindt store.theme aan twee visuele keuze-knoppen.

  Ontwerpkeuze (zie spec Taak 13): custom buttons met kleur-swatches
  i.p.v. USelect of URadioGroup. Reden:
  - Directe visuele feedback: de gebruiker ziet de daadwerkelijke
    palette-kleuren naast de themanaam.
  - Twee opties is te kort voor een dropdown; een radiogroup-default-
    layout zou meer verticale ruimte kosten zonder visuele winst.
  - `v-model`/`@click`-patroon past bij de rest van App.vue (direct
    muteren van `store.state.*`).

  Het actieve thema wordt gemarkeerd via een ring in de primary color
  (Nuxt UI `ring-primary`) en een semantische accent-achtergrond.
  Inactieve knoppen vallen terug op `border-default`/`bg-default`.
-->
<script setup lang="ts">
import type { ThemeId } from '../../../constants';
import { THEMES } from '../../../constants';
import { useChartStore } from '../../composables/useChartStore';

interface ThemeOption {
  id: ThemeId;
  label: string;
  /** Eerste 3 palette-kleuren voor de swatch-preview. */
  swatches: string[];
}

const themeOptions: ThemeOption[] = [
  { id: 'orange', label: 'Oranje', swatches: THEMES.orange.palette.slice(0, 3) },
  { id: 'blue', label: 'Blauw', swatches: THEMES.blue.palette.slice(0, 3) },
];

const store = useChartStore();

function selectTheme(id: ThemeId): void {
  store.state.theme = id;
}
</script>

<template>
  <UFormField name="theme" label="Thema" size="lg">
    <div class="flex gap-2" role="radiogroup" aria-label="Thema">
      <button
        v-for="opt in themeOptions"
        :key="opt.id"
        type="button"
        role="radio"
        :aria-checked="store.state.theme === opt.id"
        class="flex-1 flex items-center gap-3 rounded-md border px-3 py-2 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        :class="
          store.state.theme === opt.id
            ? 'border-primary bg-primary/10 ring-1 ring-primary'
            : 'border-default bg-default hover:bg-elevated'
        "
        @click="selectTheme(opt.id)"
      >
        <span class="flex shrink-0 overflow-hidden rounded border border-default">
          <span
            v-for="color in opt.swatches"
            :key="color"
            class="block h-5 w-5"
            :style="{ backgroundColor: color }"
          />
        </span>
        <span class="text-sm font-medium">{{ opt.label }}</span>
      </button>
    </div>
  </UFormField>
</template>
