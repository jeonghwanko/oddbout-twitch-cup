import type { GuardState } from "./GuardPlanner";
import { archetypeOf } from "./GuardArchetypes";
import * as CombatRules from "./CombatRules";
import * as SuspicionRules from "./SuspicionRules";
import type { Tuning } from "./tuning";
import type { InputFrame, SimEvent, Vec2 } from "./types";
import { onSameFloor } from "./geom";
import { canBePickpocketed } from "./GuardStatusRules";
import { transitionGuardMode } from "./GuardStateMachine";
import { withinBackReachPx } from "./InteractionRangeRules";

export interface PickpocketState {
  readonly targetId: string | null;
  readonly progressMs: number;
  /** 같은 사람을 놓았다 다시 잡아 무한히 품격을 벌지 못하게 한다. */
  readonly pickedGuardIds: readonly string[];
  /** 순찰 교대표로 모든 경비 경로를 볼 수 있는 잔여 시간. */
  readonly patrolIntelMs: number;
  /** 안내원에게 훔친 서비스 통로 열쇠. */
  readonly areaKey: boolean;
  /** 집사에게 훔친 금고 번호. 금고 요구 기술을 낮춘다. */
  readonly vaultCode: boolean;
}

export interface PickpocketActor {
  readonly at: Vec2;
  readonly hidden: boolean;
}

export function createPickpocket(): PickpocketState {
  return { targetId: null, progressMs: 0, pickedGuardIds: [], patrolIntelMs: 0, areaKey: false, vaultCode: false };
}

/** 현재 소매치기할 수 있는 정보원. 화면 안내와 실제 판정이 같이 쓴다. */
export function candidate(
  guards: readonly GuardState[],
  actor: PickpocketActor,
  state: PickpocketState,
  tuning: Tuning,
  preferredTargetId: string | null = null,
): GuardState | null {
  const preferredId = state.targetId ?? preferredTargetId;
  const preferred = preferredId === null
    ? null
    : guards.find((guard) => guard.id === preferredId) ?? null;
  if (preferred !== null && isCandidate(preferred, actor, state, tuning)) return preferred;
  let nearest: GuardState | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const guard of guards) {
    if (guard.id === preferredId) continue;
    if (!isCandidate(guard, actor, state, tuning)) continue;
    const distance = Math.abs(actor.at.x - guard.x);
    if (distance >= nearestDistance) continue;
    nearest = guard;
    nearestDistance = distance;
  }
  return nearest;
}

function isEligible(
  guard: GuardState,
  actor: PickpocketActor,
  state: PickpocketState,
  tuning: Tuning,
): boolean {
  if (actor.hidden || !canBePickpocketed(guard)) return false;
  if (archetypeOf(guard.archetypeId).intelId === undefined || guard.susp.tier === "spotted") return false;
  if (state.pickedGuardIds.includes(guard.id)) return false;
  if (!onSameFloor(actor.at.y, guard.y, tuning.world.floorHeightPx)) return false;
  // 무력화와 같은 계약이다. 몸이 겹친 프레임에는 주머니에 손을 넣을 등 뒤가 없다.
  return withinBackReachPx(actor.at.x - guard.x, tuning.guard.pickpocketReachPx, tuning);
}

function isCandidate(
  guard: GuardState,
  actor: PickpocketActor,
  state: PickpocketState,
  tuning: Tuning,
): boolean {
  return isEligible(guard, actor, state, tuning) &&
    CombatRules.isBehind(actor.at, { x: guard.x, y: guard.y }, guard.facing);
}

export interface PickpocketResult {
  readonly state: PickpocketState;
  readonly guards: readonly GuardState[];
  readonly events: readonly SimEvent[];
  readonly busy: boolean;
  readonly picked: boolean;
  /** 도중에 상대가 돌아서 즉시 발각된 경우. 공통 발각과 명시적 계약 전도 경로에 연결한다. */
  readonly failedGuardId: string | null;
}

export function step(
  state: PickpocketState,
  input: InputFrame,
  guards: readonly GuardState[],
  actor: PickpocketActor,
  tuning: Tuning,
  dtMs: number,
  preferredTargetId: string | null = null,
): PickpocketResult {
  const patrolIntelMs = Math.max(0, state.patrolIntelMs - dtMs);
  const idleState = { ...state, targetId: null, progressMs: 0, patrolIntelMs };
  if (!input.interact) {
    return { state: idleState, guards, events: [], busy: false, picked: false, failedGuardId: null };
  }

  const latched = state.targetId === null
    ? null
    : guards.find((guard) => guard.id === state.targetId) ?? null;

  // 손을 뻗은 뒤 상대가 돌아보면 단순 취소가 아니라 현행범 발각이다.
  if (
    latched !== null &&
    isEligible(latched, actor, state, tuning) &&
    !CombatRules.isBehind(actor.at, { x: latched.x, y: latched.y }, latched.facing)
  ) {
    const from = latched.susp.tier;
    const spotted = {
      ...latched,
      mode: transitionGuardMode(latched.mode, { kind: "alerted" }),
      susp: SuspicionRules.bump(latched.susp, tuning.suspicion.max, actor.at, tuning),
    };
    return {
      state: idleState,
      guards: guards.map((guard) => guard.id === spotted.id ? spotted : guard),
      events: [{ kind: "SuspicionTierChanged", guardId: spotted.id, from, to: "spotted" }],
      busy: true,
      picked: false,
      failedGuardId: spotted.id,
    };
  }

  const target = latched !== null && isCandidate(latched, actor, state, tuning)
    ? latched
    : input.interactPressed
      ? candidate(guards, actor, state, tuning, preferredTargetId)
      : null;
  if (target === null) {
    return { state: idleState, guards, events: [], busy: false, picked: false, failedGuardId: null };
  }

  const progressMs = state.targetId === target.id ? state.progressMs + dtMs : dtMs;
  if (progressMs < tuning.guard.pickpocketMs) {
    return {
      state: { ...state, targetId: target.id, progressMs, patrolIntelMs },
      guards,
      events: [],
      busy: true,
      picked: false,
      failedGuardId: null,
    };
  }

  const intelId = archetypeOf(target.archetypeId).intelId;
  if (intelId === undefined) throw new Error(`정보 보상이 없는 소매치기 대상: ${target.archetypeId}`);
  return {
    state: {
      targetId: null,
      progressMs: 0,
      pickedGuardIds: [...state.pickedGuardIds, target.id],
      patrolIntelMs: intelId === "patrol-schedule" ? tuning.guard.patrolIntelMs : patrolIntelMs,
      areaKey: state.areaKey || intelId === "area-key",
      vaultCode: state.vaultCode || intelId === "vault-code",
    },
    guards,
    events: [{
      kind: "GuardPickpocketed",
      guardId: target.id,
      intelId,
      at: { x: target.x, y: target.y },
    }],
    busy: true,
    picked: true,
    failedGuardId: null,
  };
}
