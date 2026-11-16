export type ToastKind = 'info' | 'ok';

export interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
}

/** Long enough to read a short sentence, short enough not to pile up. */
const TOAST_MS = 2800;

let toasts = $state<Toast[]>([]);
let nextId = 0;

export const notifications = {
  get items(): readonly Toast[] {
    return toasts;
  },
  show(message: string, kind: ToastKind = 'info'): void {
    nextId += 1;
    const toast: Toast = { id: nextId, message, kind };
    toasts = [...toasts, toast];
    setTimeout(() => {
      toasts = toasts.filter((item) => item.id !== toast.id);
    }, TOAST_MS);
  },
};
