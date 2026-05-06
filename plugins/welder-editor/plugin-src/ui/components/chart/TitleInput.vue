<!--
  TitleInput — bindt store.title aan een UFormField + UInput.

  Max 64 tekens (spec: ChartData.title). De native `maxlength`
  op UInput voorkomt dat de user langere strings intypt; strikte
  validatie komt in een latere taak.
-->
<script setup lang="ts">
import { useChartStore } from '../../stores/useChartStore';

const store = useChartStore();
</script>

<template>
  <UFormField name="title" label="Titel" size="lg" :hint="`${store.state.title.length}/64`">
    <UInput
      v-model="store.state.title"
      :maxlength="64"
      size="lg"
      placeholder="Mijn grafiek"
      class="w-full"
    />
  </UFormField>
</template>
