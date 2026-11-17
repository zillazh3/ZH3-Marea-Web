export type LandingLocale = 'es-MX' | 'en';

/** A manual language choice (footer link) made on the landing; it wins over the browser language. */
export const LANDING_LOCALE_KEY = 'zh3marea.landingLocale';

const isLocale = (value: string | null): value is LandingLocale =>
  value === 'es-MX' || value === 'en';

/** A stored choice wins; otherwise the first Spanish or English browser language, Spanish when none. */
export function pickLandingLocale(
  stored: string | null,
  languages: readonly string[],
): LandingLocale {
  if (isLocale(stored)) return stored;
  for (const tag of languages) {
    const primary = tag.toLowerCase().split('-')[0];
    if (primary === 'es') return 'es-MX';
    if (primary === 'en') return 'en';
  }
  return 'es-MX';
}

/** Reading `localStorage` can throw when site data is blocked; the browser language then decides. */
export function storedLandingLocale(): string | null {
  try {
    return localStorage.getItem(LANDING_LOCALE_KEY);
  } catch {
    return null;
  }
}

/** The language this page was rendered in. */
export function pageLocale(): LandingLocale {
  return document.documentElement.lang === 'en' ? 'en' : 'es-MX';
}
