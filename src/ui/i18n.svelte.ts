import {
  messagesFor,
  resolveLocale,
  type Locale,
  type LocalePreference,
} from '@/features/i18n/locale';
import type { Messages } from '@/features/i18n/messages';

let preference = $state<LocalePreference>('auto');
const locale = $derived(resolveLocale(preference, navigator.languages));

export const i18n = {
  get locale(): Locale {
    return locale;
  },
  get m(): Messages {
    return messagesFor(locale);
  },
  get preference(): LocalePreference {
    return preference;
  },
  setPreference(next: LocalePreference): void {
    preference = next;
  },
};
