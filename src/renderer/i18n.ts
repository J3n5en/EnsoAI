import { getTranslation, type Locale, normalizeLocale, translate } from '@shared/i18n';
import * as React from 'react';
import { useSettingsStore } from '@/stores/settings';

export type TFunction = (key: string, params?: Record<string, string | number>) => string;
type RichParams = Record<string, React.ReactNode>;

function translateNodes(locale: Locale, key: string, params?: RichParams) {
  const template = getTranslation(locale, key);
  if (!params) return template;

  const parts: React.ReactNode[] = [];
  const regex = /\{\{(\w+)\}\}/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null = regex.exec(template);

  while (match) {
    const [placeholder, token] = match;
    const index = match.index;
    if (index > lastIndex) {
      parts.push(template.slice(lastIndex, index));
    }
    parts.push(params[token] ?? placeholder);
    lastIndex = index + placeholder.length;
    match = regex.exec(template);
  }

  if (lastIndex < template.length) {
    parts.push(template.slice(lastIndex));
  }

  return parts.length > 0 ? parts : template;
}

export function useI18n() {
  const language = useSettingsStore((state) => state.language);
  const locale = normalizeLocale(language);

  const t = React.useCallback(
    (key: string, params?: Record<string, string | number>) => translate(locale, key, params),
    [locale]
  );

  const tNode = React.useCallback(
    (key: string, params?: RichParams) => translateNodes(locale, key, params),
    [locale]
  );

  return { t, tNode, locale };
}
