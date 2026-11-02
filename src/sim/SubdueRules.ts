import type { InputFrame, SimEvent, Vec2 } from "./types";
import type { GuardState } from "./GuardPlanner";
import * as CombatRules from "./CombatRules";
import type { Tuning } from "./tuning";
import { onSameFloor } from "./geom";
import { canBeSubdued, immobilize } from "./GuardStatusRules";
import { withinBackReachPx } from "./InteractionRangeRules";

/**
 * 무력화. 등 뒤로 붙어 소리 없이 재운다.
 *
 * "앞을 막고 선 경비를 어떻게 하느냐" 에 대한 마지막 대답이다. 유인으로 돌려세우고,
 * 어둠으로 가리고, 다른 층으로 돌아가는 방법이 다 막혔을 때 남는 수단.
 *
 * 대가가 셋이다. 이게 없으면 무력화는 저택을 청소하는 버튼이 된다.
 *   1. **등 뒤여야 한다.** 나를 이미 발견한 상대에게는 성립하지 않는다.
 *   2. **시간이 든다.** 붙어 있는 동안 다른 경비 시야에 통째로 노출된다.
 *   3. **몸이 남는다.** 쓰러진 동료를 본 경비는 즉시 경계로 올라가고 내려오지 않는다.
 *
 * 전투 상대(곤봉병)에게는 통하지 않는다. 두 시스템이 섞이면 전투의 정답이
 * "등 뒤로 돌아가 E" 하나로 붕괴한다.
 */

export interface SubdueState {
  /** 지금 재우고 있는 상대. 조건이 깨지면 즉시 null 로 돌아가고 진행도가 사라진다. */
  readonly targetId: string | null;
  readonly progressMs: number;
}

export function createSubdue(): SubdueState {
  return { targetId: null, progressMs: 0 };
}

export interface SubdueActor {
  readonly at: Vec2;
  readonly hidden: boolean;
}

/** 지금 무력화할 수 있는 상대. 없으면 null. 화면의 안내도 이 함수를 쓴다. */
export function candidate(
  guards: readonly GuardState[],
  actor: SubdueActor,
  tuning: Tuning,
  preferredTargetId: string | null = null,
): GuardState | null {
  const preferred = preferredTargetId === null
    ? null
    : guards.find((guard) => guard.id === preferredTargetId) ?? null;
  if (preferred !== null && isCandidate(preferred, actor, tuning)) return preferred;
  let nearest: GuardState | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const guard of guards) {
    if (guard.id === preferredTargetId) continue;
    if (!isCandidate(guard, actor, tuning)) continue;
    const distance = Math.abs(actor.at.x - guard.x);
    if (distance >= nearestDistance) continue;
    nearest = guard;
    nearestDistance = distance;
  }
  return nearest;
}

function isCandidate(guard: GuardState, actor: SubdueActor, tuning: Tuning): boolean {
  if (actor.hidden || !canBeSubdued(guard)) return false;
  // 민간 정보원은 사람을 치우는 대상이 아니라 위험을 감수하고 정보를 훔치는 대상이다.
  // 경비반장은 기존처럼 소매치기 전에는 그 행동이 우선하고, 훔친 뒤 새 입력에는 무력화할 수 있다.
  if (guard.archetypeId === "usher" || guard.archetypeId === "butler") return false;
  // 전투 상대는 재우지 않는다. 싸워서 이겨야 한다.
  // 이미 나를 본 상대의 등 뒤는 없다.
  if (guard.susp.tier === "spotted") return false;
  if (!onSameFloor(actor.at.y, guard.y, tuning.world.floorHeightPx)) return false;
  // 몸이 겹친 자리는 등 뒤가 아니다. 통과 창에서 좌표가 교차하는 프레임을 제외한다.
  if (!withinBackReachPx(actor.at.x - guard.x, tuning.guard.subdueReachPx, tuning)) return false;
  return CombatRules.isBehind(actor.at, { x: guard.x, y: guard.y }, guard.facing);
}

export interface SubdueResult {
  readonly state: SubdueState;
  readonly guards: readonly GuardState[];
  readonly events: readonly SimEvent[];
  /** 이번 스텝에 성립했는가. 기술치 대가를 여기에 건다. */
  readonly subdued: boolean;
  /** 진행 중인가. 같은 E 키를 쓰는 절도와 겹치지 않게 한다. */
  readonly busy: boolean;
}

export function step(
  state: SubdueState,
  input: InputFrame,
  guards: readonly GuardState[],
  actor: SubdueActor,
  tuning: Tuning,
  dtMs: number,
  preferredTargetId: string | null = null,
): SubdueResult {
  if (!input.interact) {
    return { state: createSubdue(), guards, events: [], subdued: false, busy: false };
  }

  const latched = state.targetId === null ? null : guards.find((guard) => guard.id === state.targetId) ?? null;
  const target = latched !== null && isCandidate(latched, actor, tuning)
    ? latched
    : input.interactPressed
      ? candidate(guards, actor, tuning, preferredTargetId)
      : null;
  if (target === null) {
    return { state: createSubdue(), guards, events: [], subdued: false, busy: false };
  }

  // 대상이 바뀌면 처음부터. 붙어 있는 시간이 곧 대가이므로 이월시키지 않는다.
  const progressMs = state.targetId === target.id ? state.progressMs + dtMs : dtMs;
  if (progressMs < tuning.guard.subdueMs) {
    return {
      state: { targetId: target.id, progressMs },
      guards,
      events: [],
      subdued: false,
      busy: true,
    };
  }

  const at = { x: target.x, y: target.y };
  return {
    state: createSubdue(),
    guards: guards.map((guard) =>
      guard.id === target.id
        ? immobilize({
            ...guard,
            knockedOut: true,
            knockoutMs: tuning.guard.knockoutMs,
            staggerMs: 0,
          })
        : guard,
    ),
    events: [
      { kind: "GuardSubdued", guardId: target.id, at, method: "hold" },
      // 재우는 소리. 조용하지만 무음은 아니다.
      { kind: "NoiseEmitted", at, floor: target.floor, radius: tuning.guard.subdueNoiseRadius, source: "prop" },
    ],
    subdued: true,
    busy: true,
  };
}

/** 쓰러져 있는 몸의 위치. 다른 경비의 시야 판정에 넘긴다. */
export function bodies(guards: readonly GuardState[]): Vec2[] {
  return guards.filter((g) => g.knockedOut).map((g) => ({ x: g.x, y: g.y }));
}
