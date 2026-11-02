import type Phaser from "phaser";

/** 프레임마다 맞추는 글자 스타일. 빠진 항목은 건드리지 않는다. */
export interface TextStyleTarget {
  readonly color?: string;
  readonly fontStyle?: string;
  readonly align?: string;
  readonly padding?: readonly [left: number, top: number, right: number, bottom: number];
}

/**
 * Phaser `Text` 의 스타일 설정자(`setColor`·`setFontStyle`·`setAlign`·`setPadding`)는 값이 같아도 글자 캔버스를 다시 그리고
 * 텍스처를 GPU 에 다시 올린다(`TextStyle.update` → `updateText`). `setText` 만 같은 문자열을 건너뛴다.
 * 매 프레임 스타일을 맞추는 곳은 이 함수로 바뀐 값만 넘긴다.
 */
export function syncTextStyle<T extends Phaser.GameObjects.Text>(text: T, target: TextStyleTarget): T {
  const style = text.style;
  if (target.color !== undefined && style.color !== target.color) text.setColor(target.color);
  if (target.fontStyle !== undefined && style.fontStyle !== target.fontStyle) text.setFontStyle(target.fontStyle);
  if (target.align !== undefined && style.align !== target.align) text.setAlign(target.align);
  if (target.padding !== undefined) {
    const [left, top, right, bottom] = target.padding, padding = text.padding;
    if (padding.left !== left || padding.top !== top || padding.right !== right || padding.bottom !== bottom) {
      text.setPadding(left, top, right, bottom);
    }
  }
  return text;
}
