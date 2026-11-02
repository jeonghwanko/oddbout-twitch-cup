/**
 * 싸움 시계 ↔ 원화 시계의 시간 왜곡(2026-10-09 템포, `tempo`). 원화 칸은 그대로 두고 구간마다 길이만 바꾼다 — 예비 동작은 그린
 * 그대로, 정점 유지·착지·꼬리는 정해진 길이로 접고, 나머지는 배속으로. 접촉 칸의 순번은 그대로라 판정 시각·반격 창·헛침이 함께
 * 움직인다.
 *
 * 구간(`NativeCityWarpSection`)은 원화 ms [artFrom, artTo) 를 싸움 ms `fightMs` 로 고르게 늘이거나 줄인다. 이어진 구간들이
 * 하나의 꺾은선(`NativeCityClipWarp`)이 되고, 두 방향으로 읽는다(`nativeCityWarpFightMs` 원화 → 싸움, `nativeCityWarpArtMs` 싸움 →
 * 원화). 길이 0 인 구간은 버린다.
 */

export interface NativeCityWarpSection {
  readonly artFrom: number;
  readonly artTo: number;
  /** Fight ms this stretch of art lasts. */
  readonly fightMs: number;
}

/** A piecewise-linear map: knots at the same index pair a clip ms (`art`) with a fight ms (`fight`), both non-decreasing. */
export interface NativeCityClipWarp {
  readonly art: readonly number[];
  readonly fight: readonly number[];
}

/** A section that plays its art at `rate` (2 = twice as fast). */
export function nativeCityRateSection(artFrom: number, artTo: number, rate: number): NativeCityWarpSection {
  return { artFrom, artTo, fightMs: Math.max(0, artTo - artFrom) / Math.max(1e-6, rate) };
}

/** A section squeezed (or stretched) to `fightMs`. */
export function nativeCityFixedSection(artFrom: number, artTo: number, fightMs: number): NativeCityWarpSection {
  return { artFrom, artTo, fightMs: Math.max(0, fightMs) };
}

/** The warp of contiguous sections (sorted by art time; empty ones are dropped). The first knot is (0, first section's start). */
export function nativeCityClipWarp(sections: readonly NativeCityWarpSection[]): NativeCityClipWarp {
  const kept = sections.filter(section => section.artTo - section.artFrom > 1e-9);
  if (kept.length === 0) return { art: [0, 0], fight: [0, 0] };
  const art = [kept[0]!.artFrom], fight = [0];
  for (const section of kept) {
    art.push(section.artTo);
    fight.push(fight.at(-1)! + section.fightMs);
  }
  return { art, fight };
}

/** Fight ms the warp lasts. */
export function nativeCityWarpTotalMs(warp: NativeCityClipWarp): number {
  return warp.fight.at(-1) ?? 0;
}

function interpolate(from: readonly number[], to: readonly number[], value: number): number {
  const n = from.length;
  if (n === 0) return 0;
  if (!(value > from[0]!)) return to[0]!;
  for (let i = 1; i < n; i++) {
    if (value <= from[i]! + 1e-9) {
      const span = from[i]! - from[i - 1]!;
      return span <= 1e-9 ? to[i]! : to[i - 1]! + (to[i]! - to[i - 1]!) * (value - from[i - 1]!) / span;
    }
  }
  return to[n - 1]!;
}

/** The fight ms at which clip ms `artMs` is drawn (clamped to the warp). */
export function nativeCityWarpFightMs(warp: NativeCityClipWarp, artMs: number): number {
  return interpolate(warp.art, warp.fight, artMs);
}

/** The clip ms drawn `fightMs` into the warp (clamped to the warp). */
export function nativeCityWarpArtMs(warp: NativeCityClipWarp, fightMs: number): number {
  return interpolate(warp.fight, warp.art, fightMs);
}
