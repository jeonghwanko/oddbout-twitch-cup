import type { CombatState } from "./CombatRules";
import type { GuardArchetypeId } from "./GuardArchetypes";
import type { GuardPoise } from "./StaggerResistanceRules";
import type { Tuning } from "./tuning";
import { DEFAULT_TUNING } from "./tuning";

export type GuardCondition = "active" | "staggered" | "knocked-out" | "defeated";

export interface GuardStatusLike {
  readonly archetypeId: GuardArchetypeId;
  readonly previewOnly?: boolean;
  readonly climbLinkId: string | null;
  readonly staggerMs: number;
  readonly knockedOut: boolean;
  readonly knockoutMs: number;
  readonly combat: CombatState | null;
}

export interface GuardTerminalLike {
  readonly knockedOut: boolean;
  readonly combat: Pick<CombatState, "defeated"> | null;
}

export interface LureInspectionLike {
  readonly mode: string;
  readonly moving: boolean;
  readonly lureInspection: { readonly dwellMs: number; readonly started: boolean };
}

/** 착탄점 앞에서 멈춰 실제로 유인구를 내려다보는 통과 가능 상태인가. */
export function isInspectingLure(guard: LureInspectionLike): boolean {
  return guard.mode === "investigate"
    && !guard.moving
    && guard.lureInspection.dwellMs > 0
    && guard.lureInspection.started;
}

export function conditionOf(guard: GuardStatusLike): GuardCondition {
  if (guard.combat?.defeated === true) return "defeated";
  if (guard.knockedOut) return "knocked-out";
  if (guard.staggerMs > 0) return "staggered";
  return "active";
}

export function isInactive(guard: GuardTerminalLike): boolean {
  return guard.knockedOut || guard.combat?.defeated === true;
}

export function canAct(guard: GuardStatusLike): boolean {
  return guard.previewOnly !== true && conditionOf(guard) === "active";
}

export function canJoinCombat(guard: GuardStatusLike): boolean {
  return canAct(guard) && guard.combat !== null;
}

/**
 * 명시적 계약의 발각 순간 코믹 넘어짐을 사용할 수 있는가.
 * 전투 적은 접촉을 공격 선딜로 이어 가며, 감시 장치는 사람처럼 넘어지지 않는다.
 */
export function canPratfallOnSpotted(guard: GuardStatusLike): boolean {
  return guard.previewOnly !== true
    && !isInactive(guard)
    && guard.combat === null
    && guard.archetypeId !== "candelabra";
}

/** 사람 경비만 플레이어를 붙잡는다. 고정형 감시 촛대는 발각·경보만 만들 수 있다. */
export function canCapturePlayer(guard: GuardStatusLike): boolean {
  return canAct(guard)
    && guard.archetypeId !== "candelabra"
    && guard.climbLinkId === null;
}

/** 플레이어 공격·밀치기 연쇄가 월드의 실제 경비로 취급할 수 있는가. */
export function canBeCombatTarget(guard: GuardStatusLike): boolean {
  return guard.previewOnly !== true
    && !isInactive(guard)
    && guard.archetypeId !== "candelabra"
    && guard.climbLinkId === null;
}

export function canBeSubdued(guard: GuardStatusLike): boolean {
  return guard.previewOnly !== true
    && !isInactive(guard)
    && guard.archetypeId !== "candelabra"
    && guard.combat === null
    && guard.climbLinkId === null;
}

export function canBePickpocketed(guard: GuardStatusLike): boolean {
  return canBeSubdued(guard);
}

export function canBeDragged(guard: GuardStatusLike): boolean {
  return conditionOf(guard) === "knocked-out"
    && guard.combat === null
    && guard.archetypeId !== "candelabra";
}

/**
 * 이번 프레임의 보행만 멈춘다. 사다리·포박 접촉은 그대로 둔다.
 *
 * 좌표를 강제로 밀어 넣는 쪽(올가미 경직, 소품 충돌 밀림)이 `moving: false` 를 스스로 쓰면
 * `GuardPlanner` 만 갖던 파생 규칙이 조용히 두 곳으로 갈라진다. 그래서 쓰기 자체를 여기로 모은다.
 * 비활성(기절·전투 패배) 전환에는 `immobilize` 를 쓴다 — 그쪽은 사다리·접촉까지 정리해야 한다.
 */
export function haltGuardMovement<T extends { readonly moving: boolean }>(guard: T): T {
  return { ...guard, moving: false };
}

/** 비활성 전환 프레임에 이전 이동·사다리·포박 접촉을 남기지 않는다. */
export function immobilize<T extends { readonly moving: boolean; readonly climbLinkId: string | null; readonly contactMs: number }>(
  guard: T,
): T {
  return { ...haltGuardMovement(guard), climbLinkId: null, contactMs: 0 };
}

/**
 * 저장/테스트 픽스처가 만들 수 있는 모순을 진단한다. 빈 배열이면 유효하다.
 *
 * 경직 저항(`poise`)은 `StaggerResistanceRules` 가 소유하지만 범위 검사는 여기 있다 —
 * 불변조건 등록소가 경비 한 명당 하나여야 진단이 한 줄로 읽힌다.
 */
export function invariantViolations(
  guard: GuardStatusLike & {
    readonly moving: boolean;
    readonly contactMs: number;
    readonly poise: GuardPoise;
  },
  tuning: Tuning = DEFAULT_TUNING,
): readonly string[] {
  const violations: string[] = [];
  const { hits, windowMs, brokenMs } = guard.poise;
  if (hits < 0 || hits > tuning.combat.poiseHits) violations.push("poise-hits-out-of-range");
  if (windowMs < 0) violations.push("poise-window-negative");
  if (brokenMs < 0 || brokenMs > tuning.combat.poiseBreakMs) violations.push("poise-break-out-of-range");
  if (guard.knockedOut && guard.combat?.defeated === true) violations.push("multiple-terminal-conditions");
  if (guard.knockedOut && guard.combat !== null) violations.push("knockout-with-combat");
  if (guard.knockedOut && guard.knockoutMs <= 0) violations.push("knockout-without-timer");
  if (!guard.knockedOut && guard.knockoutMs > 0) violations.push("timer-without-knockout");
  if (guard.combat?.defeated === true && guard.combat.hp > 0) violations.push("defeated-with-hp");
  if (guard.combat !== null && !guard.combat.defeated && guard.combat.hp <= 0) violations.push("active-without-hp");
  if (isInactive(guard) && guard.moving) violations.push("inactive-moving");
  if (isInactive(guard) && guard.climbLinkId !== null) violations.push("inactive-climbing");
  if (isInactive(guard) && guard.contactMs > 0) violations.push("inactive-contact");
  return violations;
}
