/**
 * 밀린 몸의 화면 따라잡기 곡선: 빠르게 나가서 한 번에 선다.
 *
 * sim 은 넉백을 한 틱에 끝낸다(좌표는 이미 밀린 자리). 화면은 맞기 전 자리에서 출발해 그 자리를 따라잡는다.
 * 예전 곡선은 순수 지수 감쇠(e^(−t/τ), 강타 τ 105ms)라 끝이 없었다 — 44px 강타가 400ms 넘게 1px 씩
 * 기어가며 "멈춤" 이 안 읽혔다(2026-09-26). 여기서는 지수 감쇠에 최저 속도 `stopPxPerMs` 를 더한다:
 *
 *   dx/dt = −x/τ − v   →   x(t) = (x₀ + vτ)·e^(−t/τ) − vτ,   멈춤 t* = τ·ln(1 + x₀/(vτ))
 *
 * 첫 프레임은 거의 지수 그대로 크게 나가고(강타 44px → 약 11px), 끝은 v 의 속도로 걸어 들어와 t* 에
 * 정확히 0 에 닿는다. 닫힌 식이라 프레임 간격과 무관하게 같은 곳에 선다(60Hz·30Hz·벽시계 dt).
 */
export interface KnockbackCurve {
  /** 시정수(ms). 작을수록 첫 프레임에 멀리 나간다. */
  readonly tauMs: number;
  /** 멈추기 직전의 최저 속도(px/ms). 클수록 끝이 단호하다(0 이면 옛 지수 곡선 — 끝이 없다). */
  readonly stopPxPerMs: number;
}

/** 남은 거리 `px`(부호 무시)가 `dtMs` 뒤에 얼마나 남는가. 0 이하로 넘어가면 0 — 그 자리에서 선다. */
export function knockbackRemainingPx(px: number, dtMs: number, curve: KnockbackCurve): number {
  const x = Math.abs(px);
  if (x === 0) return 0;
  const dt = Math.max(0, dtMs);
  const vTau = Math.max(0, curve.stopPxPerMs) * curve.tauMs;
  return Math.max(0, (x + vTau) * Math.exp(-dt / curve.tauMs) - vTau);
}

/** `px` 를 밀린 몸이 완전히 서는 시각(ms). 최저 속도가 0 이면 무한대다. */
export function knockbackStopMs(px: number, curve: KnockbackCurve): number {
  const x = Math.abs(px);
  if (x === 0) return 0;
  const vTau = Math.max(0, curve.stopPxPerMs) * curve.tauMs;
  return vTau <= 0 ? Number.POSITIVE_INFINITY : curve.tauMs * Math.log(1 + x / vTau);
}

/** 출발부터 `tMs` 동안 간 비율(0..1). 멈춤 시각에 정확히 1. */
export function knockbackProgress(px: number, tMs: number, curve: KnockbackCurve): number {
  const x = Math.abs(px);
  if (x === 0) return 1;
  return 1 - knockbackRemainingPx(x, Math.max(0, tMs), curve) / x;
}
