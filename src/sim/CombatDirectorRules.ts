import type { GuardState } from "./GuardPlanner";
import { archetypeOf } from "./GuardArchetypes";
import type { CombatProfile } from "./GuardArchetypes";
import type { SimEvent, Vec2 } from "./types";
import type { Tuning } from "./tuning";
import { onSameFloor } from "./geom";
import { FORWARD_OVERLAP_PX } from "./CombatReach";
import * as GuardStatusRules from "./GuardStatusRules";

/**
 * 다수전의 공격권을 한 명에게만 준다.
 *
 * 이미 시작한 공격은 끝까지 보존하고, 종료 뒤에는 짧은 교대 시간을 둔 다음 직전 공격자가
 * 아닌 가장 가까운 적을 우선한다. 나머지는 추격을 계속하므로 포위 압박은 남지만 서로 다른
 * 선딜이 같은 순간 겹쳐 플레이어의 회피 판단을 지우지 않는다.
 */
export interface CombatDirectorState {
  readonly ownerGuardId: string | null;
  readonly lastOwnerGuardId: string | null;
  readonly lastAttackKind: CombatProfile["attackKind"] | null;
  /** 오래 공격하지 못한 경비를 먼저 고르기 위한 오래된 순서 → 최신 순서 큐. */
  readonly recentGuardIds: readonly string[];
  readonly handoffMs: number;
}

export interface CombatDirectorResult {
  readonly state: CombatDirectorState;
  readonly events: readonly SimEvent[];
}

export function createCombatDirector(): CombatDirectorState {
  return {
    ownerGuardId: null,
    lastOwnerGuardId: null,
    lastAttackKind: null,
    recentGuardIds: [],
    handoffMs: 0,
  };
}


export const IMMINENT_PLAYER_STRIKE_MS = 80;

export function step(
  state: CombatDirectorState,
  guards: readonly GuardState[],
  target: Vec2,
  tuning: Tuning,
  dtMs: number,
  visuallyEligibleGuardIds?: readonly string[],
  imminentStrikeGuardIds: readonly string[] = [],
): CombatDirectorResult {
  if (state.ownerGuardId !== null) {
    const owner = guards.find((guard) => guard.id === state.ownerGuardId);
    if (
      owner !== undefined
      && (isCommitted(owner) || canApproach(owner, target, tuning, visuallyEligibleGuardIds))
    ) {
      return { state: { ...state, handoffMs: 0 }, events: [] };
    }
    const attackKind = owner === undefined ? state.lastAttackKind : attackKindOf(owner);
    const recentGuardIds = rememberOwner(state.recentGuardIds, state.ownerGuardId);
    return {
      state: {
        ownerGuardId: null,
        lastOwnerGuardId: state.ownerGuardId,
        lastAttackKind: attackKind,
        recentGuardIds,
        handoffMs: tuning.combat.attackHandoffMs,
      },
      events: [],
    };
  }

  const handoffMs = Math.max(0, state.handoffMs - dtMs);
  if (handoffMs > 0) return { state: { ...state, handoffMs }, events: [] };

  // 저장 데이터나 테스트가 이미 중첩 공격 상태를 만들었다면 그 공격들을 취소하지 않는다.
  // 새 공격권만 잠그고, 모두 끝난 뒤 정상적인 한 명 교대로 복귀한다.
  if (guards.some(isCommitted)) return { state: { ...state, handoffMs: 0 }, events: [] };

  let candidates = guards.filter((guard) => canClaim(guard, target, tuning, visuallyEligibleGuardIds)
    && !blockedByFrontRank(guard, guards, target, tuning)
    && !imminentStrikeGuardIds.includes(guard.id));
  if (state.lastAttackKind !== null) {
    const oppositeRole = candidates.filter((guard) => attackKindOf(guard) !== state.lastAttackKind);
    if (oppositeRole.length > 0) candidates = oppositeRole;
  }
  const recentGuardIds = state.recentGuardIds ?? [];
  candidates = candidates
    .sort((a, b) => {
      const aWasLast = a.id === state.lastOwnerGuardId ? 1 : 0;
      const bWasLast = b.id === state.lastOwnerGuardId ? 1 : 0;
      if (aWasLast !== bWasLast) return aWasLast - bWasLast;
      const recency = recencyRank(a.id, recentGuardIds) - recencyRank(b.id, recentGuardIds);
      if (recency !== 0) return recency;
      const distance = Math.abs(a.x - target.x) - Math.abs(b.x - target.x);
      return distance !== 0 ? distance : compareIds(a.id, b.id);
    });
  const owner = candidates[0];
  if (owner === undefined) {
    return { state: { ...state, handoffMs: 0 }, events: [] };
  }

  return {
    state: { ...state, ownerGuardId: owner.id, handoffMs: 0 },
    events: [{ kind: "GuardAttackTurnClaimed", guardId: owner.id, at: { x: owner.x, y: owner.y } }],
  };
}

