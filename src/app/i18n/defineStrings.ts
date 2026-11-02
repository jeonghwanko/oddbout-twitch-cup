import type { LocalizedText } from "../Locale";

/**
 * 한 도메인의 문자열 표를 선언한다.
 *
 * `const` 타입 매개변수가 ko/en 리터럴 타입을 보존하므로 `t()` 가 키마다 `{name}` 자리표시자를
 * 타입으로 요구할 수 있다. 키는 `도메인.이름` 꼴로, 도메인 접두사는 파일이 소유한다
 * (test/i18n-strings.test.ts 가 접두사·빈 값·영어의 한글·자리표시자 불일치를 막는다).
 */
export function defineStrings<const T extends Readonly<Record<string, LocalizedText>>>(table: T): T {
  return Object.freeze(table);
}

/** `"{name}님 {count}개"` → `"name" | "count"` */
export type Placeholders<S extends string> =
  S extends `${string}{${infer Name}}${infer Rest}` ? Name | Placeholders<Rest> : never;

export type TextParams = Readonly<Record<string, string | number>>;

const PLACEHOLDER = /\{([A-Za-z][A-Za-z0-9_]*)\}/gu;

/** 문자열에 든 자리표시자 이름 목록(중복 제거, 정렬). 가드 테스트와 런타임 보간이 같은 규칙을 쓴다. */
export function placeholderNames(text: string): readonly string[] {
  return [...new Set([...text.matchAll(PLACEHOLDER)].map((match) => match[1] ?? ""))].sort();
}

/** `{name}` 을 값으로 바꾼다. 없는 값은 자리표시자를 그대로 남겨 화면에서 바로 드러나게 한다. */
export function interpolate(text: string, params: TextParams | undefined): string {
  if (params === undefined) return text;
  return text.replace(PLACEHOLDER, (whole, name: string) => {
    const value = params[name];
    return value === undefined || value === null ? whole : String(value);
  });
}
