import type { Locale } from "./Locale";
let current: Locale = "ko";
export const coopLocale = (): Locale => current;
export const setCoopLocale = (locale: Locale): void => { current = locale; };
export const coopSay = (ko: string, en: string): string => current === "en" ? en : ko;
/** Call sites retain one vocabulary owner while a boot-selected locale controls rendering. */
export function coopLocalized<T extends object>(ko: T, en: { [K in keyof T]: unknown }): T {
  return new Proxy({ ...ko }, { get: (target, key) => current === "en" && key in en ? Reflect.get(en, key) : Reflect.get(target, key) });
}
