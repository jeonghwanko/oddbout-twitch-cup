import { NATIVE_CITY_COMBAT, type NativeCityFightBarTuning } from "../../sim/cityFight/NativeCityCombatTuning";
import { clamp01 } from "../../sim/geom";

/**
 * 싸움 HP 막대의 순수 곡선(2026-10-10 3단계): 글자 없는 큰 막대 — 맞으면 채움이 바로 떨어지고, 깎인 몫이 흰 덩어리로 `holdMs` 머물렀다가
 * (그 안에 또 맞으면 같은 덩어리에 더해지고 다시 머문다 — 연타가 한 입으로 읽힌다) `drainMs` 동안 채움까지 빠진다(KOF·SF 의 흰 체력).
 * 맞은 직후 `flashMs` 는 순백, 그 뒤 상아빛. 흔들림은 감쇠하는 사인. 자리: 화면 위 한가운데, 상대 이름 아래(2026-10-17). 뷰는
 * `NativeCityFightHpBarView`, 수치는 `native-city-combat.json` `feel.fightBar`. 시계는 화면 ms.
 */

const TUNING: NativeCityFightBarTuning = NATIVE_CITY_COMBAT.feel.fightBar;

/** One bar's drain state (HP units). */
export interface NativeCityFightBarDrain {
  /** The fill: HP now. */
  readonly hp: number;
  /** The white chunk's top (≥ `hp`): what the fill was before the blows still showing. */
  readonly white: number;
  /** Where the current drain started (HP). */
  readonly from: number;
  /** Ms left before the chunk drains (≤ 0: draining, −ms into it). */
  readonly holdMs: number;
  /** Ms since the last blow (the chunk's white flash and the shake); +∞ before any. */
  readonly sinceHitMs: number;
}

export function createNativeCityFightBarDrain(hp: number): NativeCityFightBarDrain {
  return { hp, white: hp, from: hp, holdMs: 0, sinceHitMs: Number.POSITIVE_INFINITY };
}

/**
 * One frame with the HP now: a drop drops the fill at once and holds the chunk where its top already is (the HP before the first blow
 * of a run still showing), for `holdMs` again; then it eases (out) down to the fill over `drainMs`. A rise (a rematch, a refill) snaps
 * both up — it never drains upward.
 */
export function stepNativeCityFightBarDrain(state: NativeCityFightBarDrain, hp: number, dtMs: number,
  t: NativeCityFightBarTuning = TUNING): NativeCityFightBarDrain {
  const dt = Number.isFinite(dtMs) ? Math.max(0, dtMs) : 0, now = Number.isFinite(hp) ? hp : state.hp;
  if (now > state.hp + 1e-9) return { hp: now, white: now, from: now, holdMs: 0, sinceHitMs: state.sinceHitMs + dt };
  if (now < state.hp - 1e-9) {
    const white = Math.max(state.white, state.hp);
    return { hp: now, white, from: white, holdMs: t.holdMs, sinceHitMs: 0 };
  }
  if (state.white <= now + 1e-9) return { ...state, hp: now, white: now, from: now, sinceHitMs: state.sinceHitMs + dt };
  const holdMs = state.holdMs - dt;
  if (holdMs > 0) return { ...state, hp: now, holdMs, sinceHitMs: state.sinceHitMs + dt };
  const u = clamp01(-holdMs / Math.max(1, t.drainMs)), eased = 1 - (1 - u) ** 3;
  return { hp: now, white: u >= 1 ? now : state.from + (now - state.from) * eased, from: state.from, holdMs, sinceHitMs: state.sinceHitMs + dt };
}

/** The chunk's colour step now: pure white just after a blow, ivory while it waits and drains. */
export function nativeCityFightBarFlash(state: NativeCityFightBarDrain, t: NativeCityFightBarTuning = TUNING): boolean {
  return state.sinceHitMs < t.flashMs;
}

/** The bar's horizontal shake now (screen px): a decaying sine after a blow; 0 under reduced motion or once settled. */
export function nativeCityFightBarShakePx(state: NativeCityFightBarDrain, reduced = false, t: NativeCityFightBarTuning = TUNING): number {
  if (reduced || !(state.sinceHitMs < t.shakeMs)) return 0;
  const u = state.sinceHitMs / Math.max(1, t.shakeMs);
  return t.shakePx * (1 - u) ** 2 * Math.sin(2 * Math.PI * t.shakeHz * state.sinceHitMs / 1000);
}

/** The face thumbnail beside a bar (logical px): its side and its gap to the bar's full (anchored) end. */
export const FIGHT_BAR_THUMB = Object.freeze({ px: 46, gapPx: 10 });

/**
 * Where the bar sits on a `width` × `height` screen (px): its left / top, size and the quarter ticks' x. `mirror`: full at its right (outer)
 * end, drained from its left (inner) one.
 */
export interface NativeCityFightBarLayout {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly ticks: readonly number[];
  readonly mirror: boolean;
}


export function nativeCityFightBarLayout(width: number, height: number, t: NativeCityFightBarTuning = TUNING,
  segments = t.ticks): NativeCityFightBarLayout {
  const w = Math.max(0, width), h = Math.max(0, height), margin = Math.max(0, t.edgeMarginPx);
  const barWidth = Math.max(0, Math.min(w - 2 * margin, Math.max(t.minWidthPx, Math.min(t.maxWidthPx, w * t.widthShare))));
  const left = (w - barWidth) / 2, top = Math.max(2, h * t.topShare - t.heightPx / 2), parts = Math.max(1, Math.floor(segments));
  const ticks: number[] = [];
  for (let i = 1; i < parts; i++) ticks.push(left + barWidth * i / parts);
  return { left, top, width: barWidth, height: t.heightPx, ticks, mirror: false };
}

/**
 * The shift lines a drop crossed (`kuma.phases`, 2026-10-15 3단계 근무): the indices of `shares` (HP shares of `maxHp`) the HP went from
 * above to at or under between `before` and `after`. A rise (a rematch) crosses none.
 */
export function nativeCityFightBarLinesCrossed(before: number, after: number, maxHp: number, shares: readonly number[]): number[] {
  const crossed: number[] = [];
  shares.forEach((share, index) => {
    const at = share * maxHp;
    if (before > at + 1e-9 && after <= at + 1e-9) crossed.push(index);
  });
  return crossed;
}
