/// <reference types="vite/client" />
import { BASE_LOCALE, isLocale, SUPPORTED_LOCALES, type Locale, type Localized } from "../Locale";

/**
 * 한 페이지는 자기 언어 하나만 받는다(2026-11-01 사용자: "언어는 1개만 받아서 로딩하고, 언어를 바꿀때 새로고침").
 *
 * 페이지의 언어는 `<html lang>` 이다. 부팅 인라인 스크립트가 어떤 모듈보다 먼저 정한다(`test/locale-boot-scripts.test.ts`).
 * 문구 표와 언어별 콘텐츠는 언어마다 따로 쪼갠 모듈이고, 그 페이지 언어의 것만 받는다. 받는 모듈이 top-level await 로 기다리므로
 * 읽는 쪽(`t()` 등)은 동기로 남는다. 언어를 바꾸면 페이지를 다시 연다(`creator/siteChrome` 의 언어 고르기).
 * Node 도구와 테스트는 한 번에 여러 언어를 읽으므로 모든 언어를 받는다.
 */
function loadsEveryLocale(): boolean {
  return typeof document === "undefined" || import.meta.env?.MODE === "test";
}

/** 이 페이지의 언어(`<html lang>`). 알 수 없으면 기준 언어. */
export function pageLocale(): Locale {
  const lang: unknown = typeof document === "undefined" ? undefined : document.documentElement.lang;
  return isLocale(lang) ? lang : BASE_LOCALE;
}

export type LocaleLoaders<T> = Readonly<Record<Locale, () => Promise<T>>>;
export type LoadedLocales<T> = Readonly<Partial<Record<Locale, T>>>;

/** 페이지 언어의 모듈만(Node·테스트는 모든 언어의 모듈을) 받는다. */
export async function loadLocales<T>(loaders: LocaleLoaders<T>): Promise<LoadedLocales<T>> {
  const wanted: readonly Locale[] = loadsEveryLocale() ? SUPPORTED_LOCALES : [pageLocale()];
  const entries = await Promise.all(wanted.map(async (locale) => [locale, await loaders[locale]()] as const));
  return Object.freeze(Object.fromEntries(entries) as Partial<Record<Locale, T>>);
}

/** 그 언어의 모듈. 받지 않은 언어면 페이지 언어의 것(한 페이지는 자기 언어만 가진다). */
export function loadedFor<T>(loaded: LoadedLocales<T>, locale: Locale): T {
  const module = loaded[locale] ?? loaded[pageLocale()] ?? loaded[BASE_LOCALE] ?? Object.values(loaded)[0];
  if (module === undefined) throw new Error("i18n: no language loaded");
  return module;
}

/** 받은 언어들을 `Localized<T>` 로 — 읽는 쪽은 그대로 `pickLocalized` 를 쓴다. 영어를 받지 않은 페이지에서 `en` 은 페이지 언어의 값이다. */
export function localizedFrom<T>(loaded: LoadedLocales<T>): Localized<T> {
  return Object.freeze({ ...loaded, en: loaded.en ?? loadedFor(loaded, pageLocale()) });
}
