import { archetypeOf } from "./GuardArchetypes";
import type { GuardState } from "./GuardPlanner";
import { canAct } from "./GuardStatusRules";
import { onSameFloor } from "./geom";
import { isBehind } from "./CombatRules";
import type { Tuning } from "./tuning";
import type { Vec2 } from "./GeometryTypes";
import { clamp01 } from "./geom";

export interface WardenTacticCue {
  readonly kind: "opening" | "turn-warning";
  readonly remainingMs: number;
  readonly progress: number;
}

/** 판정·충돌·HUD가 공유하는 반장의 현재 통과 가능 상태. */
export function openingActive(guard: GuardState, tuning: Tuning): boolean {
  if (
    guard.archetypeId !== "warden"
    || !canAct(guard)
    || guard.susp.tier !== "calm"
    || guard.mode !== "patrol"
    || guard.moving
    || guard.dwellMs <= 0
  ) return false;

  const archetype = archetypeOf("warden");
  const turnWindupMs = archetype.turnWindupMs ?? tuning.guard.turnWindupMs;
  return !guard.turnPending || guard.dwellMs > turnWindupMs;
}

/**
 * 튜토리얼 반장이 약속한 빈틈을 실제로 보장하는가.
 * AI 지각·몸 통과·HUD가 이 상태를 함께 써야 질주 발소리가 빈틈 자체를 취소하지 않는다.
 */
export function guaranteedOpeningActive(guard: GuardState, tuning: Tuning): boolean {
  return guard.openingPassEnabled === true && openingActive(guard, tuning);
}

/** 현재 반장 빈틈에서 실제 몸 통과가 허용되는가. */
export function bodyPassActive(guard: GuardState, tuning: Tuning): boolean {
  return guaranteedOpeningActive(guard, tuning);
}

/** 괴도의 눈이나 HUD가 현재 방향을 안전 빈틈으로 읽을 수 있는가. */
export function openingCanBeConfirmed(
  guard: GuardState,
  playerAt: Vec2,
  tuning: Tuning,
): boolean {
  if (!openingActive(guard, tuning)) return false;
  if (!onSameFloor(playerAt.y, guard.y, tuning.world.floorHeightPx)) return false;
  const archetype = archetypeOf("warden");
  return Math.abs(playerAt.x - guard.x) <= archetype.viewRange + 100
    && isBehind(playerAt, { x: guard.x, y: guard.y }, guard.facing);
}

/** 판정·튜토리얼·HUD가 공유하는 경비반장의 현재 통과 창. */
export function tacticCue(
  guard: GuardState,
  playerAt: Vec2,
  tuning: Tuning,
): WardenTacticCue | null {
  if (
    guard.archetypeId !== "warden"
    || !canAct(guard)
    || guard.susp.tier !== "calm"
    || guard.mode !== "patrol"
    || guard.moving
    || guard.dwellMs <= 0
    || !onSameFloor(playerAt.y, guard.y, tuning.world.floorHeightPx)
  ) return null;

  const archetype = archetypeOf("warden");
  if (Math.abs(playerAt.x - guard.x) > archetype.viewRange + 100) return null;
  const turnWindupMs = archetype.turnWindupMs ?? tuning.guard.turnWindupMs;
  if (guard.turnPending && guard.dwellMs <= turnWindupMs) {
    return {
      kind: "turn-warning",
      remainingMs: guard.dwellMs,
      progress: clamp01(1 - guard.dwellMs / Math.max(1, turnWindupMs)),
    };
  }
  if (!openingCanBeConfirmed(guard, playerAt, tuning)) return null;
  return {
    kind: "opening",
    remainingMs: guard.turnPending ? guard.dwellMs - turnWindupMs : guard.dwellMs,
    progress: 0,
  };
}
