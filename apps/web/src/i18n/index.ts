import { useSyncExternalStore } from 'react';
import ptPT from './pt-PT.json';
import ptBR from './pt-BR.json';
import en from './en.json';
import { z } from 'zod';

export type Locale = 'pt-PT' | 'pt-BR' | 'en';
export const DEFAULT_LOCALE: Locale = 'pt-PT';
export const LOCALE_STORAGE_KEY = 'ponte.locale.v1';
const catalogs: Record<Locale, Record<string, string>> = {
  'pt-PT': ptPT,
  'pt-BR': ptBR,
  en,
};
const listeners = new Set<() => void>();
const sourceByTranslation = new Map<string, string>();
for (const catalog of Object.values(catalogs)) {
  for (const [source, translation] of Object.entries(catalog)) {
    if (!sourceByTranslation.has(translation))
      sourceByTranslation.set(translation, source);
  }
}
const templateMessages = Object.keys(ptPT).filter(
  (source) =>
    /\{\d+\}/.test(source) && source.replace(/\{\d+\}/g, '').length >= 16,
);
const messagePatterns = templateMessages.flatMap((source) =>
  [
    ...new Set([
      source,
      ...Object.values(catalogs).map((catalog) => catalog[source] ?? source),
    ]),
  ].map((template) => {
    const indices: number[] = [];
    const expression = template
      .split(/(\{\d+\})/g)
      .map((part) => {
        if (/^\{\d+\}$/.test(part)) {
          indices.push(Number(part.slice(1, -1)));
          return '([\\s\\S]*?)';
        }
        return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      })
      .join('');
    return { source, indices, pattern: new RegExp(`^${expression}$`, 'u') };
  }),
);

function isLocale(value: unknown): value is Locale {
  return value === 'pt-PT' || value === 'pt-BR' || value === 'en';
}

function readPreference(): Locale {
  try {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
    return isLocale(saved) ? saved : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

let locale = readPreference();
async function rememberWorkerLocale(next: Locale) {
  try {
    if (typeof caches === 'undefined') return;
    const cache = await caches.open('ponte-preferences-v1');
    if (next === locale)
      await cache.put('/__ponte_locale__', new Response(next));
  } catch {
    /* The page preference still works when CacheStorage is blocked. */
  }
}
export function getLocale(): Locale {
  return locale;
}

function applyLocale(next: Locale) {
  if (typeof document !== 'undefined') document.documentElement.lang = next;
  if (typeof document !== 'undefined')
    document.title = catalogs[next]['Gestão da Igreja'] ?? 'Gestão da Igreja';
  z.config(next === 'en' ? z.locales.en() : z.locales.pt());
  void rememberWorkerLocale(next);
  if (locale === next) return;
  locale = next;
  listeners.forEach((listener) => listener());
}

/** Applies immediately, including when browser storage is unavailable. */
export function setLocale(next: Locale) {
  if (!isLocale(next)) return;
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, next);
  } catch {
    /* Private browsing. */
  }
  applyLocale(next);
}

if (typeof window !== 'undefined') {
  document.documentElement.lang = locale;
  document.title = catalogs[locale]['Gestão da Igreja'] ?? 'Gestão da Igreja';
  z.config(locale === 'en' ? z.locales.en() : z.locales.pt());
  void rememberWorkerLocale(locale);
  window.addEventListener('storage', (event) => {
    if (event.key === LOCALE_STORAGE_KEY || event.key === null)
      applyLocale(readPreference());
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Also used by components whose labels come from shared configuration. */
export function useLocale() {
  return useSyncExternalStore(subscribe, getLocale, () => DEFAULT_LOCALE);
}

/** Source messages are stable keys. Values are interpolated without translating user content. */
export function t(message: string, values: readonly unknown[] = []): string {
  if (!message) return message;
  const source = Object.hasOwn(catalogs[DEFAULT_LOCALE], message)
    ? message
    : (sourceByTranslation.get(message) ?? message);
  if (
    source === message &&
    !Object.hasOwn(catalogs[DEFAULT_LOCALE], message) &&
    values.length === 0
  ) {
    for (const { source: template, indices, pattern } of messagePatterns) {
      const match = pattern.exec(message);
      if (!match) continue;
      const parameters: string[] = [];
      indices.forEach((index, capture) => {
        parameters[index] = match[capture + 1] ?? '';
      });
      return t(template, parameters);
    }
  }
  const translated =
    catalogs[locale][source] ?? catalogs[DEFAULT_LOCALE][source] ?? message;
  return translated.replace(/\{(\d+)\}/g, (placeholder, index: string) =>
    Number(index) < values.length
      ? String(values[Number(index)] ?? '')
      : placeholder,
  );
}

/** Lazily reads labels in static arrays without freezing the initial language. */
export function localized<T extends readonly string[]>(values: T): T {
  return new Proxy(values, {
    get(target, key, receiver) {
      const value: unknown = Reflect.get(target, key, receiver);
      return typeof key === 'string' &&
        /^\d+$/.test(key) &&
        typeof value === 'string'
        ? t(value)
        : value;
    },
  });
}
