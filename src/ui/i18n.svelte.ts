import {
  messagesFor,
  resolveLocale,
  type Locale,
  type LocalePreference,
} from '@/features/i18n/locale';
import type { Messages } from '@/features/i18n/messages';
import { preferences } from './state/preferences.svelte';

const locale = $derived(resolveLocale(preferences.value.locale, navigator.languages));

export const i18n = {
  get locale(): Locale {
    return locale;
  },
  get m(): Messages {
    return messagesFor(locale);
  },
  get preference(): LocalePreference {
    return preferences.value.locale;
  },
  setPreference(next: LocalePreference): void {
    preferences.update({ locale: next });
  },
};
