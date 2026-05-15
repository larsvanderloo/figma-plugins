// ============================================================
// usePluginBridge — UI-iframe <-> plugin-main postMessage-bridge.
//
// Generieke, type-safe wrapper rond het Figma plugin <-> iframe
// postMessage-protocol (spec §5, FIG-MSG-01):
//
//   UI → plugin:   parent.postMessage({ pluginMessage: msg }, '*')
//   Plugin → UI:   window message event, payload in event.data.pluginMessage
//
// In tegenstelling tot de per-handler-API van welder-table's
// usePluginBridge biedt deze compose-laag een bewust smalle, uniforme
// `post(msg)` + `onMessage(handler)` API — handlers worden in de
// store-laag (T6, usePluginView) gedispatcht op msg.type. Dit past
// beter bij de grotere discriminated-union (4 inbound / 7 outbound
// types) zonder N callback-slots te hoeven bijhouden.
//
// Auto-unsubscribe: wanneer de composable binnen een Vue `setup()`
// wordt aangeroepen registreert elke `onMessage` zich automatisch in
// `onUnmounted` zodat we geen listeners lekken bij component-teardown.
// Buiten een setup-context (bv. unit-test) retourneert onMessage de
// unsubscribe-fn die de caller zelf aanroept.
// ============================================================

import { getCurrentInstance, onUnmounted } from 'vue';
import type { PluginToUIMessage, UIToPluginMessage } from '../../types';

/** Handler voor een inkomend plugin-bericht. */
type PluginMessageHandler = (msg: PluginToUIMessage) => void;

/** Opruim-functie die de listener weer afmeldt. */
type Unsubscribe = () => void;

/** Envelope die Figma om elk iframe-bericht plaatst. */
interface PluginMessageEnvelope {
  pluginMessage?: unknown;
}

export interface PluginBridge {
  /** Stuur een typed bericht naar de plugin-main-thread. */
  post: (msg: UIToPluginMessage) => void;
  /**
   * Registreer een handler voor inkomende plugin-berichten.
   * Retourneert een unsubscribe-fn; wanneer we binnen een Vue setup
   * draaien wordt die ook automatisch in onUnmounted aangeroepen.
   */
  onMessage: (handler: PluginMessageHandler) => Unsubscribe;
}

function post(msg: UIToPluginMessage): void {
  parent.postMessage({ pluginMessage: msg }, '*');
}

export function usePluginBridge(): PluginBridge {
  // getCurrentInstance is null wanneer usePluginBridge buiten een Vue
  // component-setup wordt aangeroepen (bv. vanuit een Pinia-store die
  // pas later mount of vanuit tests). Dan slaan we onUnmounted over.
  const inSetup = getCurrentInstance() !== null;

  function onMessage(handler: PluginMessageHandler): Unsubscribe {
    const listener = (event: MessageEvent): void => {
      // Edge-case: Vite HMR en andere iframe-messages hebben geen
      // pluginMessage-envelope. Stil negeren, niet throwen.
      const envelope = event.data as PluginMessageEnvelope | undefined;
      if (envelope === undefined || envelope === null) return;
      const raw = envelope.pluginMessage;
      if (raw === undefined || raw === null || typeof raw !== 'object') return;

      handler(raw as PluginToUIMessage);
    };

    window.addEventListener('message', listener);

    const unsubscribe: Unsubscribe = () => {
      window.removeEventListener('message', listener);
    };

    if (inSetup) {
      onUnmounted(unsubscribe);
    }

    return unsubscribe;
  }

  return { post, onMessage };
}
