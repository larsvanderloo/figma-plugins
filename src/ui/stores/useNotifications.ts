// init() receives the toast handle from App.vue instead of calling useToast()
// here: useToast() resolves via Vue's inject() chain, which only works reliably
// in component setup — a Pinia setup-store factory runs at first use, outside it.

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
