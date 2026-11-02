import type { RngState } from "./types";

/**
 * mulberry32 시드 PRNG.
 *
 * Math.random() 을 쓰지 않는 이유는 결정론적 리플레이 때문이다.
 * 시드 + 기록된 InputFrame 시퀀스만으로 런 전체가 바이트 동일하게 재생되어야
 * 버그 리포트·밸런스 회귀 테스트가 성립한다.
 *
 * 모든 함수는 상태를 변형하지 않고 새 상태를 반환한다.
 */

export function createRng(seed: number): RngState {
  // 0 시드는 mulberry32 에서 퇴화하므로 회피한다.
  const normalized = (Math.trunc(seed) >>> 0) || 0x9e3779b9;
  return { seed: normalized };
}

export interface RngDraw {
  readonly state: RngState;
  /** [0, 1) */
  readonly value: number;
}

export function nextFloat(state: RngState): RngDraw {
  let t = (state.seed + 0x6d2b79f5) >>> 0;
  const advanced: RngState = { seed: t };
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { state: advanced, value };
}

/** [minInclusive, maxExclusive) 정수. */
export function nextInt(state: RngState, minInclusive: number, maxExclusive: number): { state: RngState; value: number } {
  const span = maxExclusive - minInclusive;
  if (span <= 0) {
    return { state, value: minInclusive };
  }
  const draw = nextFloat(state);
  return { state: draw.state, value: minInclusive + Math.floor(draw.value * span) };
}

/** probability 확률로 true. probability <= 0 이면 항상 false, >= 1 이면 항상 true. */
export function nextChance(state: RngState, probability: number): { state: RngState; value: boolean } {
  const draw = nextFloat(state);
  return { state: draw.state, value: draw.value < probability };
}

/** 원본을 변형하지 않고 셔플된 새 배열을 반환한다 (Fisher-Yates). */
export function shuffled<T>(state: RngState, items: readonly T[]): { state: RngState; value: T[] } {
  const out = items.slice();
  let cursor = state;
  for (let i = out.length - 1; i > 0; i -= 1) {
    const draw = nextInt(cursor, 0, i + 1);
    cursor = draw.state;
    const a = out[i];
    const b = out[draw.value];
    if (a === undefined || b === undefined) continue;
    out[i] = b;
    out[draw.value] = a;
  }
  return { state: cursor, value: out };
}
