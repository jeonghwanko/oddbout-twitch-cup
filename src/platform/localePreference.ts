import { BASE_LOCALE, isLocale, SUPPORTED_LOCALES, type Locale } from "../app/Locale";
import { setPseudoLocale } from "../app/i18n/pseudo";
import { STORAGE_KEYS } from "./storageKeys";


export interface LocaleSources {
  readonly search: string;
  readonly saved: string | null;
  readonly languages: readonly string[];
}

export function resolveLocale({ search, saved, languages }: LocaleSources): Locale {
  const requested = new URLSearchParams(search).get("lang");
  if (requested === "qps") return BASE_LOCALE; // the development build's pseudo language reads English (`app/i18n/pseudo`)
  if (isLocale(requested)) return requested;
  if (isLocale(saved)) return saved;
  return browserLocale(languages) ?? BASE_LOCALE;
}

/** `ko-KR` → ko, `en-GB` → en, 지원하지 않는 언어만 있으면 없음. */
export function browserLocale(languages: readonly string[]): Locale | undefined {
  for (const tag of languages) {
    const primary = tag.split("-")[0]?.toLowerCase();
    const match = SUPPORTED_LOCALES.find((locale) => locale === primary);
    if (match) return match;
  }
  return undefined;
}

export function readLocalePreference(search = location.search): Locale {
  // The development build's pseudo language (`?lang=qps`, `app/i18n/pseudo`): English, accented and stretched.
  const pseudo = import.meta.env?.DEV === true && new URLSearchParams(search).get("lang") === "qps";
  setPseudoLocale(pseudo);
  if (pseudo) return BASE_LOCALE;
  let saved: string | null = null;
  try { saved = localStorage.getItem(STORAGE_KEYS.oddboutLocale); } catch { /* URL and the browser's language still decide. */ }
  return resolveLocale({ search, saved, languages: typeof navigator === "undefined" ? [] : browserLanguages(navigator) });
}

/** The reader picked a language (the site header's toggle): every ODDBOUT page starts from it next time. A real pick ends the pseudo language. */
export function saveLocalePreference(locale: Locale): void {
  setPseudoLocale(false);
  try { localStorage.setItem(STORAGE_KEYS.oddboutLocale, locale); } catch { /* Keep the choice in the current URL. */ }
}

/** The browser's language list: `navigator.languages`, or `navigator.language` when the list is missing or empty (some WebViews). */
export function browserLanguages(nav: Pick<Navigator, "language"> & { readonly languages?: readonly string[] }): readonly string[] {
  return nav.languages?.length ? nav.languages : nav.language ? [nav.language] : [];
}
