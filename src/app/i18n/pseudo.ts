/**
 * 의사 언어(개발 빌드의 `?lang=qps`, 2026-11-01). 표(`translate`)와 `pickLocalized` 로 읽은 영어를 악센트를 붙이고 약 30% 늘려 보인다.
 * - 표를 거치지 않은 하드코딩 문구는 그대로라 화면에서 바로 눈에 띈다.
 * - 영어보다 긴 언어에서 생길 넘침·잘림이 미리 드러난다.
 * 화면 언어는 영어(en)로 돈다. 켜는 곳은 `platform/localePreference` 하나다(ODDBOUT 페이지).
 */
let enabled = false;

export function setPseudoLocale(on: boolean): void { enabled = on; }
export function pseudoLocaleOn(): boolean { return enabled; }

const ACCENTED: Readonly<Record<string, string>> = Object.freeze({
  a: "á", b: "ƀ", c: "ç", d: "ð", e: "é", f: "ƒ", g: "ĝ", h: "ĥ", i: "î", j: "ĵ", k: "ķ", l: "ļ", m: "ɱ",
  n: "ñ", o: "ö", p: "þ", q: "ǫ", r: "ŕ", s: "š", t: "ţ", u: "û", v: "ṽ", w: "ŵ", x: "ẋ", y: "ý", z: "ž",
  A: "Á", B: "Ɓ", C: "Ç", D: "Ð", E: "É", F: "Ƒ", G: "Ĝ", H: "Ĥ", I: "Î", J: "Ĵ", K: "Ķ", L: "Ļ", M: "Ṁ",
  N: "Ñ", O: "Ö", P: "Þ", Q: "Ǫ", R: "Ŕ", S: "Š", T: "Ţ", U: "Û", V: "Ṽ", W: "Ŵ", X: "Ẋ", Y: "Ý", Z: "Ž",
});
/** `{name}` 자리표시자, 마크업 태그, HTML 엔터티는 그대로 둔다. */
const KEEP_OR_LETTER = /(\{[A-Za-z][A-Za-z0-9_]*\}|<[^>]*>|&[#A-Za-z0-9]+;)|([A-Za-z])/g;

export function pseudoText(text: string): string {
  if (text === "") return text;
  const body = text.replace(KEEP_OR_LETTER, (_whole, keep: string | undefined, letter: string | undefined) => keep ?? ACCENTED[letter ?? ""] ?? letter ?? "");
  return `[${body}${"·".repeat(Math.ceil(text.length * 0.3))}]`;
}

/** 문자열은 의사 언어로, 배열·평범한 객체는 안의 문자열까지. 함수와 그 밖의 값은 그대로. */
export function pseudoDeep<T>(value: T): T {
  if (typeof value === "string") return pseudoText(value) as T;
  if (Array.isArray(value)) return value.map(item => pseudoDeep(item)) as T;
  if (value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, pseudoDeep(item)])) as T;
  }
  return value;
}
