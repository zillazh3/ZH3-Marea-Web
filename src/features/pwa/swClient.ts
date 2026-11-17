export interface SwHooks {
  readonly onUpdateReady: (applyUpdate: () => void) => void;
  readonly onReload?: () => void;
}

export interface SwWorkerLike {
  state: string;
  postMessage(message: unknown): void;
  addEventListener(type: 'statechange', listener: () => void): void;
}

export interface SwRegistrationLike {
  readonly waiting: SwWorkerLike | null;
  readonly installing: SwWorkerLike | null;
  addEventListener(type: 'updatefound', listener: () => void): void;
}

export interface SwContainerLike {
  readonly controller: unknown;
  register(url: string, options?: RegistrationOptions): Promise<SwRegistrationLike>;
  addEventListener(type: 'controllerchange', listener: () => void): void;
}

export async function registerServiceWorker(
  container: SwContainerLike,
  hooks: SwHooks,
  swUrl = '/app/sw.js',
): Promise<SwRegistrationLike | null> {
  let reloading = false;
  let updateAccepted = false;

  container.addEventListener('controllerchange', () => {
    if (!updateAccepted || reloading) return;
    reloading = true;
    if (hooks.onReload) hooks.onReload();
    else if (typeof location !== 'undefined') location.reload();
  });

  const reg = await container.register(swUrl, { scope: '/app/', updateViaCache: 'none' });
  let notified = false;
  const notify = (worker: SwWorkerLike | null): void => {
    if (!worker || notified) return;
    notified = true;
    hooks.onUpdateReady(() => {
      updateAccepted = true;
      worker.postMessage({ type: 'SKIP_WAITING' });
    });
  };

  if (reg.waiting) notify(reg.waiting);

  reg.addEventListener('updatefound', () => {
    const worker = reg.installing;
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed' && container.controller) {
        notify(worker);
      }
    });
  });

  return reg;
}
