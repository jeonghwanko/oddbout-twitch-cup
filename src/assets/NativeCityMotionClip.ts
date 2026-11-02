/** A walk / run clip's motion facts (2026-10-22, moved from `render/animation/NativeCityPlayerMotion` — the pack format reads it). */
export interface NativeCityMotionClip {
  readonly cycleMs: number;
  readonly playbackRate?: number;
  /** 한 주기의 실제 이동 거리. 새 원화의 보폭이 준비되면 호출부가 주입한다. */
  readonly strideDistance?: number;

  readonly stridePixels?: number;
  /**
   * 위상 시계의 한 주기(ms, 2026-10-16). 있으면 실제 이동 거리 ÷ (속도 × 이 주기)로 진행한다 — 제 속도로 걸으면 시간 시계이고,
   * 벽에 막히면 멈춘다. 프레임 선택은 그대로 원화 길이 `cycleMs` 를 쓴다(주기가 짧으면 원화를 빨리 돌린다).
   */
  readonly clockMs?: number;
  readonly contacts?: readonly [number, number];
}
