/**
 * 예고장 식별자의 의존성 없는 SSOT.
 * Node 플레이로그 분석기와 브라우저 런타임이 같은 목록을 직접 소비한다.
 */
export const CALLING_CARD_IDS = Object.freeze([
  "midnight",
  "untouched",
  "threeminutes",
  "lightson",
  "heavier",
  "wax",
  "stairwatch",
  "fullhouse",
  "roofgreeting",
] as const);

export type CallingCardId = (typeof CALLING_CARD_IDS)[number];
