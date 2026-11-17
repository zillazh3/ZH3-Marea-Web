export type ToastKind = 'info' | 'ok' | 'error';

export interface ToastAction {
  readonly label: string;
  readonly onClick: () => void;
}

export interface Toast {
  id: number;
  message: string;
  kind: ToastKind;
  action?: ToastAction;
}

export interface ShowToastOpts {
  readonly action?: ToastAction;
  readonly persistent?: boolean;
}

/** Long enough to read a short sentence, short enough not to pile up. */
const TOAST_MS = 2800;
/** A failure says what happened and how to fix it, which takes longer to read. */
const ERROR_TOAST_MS = 7000;

let toasts = $state<Toast[]>([]);
let nextId = 0;

export const notifications = {
  get items(): readonly Toast[] {
    return toasts;
  },
  show(message: string, kind: ToastKind = 'info', opts: ShowToastOpts = {}): void {
    nextId += 1;
    const toast: Toast = {
      id: nextId,
      message,
      kind,
      ...(opts.action ? { action: opts.action } : {}),
    };
    toasts = [...toasts, toast];
    if (!opts.persistent) {
      setTimeout(
        () => {
          toasts = toasts.filter((item) => item.id !== toast.id);
        },
        kind === 'error' ? ERROR_TOAST_MS : TOAST_MS,
      );
    }
  },
  dismiss(id: number): void {
    toasts = toasts.filter((item) => item.id !== id);
  },
};
