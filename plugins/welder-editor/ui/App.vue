<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { MESSAGE_BUS_VERSION, type Message, type NodeRef } from '@shared/messages';

const ready = ref(false);
const selection = ref<NodeRef[]>([]);
const editorType = ref<string>('');

function postToCode(msg: Message) {
  parent.postMessage({ pluginMessage: msg }, '*');
}

onMounted(() => {
  window.addEventListener('message', (event) => {
    const msg = event.data?.pluginMessage as Message | undefined;
    if (!msg) return;
    if (msg.version !== MESSAGE_BUS_VERSION) {
      console.error(
        `message-bus version mismatch: got ${msg.version}, expected ${MESSAGE_BUS_VERSION}`,
      );
      return;
    }
    switch (msg.type) {
      case 'init':
        selection.value = msg.payload.selection;
        editorType.value = msg.payload.editorType;
        ready.value = true;
        return;
      case 'selection-changed':
        selection.value = msg.payload.selection;
        return;
    }
  });
});

function close() {
  postToCode({ type: 'close', version: MESSAGE_BUS_VERSION });
}
</script>

<template>
  <main class="p-4">
    <h1 class="text-base font-semibold">Welder Editor</h1>
    <p v-if="!ready" class="text-sm text-gray-500">Loading…</p>
    <div v-else>
      <p class="text-sm">Editor: {{ editorType }}</p>
      <p class="text-sm">Selection: {{ selection.length }} node(s)</p>
      <button
        type="button"
        class="mt-3 rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
        @click="close"
      >
        Close plugin
      </button>
    </div>
  </main>
</template>
