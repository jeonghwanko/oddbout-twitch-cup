import type { Locale } from "../Locale";
import { translate, type ParamArgs, type Translation } from "./catalog";
import { loadedFor, loadLocales, pageLocale } from "./localeLoader";
import type GAME_EN from "./bundles/game/en";

export { placeholderNames, interpolate } from "./defineStrings";

/** 게임 화면 문구 표의 모양(영어 표의 리터럴 타입 — 키와 자리표시자의 원천). */
type StringTable = typeof GAME_EN;
export type StringKey = keyof StringTable;

/** 이 페이지 언어의 게임 문구 표(Node·테스트는 모든 언어). 받는 동안 이 모듈을 import 하는 모듈이 기다린다. */
const TABLES = await loadLocales<Translation<StringTable>>({
  en: () => import("./bundles/game/en").then((module) => module.default),
  ko: () => import("./bundles/game/ko").then((module) => module.default),
  ja: () => import("./bundles/game/ja").then((module) => module.default),
});

/**
 * 문자열 표에서 그 언어의 문장을 꺼낸다. 한 페이지는 자기 언어의 표만 받는다(언어를 바꾸면 페이지를 다시 연다).
 *
 *   t(locale, "common.continue")
 *   t(locale, "hud.guardsLeft", { count: 3 })
 *
 * 키 오타와 빠진 자리표시자 값은 컴파일 오류다.
 */
export function t<K extends StringKey>(locale: Locale, key: K, ...params: ParamArgs<StringTable, K>): string {
  return translate(loadedFor(TABLES, locale), key, params[0]);
}

/** 키가 표에 있는지. id 로 키를 조립할 때(`tool.${id}.name`) 런타임 폴백 판단에 쓴다. */
export function hasString(key: string): key is StringKey {
  return Object.hasOwn(loadedFor(TABLES, pageLocale()), key);
}

/** 조립한 키의 문장 그대로(자리표시자를 채우지 않는다). 키가 없으면 키를 보인다. */
export function stringOf(locale: Locale, key: string): string {
  return hasString(key) ? translate(loadedFor(TABLES, locale), key) : key;
}
