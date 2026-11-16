import { en } from './en';
import { esMX } from './es-MX';
import type { Messages } from './messages';

export const LOCALES = ['es-MX', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
export type LocalePreference = 'auto' | Locale;

export const DEFAULT_LOCALE: Locale = 'es-MX';

const DICTIONARIES: Record<Locale, Messages> = { 'es-MX': esMX, en };

/** First browser language we support wins; any Spanish variant maps to es-MX. */
export function detectLocale(languages: readonly string[]): Locale {
  for (const tag of languages) {
    const primary = tag.toLowerCase().split('-')[0];
    if (primary === 'es') return 'es-MX';
    if (primary === 'en') return 'en';
  }
  return DEFAULT_LOCALE;
}

export function resolveLocale(preference: LocalePreference, languages: readonly string[]): Locale {
  return preference === 'auto' ? detectLocale(languages) : preference;
}

export function messagesFor(locale: Locale): Messages {
  return DICTIONARIES[locale];
}