/** 대기 경비를 근접 전열·원거리 후열 슬롯에 배치해 한 점에 포개지는 추격을 막는다. */
export function pressureTargets(
  guards: readonly GuardState[],
  ownerGuardId: string | null,
  target: Vec2,
  tuning: Tuning,
): ReadonlyMap<string, number> {
  const active = guards.filter((guard) => canPressure(guard, target, tuning));
  // 1:1은 기존 추격 간격을 유지한다. 포위 슬롯은 실제 다수전에서만 개입한다.
  if (active.length <= 1) return new Map();
  const waiting = active.filter((guard) => guard.id !== ownerGuardId);
  const groups = new Map<string, GuardState[]>();
  for (const guard of waiting) {
    const side = sideOf(guard, target);
    const kind = archetypeOf(guard.archetypeId).combat?.attackKind ?? "melee";
    const key = `${side}:${kind}`;
    const group = groups.get(key) ?? [];
    group.push(guard);
    groups.set(key, group);
  }

  // 공격권을 쥔 근접 경비는 자기 쪽 전열 자리를 이미 차지하고 있다. 같은 쪽 근접 대기열은 그 몸 뒤에서
  // 시작한다 — 공격 거리(곤봉 52)가 전열 거리(48)보다 멀어, 그러지 않으면 대기 경비가 공격자 몸을
  // 관통해 앞에 서거나 한 점에 포개졌다(2026-09-26 경비 필름 pile-on-same-side).
  const owner = ownerGuardId === null ? undefined : active.find((guard) => guard.id === ownerGuardId);
  const ownerMeleeSide = owner !== undefined && (archetypeOf(owner.archetypeId).combat?.attackKind ?? "melee") === "melee"
    ? sideOf(owner, target)
    : null;
  const targets = new Map<string, number>();
  for (const side of [-1, 1] as const) {
    for (const kind of ["melee", "ranged"] as const) {
      const line = groups.get(`${side}:${kind}`) ?? [];
      line.sort((a, b) => {
        const distance = Math.abs(a.x - target.x) - Math.abs(b.x - target.x);
        return distance !== 0 ? distance : compareIds(a.id, b.id);
      });
      const baseDistance = kind === "ranged"
        ? tuning.combat.rangedPressureDistancePx
        : tuning.combat.pressureDistancePx;
      const spacing = kind === "ranged"
        ? tuning.combat.rangedPressureSpacingPx
        : tuning.combat.pressureSpacingPx;
      const firstDistance = kind === "melee" && ownerMeleeSide === side && owner !== undefined
        ? Math.max(baseDistance, Math.abs(owner.x - target.x) + RANK_GAP_PX)
        : baseDistance;
      line.forEach((guard, index) => {
        targets.set(guard.id, target.x + side * (firstDistance + index * spacing));
      });
    }
  }
  return targets;
}

/**
 * 공격권을 쥔 근접 경비 몸과 그 뒤 첫 대기 경비 사이 간격(px). 전열 간격(22px)은 두 인간형 실루엣이 반쯤
 * 포개진다 — 어깨가 겨우 닿는 거리로 벌린다(2026-09-26 경비 필름 pile-on-same-side 애니메이터 리뷰).
 */
