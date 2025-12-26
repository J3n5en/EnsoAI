import { normalizeLocale, type Locale } from '@shared/i18n';

let currentLocale: Locale = 'en';

export function setCurrentLocale(locale: string | Locale) {
  currentLocale = normalizeLocale(locale);
}

export function getCurrentLocale(): Locale {
  return currentLocale;
}
