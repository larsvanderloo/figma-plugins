<!--
  Tabs — dunne wrapper rond Nuxt UI's <UTabs> met drie vaste tabs:
  General / Content / Graphs (spec §9 T6). Per-tab content komt
  binnen via named slots (`#general`, `#content`, `#graphs`).

  `availableTabs` filtert de items-list zodat App.vue later een tab
  kan verbergen als de slide de bijbehorende wrapper mist (T7+).
  Voor T6 passeren we alle drie de tabs ongeacht payload.

  v-model wordt door-gepropageerd naar UTabs via computed<get/set>
  zodat de parent (App.vue of usePluginView) de source-of-truth
  behoudt.
-->
<script setup lang="ts">
import { computed } from 'vue';
import type { TabId } from '../../types';

interface Props {
  modelValue: TabId;
  availableTabs?: TabId[];
  /**
   * Wanneer `true` rendert UTabs enkel de tab-strip; de panels komen
   * dan apart in de parent (App.vue T16: tabs-card los van content-cards).
   */
  stripOnly?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  availableTabs: () => ['general', 'graphs'] as TabId[],
  stripOnly: false,
});

const emit = defineEmits<{
  'update:modelValue': [value: TabId];
}>();

const TAB_LABELS: Record<TabId, string> = {
  general: 'Titel & onderschrift',
  graphs: 'Grafieken en tabellen',
};

const items = computed(() => {
  return props.availableTabs.map((id) => ({
    label: TAB_LABELS[id],
    value: id,
    slot: id as TabId,
  }));
});

// Two-way v-model bridge: UTabs v-model blijft in sync met de parent.
const active = computed<TabId>({
  get() {
    return props.modelValue;
  },
  set(next: TabId) {
    emit('update:modelValue', next);
  },
});
</script>

<template>
  <UTabs
    v-model="active"
    :items="items"
    :unmount-on-hide="false"
    :content="!stripOnly"
    variant="pill"
    size="lg"
    class="w-full"
  >
    <template #general>
      <slot name="general" />
    </template>
    <template #graphs>
      <slot name="graphs" />
    </template>
  </UTabs>
</template>
