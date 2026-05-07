// ============================================================
// useEditHistory — plugin-action undo/redo stack.
//
// Scope (intentional MVP):
//   - Tracks only a small set of mutating bridge messages so we can
//     test the architecture before wiring the long tail of edit
//     types. Currently covered: update-general (titleDescription /
//     badge / image), update-card, set-slide-theme.
//   - Other tracked edits (timeline, journey, table, chart, image
//     upload, etc.) still flow through the bridge but aren't
//     replayable yet — they'd need their own `recordIssued` call sites
//     once we extend the scope.
//
// State model:
//   - `lastIssued`: stack of plugin-issued mutations, most-recent-last.
//     Each plugin edit appends here.
//   - `undone`: stack of mutations that have been undone but not yet
//     redone. Most-recent-last. A new tracked edit clears this stack
//     (standard editor behaviour — once you start editing again, the
//     redo path is invalidated).
//
// Flow:
//   Edit  → recordIssued(msg)  → lastIssued.push(msg); undone = []
//   Undo  → popForUndo()       → moves top of lastIssued onto undone,
//                                 returns the message so the caller
//                                 can fire `trigger-undo` to revert
//                                 the document.
//   Redo  → popForRedo()       → moves top of undone onto lastIssued,
//                                 returns the message so the caller
//                                 can re-post it via the bridge.
//
// Honest constraint: native Cmd+Z that we don't observe will desync
// our stacks from Figma's undo state. The plugin Redo button could
// then re-apply something stale. Acceptable for MVP testing — a real
// fix would clear stacks on `documentchange` we didn't trigger.
// ============================================================

import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type { UIToPluginMessage } from '../../types';

/** The subset of bridge messages we currently know how to replay. */
export type TrackedEditMessage = Extract<
  UIToPluginMessage,
  { type: 'update-general' } | { type: 'update-card' } | { type: 'set-slide-theme' }
>;

/** ms — slide-focused messages that arrive within this window of an
 *  Undo/Redo button click are treated as echoes of our own action and
 *  ignored, so the auto-follow handler doesn't switch the iframe to a
 *  different slide because Figma's selection shifted as a side effect. */
const HISTORY_REPLAY_WINDOW_MS = 600;

export const useEditHistory = defineStore('editHistory', () => {
  const lastIssued = ref<TrackedEditMessage[]>([]);
  const undone = ref<TrackedEditMessage[]>([]);
  /** Timestamp until which slide-focused auto-follow should be suppressed. */
  const suppressFollowUntil = ref<number>(0);

  function recordIssued(msg: TrackedEditMessage): void {
    lastIssued.value = [...lastIssued.value, msg];
    if (undone.value.length > 0) undone.value = [];
  }

  /** Called by Undo/Redo button click sites just before they post the
   *  bridge message. The window is generous enough to cover the
   *  sandbox's documentchange → postSlideList debounce and any
   *  selectionchange-triggered slide-focused emission that might
   *  follow as a side effect of the mutation. */
  function markHistoryReplay(): void {
    suppressFollowUntil.value = Date.now() + HISTORY_REPLAY_WINDOW_MS;
  }

  function isInHistoryReplay(): boolean {
    return Date.now() < suppressFollowUntil.value;
  }

  /** Move the top of `lastIssued` onto `undone` and return it. */
  function popForUndo(): TrackedEditMessage | null {
    if (lastIssued.value.length === 0) return null;
    const top = lastIssued.value[lastIssued.value.length - 1];
    lastIssued.value = lastIssued.value.slice(0, -1);
    undone.value = [...undone.value, top];
    return top;
  }

  /** Move the top of `undone` onto `lastIssued` and return it. */
  function popForRedo(): TrackedEditMessage | null {
    if (undone.value.length === 0) return null;
    const top = undone.value[undone.value.length - 1];
    undone.value = undone.value.slice(0, -1);
    lastIssued.value = [...lastIssued.value, top];
    return top;
  }

  function clearAll(): void {
    lastIssued.value = [];
    undone.value = [];
  }

  const canUndo = computed<boolean>(() => lastIssued.value.length > 0);
  const canRedo = computed<boolean>(() => undone.value.length > 0);

  return {
    lastIssued,
    undone,
    suppressFollowUntil,
    recordIssued,
    popForUndo,
    popForRedo,
    clearAll,
    canUndo,
    canRedo,
    markHistoryReplay,
    isInHistoryReplay,
  };
});
