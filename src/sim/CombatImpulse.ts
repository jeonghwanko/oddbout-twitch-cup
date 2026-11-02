/**
 * 전투가 만드는 공간.
 *
 * 평타·강공격·대시 공격·피니셔는 서로 다른 동사지만 몸에 하는 일은 같다: 한 명을 밀고,
 * 부딪힌 뒤 경비에게 남은 거리를 전달하고, 벽에 박힌 놈을 더 오래 눕히고, 그 광경을 본
 * 방관자를 전부 깨운다. 이 절차가 여러 함수에 복사돼 있어서 한쪽만 고치면 조용히 갈라졌다.
 *
 * 기하는 `CombatDisplacementRules` 가 이미 순수하게 풀어 놓았다. 여기 있는 것은
 * 그 주변의 오케스트레이션이고, 네 동사의 차이는 `Impulse` 다섯 숫자뿐이다.
 */

import type { AttackTier } from "./AttackMoves";
import type { GuardState } from "./GuardPlanner";
import { displaceHorizontalChain } from "./CombatDisplacementRules";
import type { MansionLayout } from "./MansionLayout";
import * as SuspicionRules from "./SuspicionRules";
import type { Facing, SimEvent, Vec2 } from "./types";
import type { Tuning } from "./tuning";
import { canBeCombatTarget } from "./GuardStatusRules";
import { transitionGuardMode } from "./GuardStateMachine";
import { enterCombatPhase } from "./CombatRules";

export interface Impulse {
  /** 이 충격을 만든 공격의 무게. 이벤트에 실려 렌더가 같은 이름으로 세기를 고른다. */
  readonly tier: AttackTier;
  readonly knockbackPx: number;
  /**
   * 사슬 평타의 박자별 넉백(px). 있으면 1·2타가 `knockbackPx` 대신 이 값을 쓴다 — 같은 거리를 밀면
   * 두 타격이 복사본으로 읽힌다. 사슬 밖 평타(박자 없음)는 `knockbackPx` 다.
   */
  readonly chainBeatKnockbackPx?: Readonly<Record<1 | 2, number>>;
  /** 직접 맞은 상대의 경직. */
  readonly staggerMs: number;
  /** 부딪혀 밀려난 뒤 경비의 경직. */
  readonly chainStaggerMs: number;
  /** 벽에 박힌 상대의 경직. 가장 길다 — 벽꿍이 곧 최대 보상이다. */
  readonly wallStaggerMs: number;
  /**
   * 맞은 상대의 공격 사이클을 cooldown 으로 되감는가.
   *
   * 평타만 false 다. 무제한 평타가 매번 적 선딜을 지우면 `연타 → 영구 경직` 이
   * 성립해 회피·처벌 문법이 사라진다 — `CombatRules.damage` 의 같은 계약과 한 쌍이다.
   */
  readonly resetsAttack: boolean;
}

export interface ImpulseResult {
  readonly guards: readonly GuardState[];
  readonly chainGuardIds: readonly string[];
  readonly wallSlamGuardId: string | null;
  /** 주 대상이 밀려 도착한 위치. 주 이벤트의 `at` 이 된다. */
  readonly at: Vec2;
  /** 방관자 각성·연쇄·벽꿍. 주 이벤트(밀치기/피니셔)는 호출부가 자기 이름으로 낸다. */
  readonly events: readonly SimEvent[];
}

/** 쓰러졌거나 사물인 대상은 연쇄에 끼지 않는다. */
export function canJoinShoveChain(guard: GuardState): boolean {
  return canBeCombatTarget(guard);
}

/** 전투 접촉은 상대를 즉시 발각·영구 경계 상태로 만든다. */
export function alertGuard(guard: GuardState, at: Vec2, tuning: Tuning): GuardState {
  const susp = SuspicionRules.bump(guard.susp, tuning.suspicion.spottedThreshold, at, tuning);
  return {
    ...guard,
    susp,
    permanentAlert: true,
    mode: transitionGuardMode(guard.mode, { kind: "alerted" }),
  };
}

/**
 * 주 대상을 밀고 그 결과를 경비 배열과 이벤트로 돌려준다.
 *
 * 주 대상은 호출부가 이미 각성시켜 넘긴다 — 밀치기는 정면 방어 판정을 먼저 해야 하고,
 * 피니셔는 피해 판정에서 이미 각성시켰기 때문이다. 여기서 다시 건드리면 그 순서가 깨진다.
 */
