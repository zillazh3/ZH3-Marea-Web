import { LOCALES, type LocalePreference } from '@/features/i18n/locale';

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export interface Preferences {
  theme: ThemePreference;
  /** null = follow the window width (auto-collapse); true/false = the user's explicit choice. */
  railCollapsed: boolean | null;
  locale: LocalePreference;
  wordfxExperimental: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'system',
  railCollapsed: null,
  locale: 'auto',
  wordfxExperimental: false,
};

export const PREFERENCES_KEY = 'zh3marea.preferences';

const isOneOf = <T extends string>(options: readonly T[], value: unknown): value is T =>
  typeof value === 'string' && (options as readonly string[]).includes(value);

/** Reads stored preferences; anything missing or malformed falls back to its default. */
export function loadPreferences(storage: Pick<Storage, 'getItem'>): Preferences {
  let raw: unknown;
  try {
    const text = storage.getItem(PREFERENCES_KEY);
    raw = text === null ? null : JSON.parse(text);
  } catch {
    return DEFAULT_PREFERENCES;
  }
  if (typeof raw !== 'object' || raw === null) return DEFAULT_PREFERENCES;
  const record = raw as Record<string, unknown>;
  const { theme, railCollapsed, locale, wordfxExperimental } = record;
  return {
    theme: isOneOf(THEME_PREFERENCES, theme) ? theme : DEFAULT_PREFERENCES.theme,
    railCollapsed:
      typeof railCollapsed === 'boolean' ? railCollapsed : DEFAULT_PREFERENCES.railCollapsed,
    locale: isOneOf(['auto', ...LOCALES], locale) ? locale : DEFAULT_PREFERENCES.locale,
    wordfxExperimental:
      typeof wordfxExperimental === 'boolean'
        ? wordfxExperimental
        : DEFAULT_PREFERENCES.wordfxExperimental,
  };
}

/** Returns false when the browser refuses storage (private mode, quota): the choice then lasts only for this visit. */
export function savePreferences(
  storage: Pick<Storage, 'setItem'>,
  preferences: Preferences,
): boolean {
  try {
    storage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
    return true;
  } catch {
    return false;
  }
}
