/**
 * 경직 저항(poise).
 *
 * 평타가 매번 150ms 경직을 남기면, 사거리 안에 붙어 C만 두드리는 것이 모든 적의
 * 정답이 된다. 적의 공격 페이즈를 되감지 않더라도 경직이 계속 갱신되는 한
 * 경비는 영원히 선딜을 끝내지 못한다 — `CombatImpulse.resetsAttack` 이 막은 구멍의
 * 나머지 절반이다.
 *
 * 그래서 짧은 창 안에 연타를 맞은 경비는 잠시 경직을 흘린다. 피해와 넉백은
 * 그대로 들어가므로 "공격이 씹혔다" 가 아니라 "이 놈이 버틴다" 로 읽히고, 플레이어는
 * 강공격·대시 공격으로 무게를 바꾸라는 요구를 받는다.
 *
 * 카운터에 기록되는 것은 **C 사슬 전체**다 — 평타 두 타와 사슬 3타(피니셔)까지.
 * 실제 사슬이 평타-평타-피니셔라서 피니셔만 저항을 지우면 세 번째 타마다 카운터가
 * 0으로 돌아가고, 저항은 실전에서 단 한 번도 성립하지 않는다. 대신 피니셔는 흡수
 * 대상이 아니다: 자기 경직은 언제나 남긴다.
 *
 * 저항을 실제로 0으로 되돌리는 것은 다른 키를 누른 입력, 즉 강공격(V)과 대시 공격뿐이다.
 * 무게를 바꾼 플레이어만 보상받는다는 것이 이 규칙의 전부다.
 *
 * 상태는 `GuardState.poise` 하나(`GuardPoise`)뿐이고, 이 모듈은 순수 함수만 소유한다. 세 값은 언제나
 * 여기서 함께 바뀐다.
 */

import type { Tuning } from "./tuning";

/** 경비 한 명의 경직 저항. */
export interface GuardPoise {
  /** 짧은 창 안에 누적된 C 사슬 타수. */
  readonly hits: number;
  /** 누적 창의 남은 시간. 닫히면 누적도 사라진다. */
  readonly windowMs: number;
  /** 한도를 넘어 평타 경직을 흘리는 남은 시간. */
  readonly brokenMs: number;
}

interface PoiseHolder {
  readonly poise: GuardPoise;
}

/** 저항 시계. `GuardPlanner.step` 최상단에서 돈다 — 경직 분기가 early-return 하기 때문이다. */
export function decayPoise<TGuard extends PoiseHolder>(guard: TGuard, dtMs: number): TGuard {
  const brokenMs = Math.max(0, guard.poise.brokenMs - dtMs);
  const windowMs = Math.max(0, guard.poise.windowMs - dtMs);
  if (brokenMs === guard.poise.brokenMs && windowMs === guard.poise.windowMs) return guard;
  return {
    ...guard,
    poise: {
      // 창이 닫히면 누적도 사라진다. 10초 간격의 평타 세 번은 연타가 아니다.
      hits: windowMs > 0 ? guard.poise.hits : 0,
      windowMs,
      brokenMs,
    },
  };
}

/** 지금 이 경비가 평타 경직을 흘리는 중인가. 피니셔·강공격·대시는 이 값을 보지 않는다. */
export function absorbsStun(guard: PoiseHolder): boolean {
  return guard.poise.brokenMs > 0;
}

/**
 * C 사슬 한 대를 저항 카운터에 기록한다. 평타 두 타와 사슬 3타가 모두 여기로 온다.
 *
 * 한도에 닿은 그 타격 자체는 아직 경직을 만든다 — 흡수는 다음 타부터다.
 * 그래야 "세 대까지는 통하고 네 번째부터 버틴다" 가 화면에서 셀 수 있는 규칙이 된다.
 */
export function registerStun<TGuard extends PoiseHolder>(guard: TGuard, tuning: Tuning): TGuard {
  const hits = guard.poise.hits + 1;
  if (hits >= tuning.combat.poiseHits) {
    return { ...guard, poise: { hits: 0, windowMs: 0, brokenMs: tuning.combat.poiseBreakMs } };
  }
  return { ...guard, poise: { hits, windowMs: tuning.combat.poiseWindowMs, brokenMs: 0 } };
}

/**
 * 강공격·대시만 저항을 통째로 지운다. 무게를 바꾼 플레이어는 즉시 보상받는다.
 * 사슬 3타는 여기로 오지 않는다 — 사슬 안에서 저항이 매번 초기화되면 규칙 자체가 죽는다.
 */
export function breakPoise<TGuard extends PoiseHolder>(guard: TGuard): TGuard {
  return { ...guard, poise: { hits: 0, windowMs: 0, brokenMs: 0 } };
}
