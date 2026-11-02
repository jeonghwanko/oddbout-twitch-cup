/**
 * 전투 이펙트 시계의 공통 정책(2026-10-15, 마을 대결·저택 전투 공통 타격 레시피 — `docs/kaito-web/combat-vfx-lab.md`).
 *
 * 히트스톱 동안 접촉 이펙트는 흐르지 않는다(배율 0). 멈춘 화면은 정물이고, 정지가 풀리는 첫 프레임에 광선·불티·고리·넉백이
 * 한꺼번에 나간다(홀드-스냅). 예전에는 마을 0.75·빛 터짐층 불티 0.22·저택 0.5 로 셋이 달랐고, 정지 안에서 폭발이 계속 움직여
 * 정지가 정지로 읽히지 않았다(2026-10-15 프레임 검수). 흰 핵은 정지 전체가 아니라 접촉 0~1 프레임만 쓴다 — 정지 내내 흰 판이
 * 붙어 "멈춘 화면"으로 읽히던 옛 문제(`ActionEffectCues` 의 옛 기록)는 흰색을 짧게 쓰는 것으로 푼다.
 *
 * CLI(`tools/fx/*.mjs`)가 node strip-types 로 읽는 레시피도 이 파일을 import 하므로 다른 모듈을 import 하지 않는다.
 */

/** 히트스톱 동안 이펙트 나이가 흐르는 배율 — 마을·저택·빛 터짐층·실험실 리그가 모두 이 값을 쓴다. */
export const COMBAT_FX_FREEZE_RATE = 0;

/**
 * 한 화면 프레임의 이펙트 시계 — 마을 진행자가 프레임마다 한 번 만들어 모든 이펙트 뷰에 나눠 준다(정지 판정을 뷰마다 다시 하지
 * 않는다). `frozen`: 히트스톱이 이 프레임을 붙잡았다(공유 시계의 배율이 0 인 프레임 포함). `rate`·`fxDtMs`: 이펙트 나이가 흐르는
 * 배율과 길이(정지 중 `COMBAT_FX_FREEZE_RATE`, 그 밖에는 싸움 시계의 배율 — 슬로모 동안 그 배율). `fightDtMs`: 싸움 시계가 흐른 길이.
 */
export interface CombatFxFrame {
  readonly screenDtMs: number;
  readonly frozen: boolean;
  readonly rate: number;
  readonly fxDtMs: number;
  readonly fightDtMs: number;
}

export function combatFxFrame(screenDtMs: number, clock: { readonly hitStopMs: number; readonly scale: number }): CombatFxFrame {
  const dt = Number.isFinite(screenDtMs) ? Math.max(0, screenDtMs) : 0;
  const frozen = clock.hitStopMs > 0 || clock.scale === 0 && dt > 0;
  const rate = frozen ? COMBAT_FX_FREEZE_RATE : clock.scale;
  return { screenDtMs: dt, frozen, rate, fxDtMs: dt * rate, fightDtMs: frozen ? 0 : dt * clock.scale };
}
