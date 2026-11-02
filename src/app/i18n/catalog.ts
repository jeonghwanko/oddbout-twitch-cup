import type { Locale } from "../Locale";
import { interpolate } from "./defineStrings";
import { pseudoLocaleOn, pseudoText } from "./pseudo";
import type { Placeholders, TextParams } from "./defineStrings";

/**
 * 언어별 문자열 표의 형식(2026-11-01 사용자 결정 — 다국어 정리 + 언어 추가 대비).
 *
 * 이름공간마다 `namespaces/<ns>/en.ts`(기준 언어)와 `ko.ts`(출시 언어)를 둔다.
 * - 기준 언어 표(`defineBase`)의 리터럴 타입이 키와 `{name}` 자리표시자 타입의 원천이다.
 * - 출시 언어 표(`defineTranslation`)는 기준 표의 키를 모두 채운다. 빠지거나 남는 키는 컴파일 오류다.
 * - 새 언어는 `definePartialTranslation` 으로 시작한다. 빠진 문구는 기준 언어로 보인다.
 * 자리표시자가 언어마다 같은지와 기준 언어에 한글이 없는지는 test/i18n-strings.test.ts 가 막는다.
 */
export function defineBase<const T extends Readonly<Record<string, string>>>(table: T): T {
  return Object.freeze(table);
}

export type Translation<Base> = { readonly [K in keyof Base]: string };
export type PartialTranslation<Base> = { readonly [K in keyof Base]?: string };

export function defineTranslation<Base>(table: Translation<Base>): Translation<Base> {
  return Object.freeze(table);
}

export function definePartialTranslation<Base>(table: PartialTranslation<Base>): PartialTranslation<Base> {
  return Object.freeze(table);
}

/** 아직 번역하지 않은 언어의 표: 모든 문구가 기준 언어(en)로 보인다. 본편 전용 이름공간의 일본어가 이렇다(2026-11-01). */
export const UNTRANSLATED: Readonly<Record<string, never>> = Object.freeze({});

/** 한 이름공간의 언어별 표. 기준 언어는 전부, 다른 언어는 전부 또는 일부. */
export type NamespaceTables<Base> = { readonly en: Base } & {
  readonly [L in Exclude<Locale, "en">]: Translation<Base> | PartialTranslation<Base>;
};

/** 키의 기준 언어 문장에 자리표시자가 없으면 인자를 받지 않고, 있으면 모든 이름을 요구한다. */
export type ParamArgs<Base, K extends keyof Base> = [Placeholders<Base[K] & string>] extends [never]
  ? []
  : [params: Readonly<Record<Placeholders<Base[K] & string>, string | number>>];

/** 한 언어의 합친 표(번역기가 그 언어의 모듈로 받는다, `localeLoader`). */
export type StringTableOf = Readonly<Record<string, string | undefined>>;

/** 표의 문장에 자리표시자를 채운다. 표에 없는 키는 키 그대로 보여 바로 드러난다. */
export function translate(table: StringTableOf, key: string, params?: TextParams): string {
  const text = table[key] ?? key;
  return interpolate(pseudoLocaleOn() ? pseudoText(text) : text, params);
}
