/**
 * 탭 가시성 판정의 단일 출처.
 *
 * 브라우저는 같은 "화면에서 사라짐"을 두 경로로 알려 준다 — 탭 전환·최소화는
 * `visibilitychange`, 다른 창으로 포커스가 넘어간 것은 `blur`. 둘은 겹쳐서
 * 오기도 하고(탭 전환은 blur 를 함께 낸다) 한쪽만 오기도 한다(같은 화면의
 * 다른 창으로 포커스만 옮기면 문서는 계속 보인다).
 *
 * 그래서 이벤트가 아니라 **페이즈 전이**를 판정 단위로 쓴다. 같은 페이즈로의
 * 재진입은 전이가 아니므로 입력 비우기·음소거가 두 번 걸리지 않는다.
 *
 * DOM 을 만지지 않는다. 구독은 `render/lifecycle/DocumentVisibilityBinding.ts`
 * 가 소유하고, 여기에는 테스트 가능한 결정만 남긴다.
 */
export type VisibilityPhase = "visible" | "hidden";

export interface VisibilityTransition {
  readonly from: VisibilityPhase;
  readonly to: VisibilityPhase;
}

/** 페이즈가 실제로 바뀐 경우에만 전이를 돌려준다. 바뀌지 않았으면 `null`. */
export function visibilityTransition(
  previous: VisibilityPhase,
  next: VisibilityPhase,
): VisibilityTransition | null {
  if (previous === next) return null;
  return Object.freeze({ from: previous, to: next });
}

/** `document.hidden` 을 페이즈로 읽는다. 값이 없으면 보이는 것으로 본다. */
export function visibilityPhaseOf(hidden: boolean | undefined): VisibilityPhase {
  return hidden === true ? "hidden" : "visible";
}
