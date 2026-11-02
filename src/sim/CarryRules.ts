import type { Tuning } from "./tuning";
import { clamp } from "./geom";
import type { LootId } from "./LootRules";

/**
 * 적재 규칙.
 *
 * 이 설계의 척추. 탐욕은 플레이어를 느리게 만드는 데 그치지 않고
 * 이동 그래프에서 경로 자체를 삭제한다. 빈손으로 정찰한 탈출로가
 * 만재 상태에서는 존재하지 않는다.
 */

export interface CarriedItem {
  readonly id: string;
  readonly lootId: LootId;
  readonly weight: number;
}

export interface CarryState {
  readonly items: readonly CarriedItem[];
  /** 과적 상태에서 물건을 흘리기까지 남은 시간. */
  readonly sinceSpillMs: number;
}

export function createCarry(): CarryState {
  return { items: [], sinceSpillMs: 0 };
}

export function totalWeight(state: CarryState): number {
  let sum = 0;
  for (const item of state.items) sum += item.weight;
  return sum;
}

/** 0 .. overloadRatio. 중량 페널티 전부가 이 값에서 파생된다. */
export function loadRatio(state: CarryState, tuning: Tuning): number {
  const max = tuning.carry.maxWeight;
  if (max <= 0) return 0;
  return clamp(totalWeight(state) / max, 0, tuning.carry.overloadRatio);
}

/** 과적 한계를 넘어서 더 담을 수 있는가. */
export function canPickUp(state: CarryState, weight: number, tuning: Tuning): boolean {
  const capacity = tuning.carry.maxWeight * tuning.carry.overloadRatio;
  return totalWeight(state) + weight <= capacity;
}

export function pickUp(state: CarryState, item: CarriedItem): CarryState {
  return { ...state, items: [...state.items, item] };
}

export function dropLast(state: CarryState): { state: CarryState; dropped: CarriedItem | null } {
  if (state.items.length === 0) return { state, dropped: null };
  const dropped = state.items[state.items.length - 1] ?? null;
  return { state: { ...state, items: state.items.slice(0, -1) }, dropped };
}

/** 핵심 목표처럼 버릴 수 없는 물건은 건너뛰고 가장 최근의 일반 전리품을 버린다. */
export function dropLastExcept(
  state: CarryState,
  protectedLootIds: readonly LootId[],
): { state: CarryState; dropped: CarriedItem | null } {
  for (let index = state.items.length - 1; index >= 0; index -= 1) {
    const item = state.items[index];
    if (item === undefined || protectedLootIds.includes(item.lootId)) continue;
    return {
      state: { ...state, items: state.items.filter((_candidate, candidateIndex) => candidateIndex !== index) },
      dropped: item,
    };
  }
  return { state, dropped: null };
}

export function dropById(state: CarryState, itemId: string): { state: CarryState; dropped: CarriedItem | null } {
  const dropped = state.items.find((i) => i.id === itemId) ?? null;
  if (dropped === null) return { state, dropped: null };
  return { state: { ...state, items: state.items.filter((i) => i.id !== itemId) }, dropped };
}

/** 이동 중 과적 유실 판정을 굴릴 시간이 되었는가. 난수 소비 여부도 이 계약을 따른다. */
export function overloadSpillDue(
  state: CarryState,
  moving: boolean,
  tuning: Tuning,
  dtMs: number,
): boolean {
  if (!moving || loadRatio(state, tuning) <= 1) return false;
  return tuning.carry.spillIntervalMs <= 0 || state.sinceSpillMs + dtMs >= tuning.carry.spillIntervalMs;
}

/**
 * 이동 중 과적 상태의 유실 타이머와 판정 결과를 적용한다.
 *
 * `spill` 은 호출부가 시드 PRNG로 미리 굴린 결과다. 이 함수 안에서 난수를 만들지 않아
 * 리플레이 결정론을 보존한다.
 */
export function stepOverloadSpill(
  state: CarryState,
  moving: boolean,
  spill: boolean,
  protectedLootIds: readonly LootId[],
  tuning: Tuning,
  dtMs: number,
): { state: CarryState; dropped: CarriedItem | null } {
  if (!moving || loadRatio(state, tuning) <= 1) {
    return state.sinceSpillMs === 0
      ? { state, dropped: null }
      : { state: { ...state, sinceSpillMs: 0 }, dropped: null };
  }

  const sinceSpillMs = state.sinceSpillMs + dtMs;
  if (tuning.carry.spillIntervalMs > 0 && sinceSpillMs < tuning.carry.spillIntervalMs) {
    return { state: { ...state, sinceSpillMs }, dropped: null };
  }

  const reset = { ...state, sinceSpillMs: 0 };
  if (!spill) return { state: reset, dropped: null };
  const dropped = dropLastExcept(reset, protectedLootIds);
  return { ...dropped, state: { ...dropped.state, sinceSpillMs: 0 } };
}

/**
 * 자루 시각 단계 0..3. UI 없이 중량 상태를 읽히게 하는 장치.
 */
export function sackStage(state: CarryState, tuning: Tuning): 0 | 1 | 2 | 3 {
  const ratio = loadRatio(state, tuning);
  if (ratio <= 0) return 0;
  if (ratio < 0.4) return 1;
  if (ratio < 0.85) return 2;
  return 3;
}
