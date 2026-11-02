/**
 * 괴도의 품격.
 *
 * 이번 런에서 어떻게 굴었는가가 전리품 가치 배수와 정산 보너스를 바꾼다. 조용히
 * 훔치면 오르고, 사람에게 손을 대거나 오래 싸우면 깎인다 — "전투로 저택을 청소하는
 * 것이 절대 이득이 아니어야 한다" 는 밸런스 가드레일이 수치로 표현된 자리다.
 *
 * 이 규칙이 `RunRules.step` 안에 흩어져 있었을 때, 전투·무력화·소매치기가 각자
 * `RunStepInput` 에 optional boolean 을 하나씩 얹는 방식으로 신호를 보냈다. 받는
 * 쪽에 주인이 없으니 입력 타입이 집하장이 됐다. 여기가 그 신호들의 집이다.
 */

import type { Tuning } from "./tuning";

export interface ConductInput {
  /** 이번 스텝에 경비를 무력화했는가. 사람에게 손을 대면 즉발로 깎인다. */
  readonly subdued: boolean;
  /** 이번 스텝에 정보를 소매치기했는가. 해치지 않고 훔친 보상. */
  readonly pickpocketed: boolean;
  /** 전투 상대와 교전 중인가. 머무는 동안 계속 깎인다. */
  readonly engagedInCombat: boolean;
  /**
   * 어떤 경비라도 이 등급 이상이면 회복하지 않는다.
   * 절도 진행 여부와 함께 `RunRules.step` 이 자기 스텝의 사실로 덮어쓴다 —
   * 호출부가 따로 채우면 바깥 `maxAlarm` 과 갈라져 경계 중에도 품격이 회복된다.
   */
  readonly maxAlarm: 0 | 1 | 2 | 3;
  /** 절도 진행 중인가. 손을 대고 있는 동안은 회복하지 않는다. */
  readonly grabbing: boolean;
}

export const CALM_CONDUCT: ConductInput = Object.freeze({
  subdued: false,
  pickpocketed: false,
  engagedInCombat: false,
  maxAlarm: 0,
  grabbing: false,
});

/**
 * 이번 스텝의 품격 변화량.
 *
 * 즉발 대가(무력화·소매치기)와 지속 항(교전·회복)을 함께 낸다. 회복은 아무도
 * 깨어 있지 않고 손도 대지 않은 순간에만 붙는다.
 */
export function conductDelta(input: ConductInput, tuning: Tuning, dtMs: number): number {
  let delta = 0;
  // 무력화는 즉발 대가다. 경비를 치우는 것이 늘 이득이면 잠입할 이유가 없어진다.
  if (input.subdued) delta += tuning.skill.onSubdue;
  if (input.pickpocketed) delta += tuning.skill.onPickpocket;

  if (input.engagedInCombat) {
    // 싸울 수는 있되 절대 이득이 아니어야 한다. 전리품 가치 배수가 직접 깎인다.
    delta += (tuning.combat.skillPerEngagement * dtMs) / 1000;
  } else if (input.maxAlarm === 0 && !input.grabbing) {
    delta += tuning.skill.idleRegenPerSec * (dtMs / 1000);
  }
  return delta;
}

/**
 * 이번 런에서 처음 밟은 경계 단계와 새 발각이 품격에 남기는 즉발 변화량.
 *
 * `previousPeak` 을 기준으로 하므로 여러 경비가 한 프레임에 같은 단계로 올라가도
 * 한 번만 부과한다. 발각은 사건 단위 대가라 새 발각마다 반복된다.
 */
export function alarmTransitionDelta(
  previousPeak: 0 | 1 | 2 | 3,
  currentAlarm: 0 | 1 | 2 | 3,
  justSpotted: boolean,
  tuning: Tuning,
): number {
  let delta = 0;
  if (previousPeak < 1 && currentAlarm >= 1) delta += tuning.skill.onCurious;
  if (previousPeak < 2 && currentAlarm >= 2) delta += tuning.skill.onAlert;
  if (justSpotted) delta += tuning.skill.onSpotted;
  return delta;
}
