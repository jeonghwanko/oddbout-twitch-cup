/**
 * DOM 창의 글자 배율(설정의 텍스트 100/125/150%). Phaser 글자는 접근성 런타임이 하나씩 키우고, DOM 창은 문서 루트의
 * CSS 변수 하나를 읽는다 — 값을 쓰는 곳은 접근성 런타임(`applyPlayerSettings`) 하나다.
 */
export const DOM_TEXT_SCALE_VAR = "--game-text-scale";

export function setDomTextScale(scale: number): void {
  globalThis.document?.documentElement?.style.setProperty(DOM_TEXT_SCALE_VAR, String(scale));
}

/** DOM 창의 글자 크기는 이것으로 쓴다(`dom-text-scale.test.ts` 가 `render/dom` 을 훑어 막는다). */
export function domTextSize(size: string): string {
  return `calc(${size} * var(${DOM_TEXT_SCALE_VAR}, 1))`;
}
