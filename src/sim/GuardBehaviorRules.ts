import type { GuardArchetypeId } from "./GuardArchetypes";

/** 자유 프롬프트가 컴파일될 수 있는 경비만 공개 계약에 노출한다. */
export const INVITATION_GUARD_ARCHETYPE_IDS = Object.freeze([
  "patroller",
  "warden",
  "bruiser",
] as const satisfies readonly GuardArchetypeId[]);

export type InvitationGuardArchetypeId = (typeof INVITATION_GUARD_ARCHETYPE_IDS)[number];
export const GUARD_BEHAVIOR_LEVELS = Object.freeze(["subtle", "standard", "intense"] as const);
export type GuardBehaviorLevel = (typeof GUARD_BEHAVIOR_LEVELS)[number];

/**
 * AI가 자유 문장을 이 닫힌 계약으로만 컴파일한다.
 *
 * 런타임은 prompt나 모델 출력을 보지 않는다. 버전과 enum만 읽기 때문에 같은
 * 레이아웃·입력은 네트워크나 모델 상태와 무관하게 재현된다.
 */
export interface GuardBehaviorPolicy {
  readonly version: 1;
  readonly archetype: InvitationGuardArchetypeId;
  readonly awareness: GuardBehaviorLevel;
  readonly patrolTempo: GuardBehaviorLevel;
  readonly pursuit: GuardBehaviorLevel;
  readonly searchPersistence: GuardBehaviorLevel;
}

export interface GuardBehaviorModifiers {
  readonly viewRangeMul: number;
  readonly hearRangeMul: number;
  readonly patrolSpeedMul: number;
  readonly patrolDwellMul: number;
  readonly chaseSpeedMul: number;
  readonly searchDwellMul: number;
  /** 기본 수색 후보 수에 더한다. 최소 한 곳은 항상 확인한다. */
  readonly searchNodeBonus: number;
}

const AWARENESS_MUL: Readonly<Record<GuardBehaviorLevel, number>> = Object.freeze({
  subtle: 0.9,
  standard: 1,
  intense: 1.12,
});
const PATROL_SPEED_MUL: Readonly<Record<GuardBehaviorLevel, number>> = Object.freeze({
  subtle: 0.9,
  standard: 1,
  intense: 1.1,
});
const PATROL_DWELL_MUL: Readonly<Record<GuardBehaviorLevel, number>> = Object.freeze({
  subtle: 1.15,
  standard: 1,
  intense: 0.85,
});
const PURSUIT_MUL: Readonly<Record<GuardBehaviorLevel, number>> = Object.freeze({
  subtle: 0.92,
  standard: 1,
  intense: 1.1,
});
const SEARCH_DWELL_MUL: Readonly<Record<GuardBehaviorLevel, number>> = Object.freeze({
  subtle: 0.8,
  standard: 1,
  intense: 1.25,
});
const SEARCH_NODE_BONUS: Readonly<Record<GuardBehaviorLevel, number>> = Object.freeze({
  subtle: -1,
  standard: 0,
  intense: 2,
});

export const STANDARD_GUARD_BEHAVIOR_MODIFIERS: GuardBehaviorModifiers = Object.freeze({
  viewRangeMul: 1,
  hearRangeMul: 1,
  patrolSpeedMul: 1,
  patrolDwellMul: 1,
  chaseSpeedMul: 1,
  searchDwellMul: 1,
  searchNodeBonus: 0,
});

export function isInvitationGuardArchetypeId(value: unknown): value is InvitationGuardArchetypeId {
  return typeof value === "string"
    && (INVITATION_GUARD_ARCHETYPE_IDS as readonly string[]).includes(value);
}

export function isGuardBehaviorLevel(value: unknown): value is GuardBehaviorLevel {
  return typeof value === "string" && (GUARD_BEHAVIOR_LEVELS as readonly string[]).includes(value);
}

export function isGuardBehaviorPolicy(value: unknown): value is GuardBehaviorPolicy {
  if (typeof value !== "object" || value === null) return false;
  const keys = Object.keys(value);
  if (
    keys.length !== 6
    || !["version", "archetype", "awareness", "patrolTempo", "pursuit", "searchPersistence"]
      .every((key) => keys.includes(key))
  ) return false;
  const policy = value as Partial<GuardBehaviorPolicy>;
  return policy.version === 1
    && isInvitationGuardArchetypeId(policy.archetype)
    && isGuardBehaviorLevel(policy.awareness)
    && isGuardBehaviorLevel(policy.patrolTempo)
    && isGuardBehaviorLevel(policy.pursuit)
    && isGuardBehaviorLevel(policy.searchPersistence);
}

export function behaviorModifiersOf(policy: GuardBehaviorPolicy | undefined): GuardBehaviorModifiers {
  if (policy === undefined) return STANDARD_GUARD_BEHAVIOR_MODIFIERS;
  return {
    viewRangeMul: AWARENESS_MUL[policy.awareness],
    hearRangeMul: AWARENESS_MUL[policy.awareness],
    patrolSpeedMul: PATROL_SPEED_MUL[policy.patrolTempo],
    patrolDwellMul: PATROL_DWELL_MUL[policy.patrolTempo],
    chaseSpeedMul: PURSUIT_MUL[policy.pursuit],
    searchDwellMul: SEARCH_DWELL_MUL[policy.searchPersistence],
    searchNodeBonus: SEARCH_NODE_BONUS[policy.searchPersistence],
  };
}

export function guardBehaviorLevelLabel(level: GuardBehaviorLevel): string {
  if (level === "subtle") return "느긋";
  if (level === "intense") return "강렬";
  return "표준";
}

export function guardBehaviorSummary(policy: GuardBehaviorPolicy): string {
  return [
    `눈썰미 ${guardBehaviorLevelLabel(policy.awareness)}`,
    `순찰 ${guardBehaviorLevelLabel(policy.patrolTempo)}`,
    `추격 ${guardBehaviorLevelLabel(policy.pursuit)}`,
    `수색 ${guardBehaviorLevelLabel(policy.searchPersistence)}`,
  ].join(" · ");
}
