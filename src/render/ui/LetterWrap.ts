/**
 * 가나가 든 글(일본어)은 띄어쓰기가 없다. Phaser 기본 줄바꿈은 띄어쓰기에서만 끊어서 그런 글이 한 줄로 넘친다.
 * 그런 글은 Phaser 의 고급 줄바꿈(`useAdvancedWrap` — 너비를 넘는 낱말을 글자 단위로 자른다)으로 그린다(2026-11-01).
 */
export function wrapsByLetter(text: string): boolean {
  return /[぀-ヿ]/u.test(text);
}
