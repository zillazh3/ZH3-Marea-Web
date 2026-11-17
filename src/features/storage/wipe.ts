import { deleteDB } from 'idb';
import { closeAppDb, DB_NAME } from './db';
import { clearAll as clearOpfs, opfsAvailable } from './opfs';

export type WipeStepName =
  'serviceWorker' | 'caches' | 'database' | 'files' | 'localStorage' | 'sessionStorage';

export interface WipeStep {
  readonly name: WipeStepName;
  readonly run: () => void | Promise<void>;
}

/** Some steps failed; the rest still ran. */
export class WipeError extends Error {
  constructor(
    readonly failed: readonly WipeStepName[],
    options?: ErrorOptions,
  ) {
    super(`Could not clear: ${failed.join(', ')}`, options);
    this.name = 'WipeError';
  }
}

/** Runs every step even when one fails, so a single blocked store never leaves the others untouched. */
export async function runWipe(steps: readonly WipeStep[]): Promise<void> {
  const failed: WipeStepName[] = [];
  const causes: unknown[] = [];
  for (const step of steps) {
    try {
      await step.run();
    } catch (error) {
      failed.push(step.name);
      causes.push(error);
    }
  }
  if (failed.length > 0) throw new WipeError(failed, { cause: causes });
}

async function unregisterServiceWorkers(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
}

async function clearCaches(): Promise<void> {
  if (!('caches' in globalThis)) return;
  await Promise.all((await caches.keys()).map((key) => caches.delete(key)));
}

/** The service worker goes first so it cannot refill the caches that are cleared next. */
export function browserWipeSteps(): WipeStep[] {
  return [
    { name: 'serviceWorker', run: unregisterServiceWorkers },
    { name: 'caches', run: clearCaches },
    {
      name: 'database',
      run: async () => {
        await closeAppDb();
        await deleteDB(DB_NAME);
      },
    },
    {
      name: 'files',
      run: async () => {
        if (opfsAvailable()) await clearOpfs();
      },
    },
    {
      name: 'localStorage',
      run: () => {
        localStorage.clear();
      },
    },
    {
      name: 'sessionStorage',
      run: () => {
        sessionStorage.clear();
      },
    },
  ];
}

/** Deletes everything this site stores in the browser. Throws `WipeError` if any part could not be cleared. */
export function wipeAllData(): Promise<void> {
  return runWipe(browserWipeSteps());
}
