import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  savePreferences,
  type Preferences,
} from '@/features/preferences/preferences';

/** Reading `localStorage` itself can throw when site data is blocked; the app then runs on defaults. */
function browserStorage(): Storage | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

const storage = browserStorage();
let current = $state<Preferences>(storage ? loadPreferences(storage) : DEFAULT_PREFERENCES);

export const preferences = {
  get value(): Preferences {
    return current;
  },
  update(patch: Partial<Preferences>): void {
    current = { ...current, ...patch };
    if (storage) savePreferences(storage, current);
  },
};
