// ============================================================
// useNotifications — centralized toast surface backed by Nuxt UI.
//
// Nuxt UI v4 ships `useToast()` (consumed by the `<UApp>` wrapper's
// Toaster). This store wraps that API behind named helpers
// (`pushError`, `pushSuccess`, `pushInfo`, `pushWarning`) so callers
// don't need to remember icon / color conventions and the rest of
// the app stays decoupled from the rendering library.
//
// Lifecycle:
//   - App.vue calls `useToast()` in its setup, then passes the handle
//     to this store via `init(toast)` once.
//   - Anything in the iframe that wants to surface a notification
//     calls `useNotifications().pushError(title, description?)` etc.
//   - Toaster auto-dismisses according to its configured duration
//     (Nuxt UI default: 5s).
//
// Why init() instead of calling `useToast()` here directly: the toast
// composable resolves via Vue's inject() chain, which reliably works
// only inside a component's setup. A Pinia setup-store factory runs
// at first-use, often outside that chain. Storing the handle is the
// least-fragile shape.
// ============================================================

import { defineStore } from 'pinia';

interface ToastAdd {
  add(opts: {
    title: string;
    description?: string;
    color?: 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error' | 'neutral';
    icon?: string;
    duration?: number;
  }): unknown;
}

let toastApi: ToastAdd | null = null;

export const useNotifications = defineStore('notifications', () => {
  /** Wire the Nuxt UI toast handle once (called from App.vue onMounted). */
  function init(api: ToastAdd): void {
    toastApi = api;
  }

  function pushError(title: string, description?: string | null): void {
    toastApi?.add({
      title,
      description: description ?? undefined,
      color: 'error',
      icon: 'i-lucide-triangle-alert',
    });
  }

  function pushSuccess(title: string, description?: string | null): void {
    toastApi?.add({
      title,
      description: description ?? undefined,
      color: 'success',
      icon: 'i-lucide-check',
    });
  }

  function pushWarning(title: string, description?: string | null): void {
    toastApi?.add({
      title,
      description: description ?? undefined,
      color: 'warning',
      icon: 'i-lucide-circle-alert',
    });
  }

  function pushInfo(title: string, description?: string | null): void {
    toastApi?.add({
      title,
      description: description ?? undefined,
      color: 'info',
      icon: 'i-lucide-info',
    });
  }

  return {
    init,
    pushError,
    pushSuccess,
    pushWarning,
    pushInfo,
  };
});
