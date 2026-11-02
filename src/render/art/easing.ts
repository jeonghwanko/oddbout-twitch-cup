/**
 * 연출 공용 이징.
 *
 * 통합 전에는 `easeOutCubic` 5곳, `easeOutBack` 3곳이 각자 정의돼 있었고
 * `LootPresentation` 만 `Math.pow` 를 썼다. `Math.pow` 와 `**` 는 같은 추상 연산이라
 * 결과가 비트 단위로 같지만, 표기가 갈리면 "여기만 다른 곡선인가"를 매번 다시 읽게 된다.
 *
 * 시뮬레이션은 이 파일을 쓰지 않는다 — 이징은 화면의 성질이지 규칙이 아니다.
 * 판정에 쓰이는 진행률은 `sim` 쪽 `*Rules` 가 선형으로 소유한다.
 */

/** 끝에서 감속하는 3차 곡선. 0→0, 1→1, 구간 밖으로 넘치지 않는다. */
export function easeOutCubic(value: number): number {
  return 1 - (1 - value) ** 3;
}

/** 1 을 살짝 넘겼다가 돌아오는 탄성 곡선. 튀어나오는 팝업·전리품 연출용. */
export function easeOutBack(value: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (value - 1) ** 3 + c1 * (value - 1) ** 2;
}

/**
 * `easeOutBack` 의 넘침 세기를 고른 판. 3 이면 약 18% 넘친다 — 작은 배율 차이(버튼 반동)도 눈에 보인다.
 * `easeOutBack` 에 선택 인자를 붙이지 않는 까닭: `.map(easeOutBack)` 이 배열 순번을 세기로 넘긴다.
 */
export function easeOutBackWith(value: number, overshoot: number): number {
  const c3 = overshoot + 1;
  return 1 + c3 * (value - 1) ** 3 + overshoot * (value - 1) ** 2;
}

/** 처음에 느리고 끝으로 갈수록 빨라지는 3차 곡선. 갈라진 종이가 떨어져 나가거나 큰 글자가 내리꽂히는 가속용. */
export function easeInCubic(value: number): number {
  return value * value * value;
}

/** 첫 순간에 거의 다 와 버리는 지수 곡선. 1 에서 정확히 1 이다. 칸이 "쾅" 꽂혀 들어오는 몸짓용. */
export function easeOutExpo(value: number): number {
  return value >= 1 ? 1 : 1 - 2 ** (-10 * value);
}

/** 양끝에서 감속하는 3차 곡선. 슬로모가 정속으로 풀리는 박자처럼 "붙들었다 놓는" 전환용. */
export function easeInOutCubic(value: number): number {
  return value < 0.5 ? 4 * value * value * value : 1 - (-2 * value + 2) ** 3 / 2;
}

/** 양끝에서 부드럽게 감속하는 3차 에르미트(smoothstep). 0..1 밖은 넘치지 않게 자른다. */
export function smoothstep01(value: number): number {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}
