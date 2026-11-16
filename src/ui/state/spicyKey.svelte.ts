import { secrets } from '@/features/storage/secrets';

// A copy of the stored key that the provider can read synchronously on every request.
let key = $state('');

export const spicyKey = {
  get value(): string {
    return key;
  },

  async load(): Promise<void> {
    try {
      key = await secrets.get('spicyKey');
    } catch {
      key = ''; // IndexedDB is blocked (private window): the key just cannot be kept between visits
    }
  },

  /** Keeps the key for this visit even when it cannot be stored, and reports whether it was. */
  async save(next: string): Promise<boolean> {
    key = next.trim();
    try {
      await secrets.set('spicyKey', key);
      return true;
    } catch {
      return false;
    }
  },
};