export function applyCombatImpulse(
  targetId: string,
  guards: readonly GuardState[],
  facing: Facing,
  playerAt: Vec2,
  impulse: Impulse,
  layout: MansionLayout,
  tuning: Tuning,
): ImpulseResult {
  const target = guards.find((guard) => guard.id === targetId);
  if (target === undefined) {
    return { guards, chainGuardIds: [], wallSlamGuardId: null, at: playerAt, events: [] };
  }

  // 피해로 막 쓰러진 주 대상도 날아가야 하므로 target 만 생존 필터의 예외로 둔다.
  const chain = displaceHorizontalChain(
    targetId,
    guards
      .filter((guard) => guard.id === targetId || canJoinShoveChain(guard))
      .map((guard) => ({ id: guard.id, x: guard.x, feetY: guard.y })),
    facing,
    impulse.knockbackPx,
    tuning.movement.bodyWidth / 2,
    tuning.movement.bodyHeightStand,
    layout,
  );

  const chainGuardIds = [...new Set(chain.collisions.map((collision) => collision.targetId))];
  const affectedIds = new Set([targetId, ...chainGuardIds]);
  const wallSlamGuardId = chain.blockedBy === "solid" || chain.blockedBy === "world"
    ? chain.blockedBodyId
    : null;

  const events: SimEvent[] = [];
  for (const guard of guards) {
    if (guard.id === targetId || !affectedIds.has(guard.id) || guard.susp.tier === "spotted") continue;
    events.push({ kind: "SuspicionTierChanged", guardId: guard.id, from: guard.susp.tier, to: "spotted" });
  }

  const next = guards.map((guard) => {
    if (!affectedIds.has(guard.id)) return guard;
    const alerted = guard.id === targetId ? guard : alertGuard(guard, playerAt, tuning);
    const staggerMs = guard.id === wallSlamGuardId
      ? impulse.wallStaggerMs
      : guard.id === targetId
        ? impulse.staggerMs
        : impulse.chainStaggerMs;
    return {
      ...alerted,
      x: chain.positions.get(guard.id) ?? guard.x,
      staggerMs: Math.max(alerted.staggerMs, staggerMs),
      // 평타(resetsAttack false)는 밀되 상대의 공격 사이클을 되감지 않는다.
      combat: !impulse.resetsAttack || alerted.combat === null || alerted.combat.defeated
        ? alerted.combat
        : enterCombatPhase(alerted.combat, "cooldown", { struck: false, attackFacing: null }),
    };
  });

  const at = { x: chain.positions.get(targetId) ?? target.x, y: target.y };

  if (chainGuardIds.length > 0) {
    const impacts = chain.collisions.map((collision) => collision.at);
    events.push({
      kind: "GuardChainShoved",
      sourceGuardId: targetId,
      guardIds: chainGuardIds,
      at: impacts[0] ?? at,
      impacts,
      facing,
    });
  }
  if (wallSlamGuardId !== null) {
    const wallGuard = next.find((guard) => guard.id === wallSlamGuardId);
    if (wallGuard !== undefined) {
      events.push({
        kind: "GuardWallSlammed",
        guardId: wallGuard.id,
        at: { x: wallGuard.x, y: wallGuard.y },
        facing,
        tier: impulse.tier,
      });
    }
  }

  return { guards: next, chainGuardIds, wallSlamGuardId, at, events };
}

/** 튜닝의 무게별 충격표를 무브가 참조하는 이름에 연결한다. */
export function impulseFor(tier: AttackTier, tuning: Tuning): Impulse {
  return tuning.combat.tierImpulse[tier];
}

/**
 * 무브 한 번의 충격. 사슬 1·2타(`combo` 1·2)는 티어 충격의 박자별 넉백을 쓴다(`chainBeatKnockbackPx`).
 * 사슬 밖 무브(`combo` 0)와 3타는 티어 충격 그대로다.
 */
export function impulseForHit(tier: AttackTier, combo: number, tuning: Tuning): Impulse {
  const impulse = impulseFor(tier, tuning);
  const beatPx = combo === 1 || combo === 2 ? impulse.chainBeatKnockbackPx?.[combo] : undefined;
  return beatPx === undefined ? impulse : { ...impulse, knockbackPx: beatPx };
}


export function daggerCombatStaggerMs(tuning: Tuning): number {
  return Math.min(tuning.mischief.grazeStaggerMs, impulseFor("light", tuning).staggerMs);
}

/**
 * 경직 저항이 먹은 평타. 피해와 넉백은 그대로 들어가고 경직만 사라진다.
 *
 * 흡수를 "충격 없음" 으로 만들면 화면에서 공격이 통째로 씹힌 것처럼 보인다.
 * 밀리기는 하되 자세가 무너지지 않는 쪽이 저항을 읽히게 한다.
 */
export function absorbedImpulse(impulse: Impulse): Impulse {
  return { ...impulse, staggerMs: 0, chainStaggerMs: 0, wallStaggerMs: 0, resetsAttack: false };
}