const RANK_GAP_PX = 40;

/** 대상 기준 경비가 선 쪽. 같은 x 면 보는 방향의 반대쪽이다. */
function sideOf(guard: GuardState, target: Vec2): -1 | 1 {
  const dx = guard.x - target.x;
  return dx < 0 ? -1 : dx > 0 ? 1 : guard.facing === 1 ? -1 : 1;
}

/**
 * 같은 쪽에서 몸 하나 넘게 더 가까이 선 근접 경비가 있으면, 이 근접 경비는 뒷줄이다. 뒷줄이 공격권을 받으면
 * 앞 사람 몸을 관통해 걸어 나와 두 실루엣이 포개진다 — 앞줄이 비킬 때까지 공격권을 받지 않는다.
 * 석궁(원거리)은 몸 너머로 쏘므로 막히지 않는다.
 */
function blockedByFrontRank(guard: GuardState, guards: readonly GuardState[], target: Vec2, tuning: Tuning): boolean {
  if (attackKindOf(guard) !== "melee") return false;
  const side = sideOf(guard, target);
  const distance = Math.abs(guard.x - target.x);
  return guards.some((other) => other.id !== guard.id
    && attackKindOf(other) === "melee"
    && canPressure(other, target, tuning)
    && sideOf(other, target) === side
    && distance - Math.abs(other.x - target.x) > tuning.movement.bodyWidth);
}

function isCommitted(guard: GuardState): boolean {
  const combat = guard.combat;
  return GuardStatusRules.canJoinCombat(guard)
    && combat !== null
    && (combat.phase === "windup" || combat.phase === "strike" || combat.phase === "recovery");
}

function canClaim(
  guard: GuardState,
  target: Vec2,
  tuning: Tuning,
  visuallyEligibleGuardIds?: readonly string[],
): boolean {
  return canApproach(guard, target, tuning, visuallyEligibleGuardIds);
}

function canApproach(
  guard: GuardState,
  target: Vec2,
  tuning: Tuning,
  visuallyEligibleGuardIds?: readonly string[],
): boolean {
  const profile = archetypeOf(guard.archetypeId).combat;
  const combat = guard.combat;
  if (profile === undefined || combat === null || !GuardStatusRules.canJoinCombat(guard)) return false;
  if (guard.susp.tier !== "spotted" || combat.phase !== "ready") return false;
  if (visuallyEligibleGuardIds !== undefined && !visuallyEligibleGuardIds.includes(guard.id)) return false;
  if (!onSameFloor(target.y, guard.y, tuning.world.floorHeightPx)) return false;
  const claimRange = Math.max(
    profile.engageRangePx,
    tuning.combat.pressureDistancePx + tuning.combat.pressureSpacingPx * 4,
  );
  if (Math.abs(target.x - guard.x) > claimRange) return false;
  return profile.attackKind === "ranged" || (target.x - guard.x) * guard.facing >= -FORWARD_OVERLAP_PX;
}

function canPressure(guard: GuardState, target: Vec2, tuning: Tuning): boolean {
  return guard.susp.tier === "spotted"
    && GuardStatusRules.canJoinCombat(guard)
    && onSameFloor(target.y, guard.y, tuning.world.floorHeightPx);
}

/** locale 설정에 영향받지 않는 UTF-16 코드 단위 순서. 리플레이 타이브레이크 전용이다. */
function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function attackKindOf(guard: GuardState): CombatProfile["attackKind"] | null {
  return archetypeOf(guard.archetypeId).combat?.attackKind ?? null;
}

function rememberOwner(recentGuardIds: readonly string[], ownerGuardId: string): readonly string[] {
  return [...recentGuardIds.filter((id) => id !== ownerGuardId), ownerGuardId].slice(-8);
}

/** 이력에 없으면 -1, 오래전에 공격했을수록 작은 값이라 우선된다. */
function recencyRank(guardId: string, recentGuardIds: readonly string[]): number {
  return recentGuardIds.indexOf(guardId);
}
