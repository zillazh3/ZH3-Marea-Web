import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  PREFERENCES_KEY,
  savePreferences,
} from './preferences';

const storageWith = (value: string | null): Pick<Storage, 'getItem'> => ({
  getItem: (key) => (key === PREFERENCES_KEY ? value : null),
});

describe('loadPreferences', () => {
  it('returns defaults when nothing is stored', () => {
    expect(loadPreferences(storageWith(null))).toEqual(DEFAULT_PREFERENCES);
  });

  it('reads valid values', () => {
    const stored = JSON.stringify({ theme: 'light', railCollapsed: true, locale: 'en' });
    expect(loadPreferences(storageWith(stored))).toEqual({
      theme: 'light',
      railCollapsed: true,
      locale: 'en',
    });
  });

  it('falls back per field when a value is invalid', () => {
    const stored = JSON.stringify({ theme: 'neon', railCollapsed: 'yes', locale: 'en' });
    expect(loadPreferences(storageWith(stored))).toEqual({ ...DEFAULT_PREFERENCES, locale: 'en' });
  });

  it('survives corrupt JSON and a throwing storage', () => {
    expect(loadPreferences(storageWith('{nope'))).toEqual(DEFAULT_PREFERENCES);
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadPreferences(throwing)).toEqual(DEFAULT_PREFERENCES);
  });
});

describe('savePreferences', () => {
  it('writes JSON under the preferences key', () => {
    const written = new Map<string, string>();
    const saved = savePreferences(
      { setItem: (key, value) => written.set(key, value) },
      { theme: 'dark', railCollapsed: false, locale: 'auto' },
    );
    expect(saved).toBe(true);
    expect(JSON.parse(written.get(PREFERENCES_KEY) ?? '')).toEqual({
      theme: 'dark',
      railCollapsed: false,
      locale: 'auto',
    });
  });

  it('reports failure instead of throwing', () => {
    const saved = savePreferences(
      {
        setItem: () => {
          throw new Error('quota');
        },
      },
      DEFAULT_PREFERENCES,
    );
    expect(saved).toBe(false);
  });
});
