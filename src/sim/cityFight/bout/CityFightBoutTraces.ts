import type { CityPoint } from "../../../world/NativeCityDefinition";

/**
 * 무대에 남는 흔적(2026-10-22 4차, ODDBOUT — 사용자: "다채롭고 도파민 터지게", 추천 6번): 파이터끼리 경기에서 기술이 무대에 자국을 남긴다.
 *
 * - 얼음(`ice`): 배 슬라이드(행 `skill.leaves: "ice"`)가 달린 자리에 `everyStrides`마다 얼음판이 깔린다. 주인이 아닌 쪽이 그 위에 서서
 *   맞으면 `pushScale`배 더 미끄러진다(줄 끝 쾅이 잦아진다).
 * - 구멍(`hole`): 잠복의 출구(행 `skill.leaves: "hole"`)에 구멍이 남는다. 주인이 아닌 쪽이 땅 위로 걷거나 달리다 들어서면 한 번 걸려
 *   `tripMs` 휘청이고 `tripDamage`(HP)를 잃는다. 걸린 구멍은 메워진다.
 *
 * 흔적은 `ms` 뒤 사라진다. 결정적이다(난수를 쓰지 않는다). 흔적을 남기는 기술이 없는 경기는 그대로다. 표(`city-tournament.json`
 * bout.traces)가 없으면 아무 흔적도 없다.
 */
export type CityFightBoutTraceKind = "ice" | "hole";

/** The traces' numbers (`city-tournament.json` bout.traces). Distances are strides. */
export interface CityFightBoutTraceTuning {
  readonly ice: { readonly everyStrides: number; readonly radiusStrides: number; readonly ms: number; readonly pushScale: number };
  readonly hole: { readonly radiusStrides: number; readonly ms: number; readonly tripMs: number; readonly tripDamage: number };
}

/** One trace on the arena's line. */
export interface CityFightBoutTrace {
  readonly id: number;
  readonly kind: CityFightBoutTraceKind;
  /** The corner whose skill left it (it does not catch him). */
  readonly owner: 0 | 1;
  readonly point: CityPoint;
  readonly radiusUnits: number;
  /** Fight ms it has left, and its whole life (the view fades its end). */
  readonly leftMs: number;
  readonly ms: number;
}

/** At most this many traces lie on the arena at once: the oldest goes first. */
export const CITY_FIGHT_BOUT_MAX_TRACES = 24;

/** `traces` with `trace` added (the oldest dropped past `CITY_FIGHT_BOUT_MAX_TRACES`). */
export function addCityFightBoutTrace(traces: readonly CityFightBoutTrace[], trace: CityFightBoutTrace): readonly CityFightBoutTrace[] {
  const next = [...traces, Object.freeze(trace)];
  return Object.freeze(next.slice(Math.max(0, next.length - CITY_FIGHT_BOUT_MAX_TRACES)));
}

/** `dtMs` of fight time: every trace's life runs down; the spent ones go. */
export function stepCityFightBoutTraces(traces: readonly CityFightBoutTrace[], dtMs: number): readonly CityFightBoutTrace[] {
  if (traces.length === 0) return traces;
  return Object.freeze(traces.map(trace => ({ ...trace, leftMs: trace.leftMs - dtMs })).filter(trace => trace.leftMs > 0).map(trace => Object.freeze(trace)));
}

/**
 * The first trace of `kind` under `point` that is not corner `corner`'s own, else null. `reach`: how far past its edge it still catches (a
 * foot's reach — the hole under the gopher's own feet catches the one who walks up to him; plan units, 0 by default).
 */
export function cityFightBoutTraceUnder(traces: readonly CityFightBoutTrace[], point: CityPoint, kind: CityFightBoutTraceKind, corner: 0 | 1,
  reach = 0): CityFightBoutTrace | null {
  return traces.find(trace => trace.kind === kind && trace.owner !== corner
    && Math.hypot(point[0] - trace.point[0], point[1] - trace.point[1]) <= trace.radiusUnits + Math.max(0, reach)) ?? null;
}
