// `.ts`: Node tools import this file without a resolver (as `app/i18n/companion.ts` does).
import { pseudoDeep, pseudoLocaleOn } from "./i18n/pseudo.ts";

/** 지원 언어. 이 순서로 언어 고르기에 선다(KR · EN · JP). */
export const SUPPORTED_LOCALES = Object.freeze(["ko", "en", "ja"] as const);
export type Locale = (typeof SUPPORTED_LOCALES)[number];


export const DEFAULT_LOCALE: Locale = "ko";

/**
 * 문자열 표의 기준 언어. 키와 자리표시자의 타입은 이 언어의 표에서 나오고, 번역이 빠진 문구는 이 언어로 보인다
 * (2026-11-01 사용자 결정 — 언어 추가 대비).
 */
export const BASE_LOCALE: Locale = "en";

/** `Intl` 숫자·날짜 형식이 쓰는 언어 태그. */
export const INTL_LOCALE: Readonly<Record<Locale, string>> = Object.freeze({ ko: "ko-KR", en: "en-US", ja: "ja-JP" });

/** 언어 고르기에 보이는 짧은 표시(나라 약자) — 화면 언어와 상관없이 같다(2026-11-01 사용자: "한국어" → "KR", JP 추가). */
export const LOCALE_LABEL: Readonly<Record<Locale, string>> = Object.freeze({ ko: "KR", en: "EN", ja: "JP" });

export function isLocale(value: unknown): value is Locale {
  return (SUPPORTED_LOCALES as readonly unknown[]).includes(value);
}

export function parseLocale(value: unknown): Locale {
  return value === "en" ? "en" : DEFAULT_LOCALE;
}

/** 한국어가 아니면 영어 — 셋째 언어가 들어와도 한국어가 새지 않는다. */
export function localeText(locale: Locale, ko: string, en: string): string {
  return locale === "ko" ? ko : en;
}

export interface LocalizedText {
  readonly ko: string;
  readonly en: string;
}

export function fromLocalized(locale: Locale, value: LocalizedText): string {
  return pickLocalized(locale, value);
}

/**
 * 한국어와 영어 두 벌만 있는 것(본편 원화·로고·옛 화면 문구·서버 계약)이 쓰는 언어: 한국어가 아니면 영어.
 * 일본어(2026-11-01)는 ODDBOUT 화면만 번역했다. 본편의 두 벌짜리는 일본어에서 영어로 보인다.
 */
export type BilingualLocale = "ko" | "en";
export function koOrEn(locale: Locale): BilingualLocale {
  return locale === "ko" ? "ko" : "en";
}

/** 콘텐츠 데이터의 언어별 값(선수 이름 등): 기준 언어(en)는 필수, 다른 언어는 선택이다. 읽기는 `pickLocalized`. */
export type Localized<T> = { readonly en: T } & { readonly [L in Exclude<Locale, "en">]?: T };

/** 언어마다 값을 바꾼다(가진 언어만). */
export function mapLocalized<T, U>(value: Localized<T>, change: (each: T) => U): Localized<U> {
  const out: Partial<Record<Locale, U>> = {};
  for (const locale of SUPPORTED_LOCALES) { const each = value[locale]; if (each !== undefined) out[locale] = change(each); }
  return { ...out, en: change(value.en) };
}

/** 그 언어의 값, 없으면 기준 언어(en)의 값. */
export function pickLocalized<T>(locale: Locale, value: Localized<T>): T {
  const picked = value[locale] ?? value.en;
  return pseudoLocaleOn() ? pseudoDeep(picked) : picked;
}

/** 현재 QA 옵션을 보존한 채 언어만 바꾸는 타이틀용 URL 계약. */
export function localeSwitchUrl(href: string, locale: Locale): string {
  const url = new URL(href);
  url.searchParams.set("lang", locale);
  return url.toString();
}
