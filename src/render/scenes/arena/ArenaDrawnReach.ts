/**
 * 무투장 두 몸 그림이 발 위로 닿는 높이(2026-10-24 — 사용자: 높이 올라가는 자세가 얼굴 HUD 뒤로 간다, "고쳐"): 카메라가 그 높이를 HUD 밑에
 * 담는다. 칸마다 바뀌는 높이를 그대로 주면 연타 한 번에 카메라가 들썩이므로, 높아지면 곧바로 받고 낮아질 때는 `releaseMs` 에 걸쳐 내려놓는다.
 * 순수 계산이다(그림 높이는 장면이 `FrameInkTop` 으로 잰다).
 */
export const ARENA_DRAWN_REACH = Object.freeze({ releaseMs: 450 });

export class ArenaDrawnReach {
  private held = 0;

  /** A new bout: nothing held. */
  reset(): void { this.held = 0; }

  /**
   * This frame's reach (world px over the feet, the higher body's): a higher one at once, a lower one eased toward over `releaseMs`
   * (reduced motion: at once).
   */
  update(dtMs: number, reaches: readonly number[], reducedMotion: boolean): number {
    const now = Math.max(0, ...reaches.filter(Number.isFinite));
    const dt = Number.isFinite(dtMs) ? Math.max(0, Math.min(100, dtMs)) : 0;
    this.held = now >= this.held || reducedMotion ? now : this.held + (now - this.held) * (1 - Math.exp(-dt / ARENA_DRAWN_REACH.releaseMs));
    return this.held;
  }
}
