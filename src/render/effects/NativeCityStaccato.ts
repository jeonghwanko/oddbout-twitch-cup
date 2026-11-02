import { NATIVE_CITY_COMBAT, type NativeCityStaccatoTuning } from "../../sim/cityFight/NativeCityCombatTuning";
import { ABSORBED_SCALE, REDUCED_MOTION_RECOIL_SCALE, victimReactionDurationMs, victimReactionSpec, type VictimHit, type VictimReactionTier } from "./VictimReactionPresentation";

/**
 * 마을 1:1 대결의 뚝뚝 끊기는 몸(2026-10-11, 사용자: "타격, 피격에 뚝뚝!! 경직으로 끊기는 맛"). KOF 식 리미티드 애니메이션 —
 * 한 방 위의 절차 층은 사이를 메우지 않는다: 키 자세로 한 프레임에 들어가 붙든다. 떨림은 사인이 아니라 `stepMs` 마다 좌우로
 * 계단을 밟으며 줄어든다. 규칙(접촉·멈춤·경직·넉백·패리 창)은 건드리지 않는 순수 그림 곡선이다. 수치는 `feel.staccato`.
 */

const TUNING: NativeCityStaccatoTuning = NATIVE_CITY_COMBAT.feel.staccato;

/** `t` snapped forward to the end of the step it falls in (0 stays 0): sample a curve there and the pose holds for the whole step. */
export function nativeCityStaccatoTime(t: number, stepMs: number = TUNING.stepMs): number {
  if (!(t > 0)) return 0;
  const step = Math.max(1, stepMs);
  return Math.ceil(t / step - 1e-9) * step;
}

/** A held key: 1 while `t < holdMs`, then each `tail` level for `stepMs`, then 0 (snapped home). */
export function nativeCityStaccatoHold(t: number, holdMs: number, tail: readonly number[] = TUNING.victim.tail,
  stepMs: number = TUNING.recoverStepMs): number {
  const at = Math.max(0, Number.isFinite(t) ? t : 0);
  if (at < holdMs) return 1;
  return tail[Math.floor((at - holdMs) / Math.max(1, stepMs))] ?? 0;
}

/** Snapping into a key: each of `keys` for `stepMs`, then 1 held. */
export function nativeCityStaccatoSnapIn(t: number, keys: readonly number[] = TUNING.anticipation,
  stepMs: number = TUNING.recoverStepMs): number {
  const at = Math.max(0, Number.isFinite(t) ? t : 0);
  return keys[Math.floor(at / Math.max(1, stepMs))] ?? 1;
}

/** The hold of a reaction `durationMs` long: `victim.holdShare` of it, snapped up to whole steps. */
export function nativeCityStaccatoHoldMs(durationMs: number, share: number = TUNING.victim.holdShare, t: NativeCityStaccatoTuning = TUNING): number {
  return nativeCityStaccatoTime(Math.max(0, durationMs) * share, t.stepMs);
}

/**
 * The stepped shake (px, signed): `shake[i] × peakPx` on step `i` (`stepMs` each) — constant inside a step, alternating sides,
 * shrinking step by step; only the steps that start before `lengthMs`. None under reduced motion.
 */
export function nativeCityStaccatoShake(ageMs: number, peakPx: number, lengthMs: number, reduced = false,
  t: NativeCityStaccatoTuning = TUNING): number {
  if (reduced || !(peakPx > 0)) return 0;
  const step = Math.max(1, t.stepMs), i = Math.floor(Math.max(0, ageMs) / step);
  if (i * step >= lengthMs) return 0;
  return peakPx * (t.shake[i] ?? 0);
}

/** The body height (px) the struck body's offsets are authored at (`VictimReactionPresentation`): scale them by `bodyPx / this`. */
export const NATIVE_CITY_VICTIM_REFERENCE_BODY_PX = 150;
/** Screen time the struck body keeps after its tier's reaction length (the tremble's last steps). */
const VICTIM_SCREEN_TAIL_MS = 200;

/** The struck body's reaction is over: its tier's length passed on the fight clock, and that plus the tremble's tail on screen time. */
export function nativeCityVictimReactionOver(tier: VictimReactionTier, screenMs: number, fightMs: number): boolean {
  const duration = victimReactionDurationMs(tier);
  return fightMs >= duration && screenMs >= duration + VICTIM_SCREEN_TAIL_MS;
}

/** The struck body's procedural layer this frame (the `NATIVE_CITY_VICTIM_REFERENCE_BODY_PX` reference body). */
export interface NativeCityStaccatoVictimFrame {
  /** Push-back along the blow (px): 0 inside the freeze, the full key from the first moving frame. */
  readonly recoilX: number;
  /** The stepped shake (px, screen time). */
  readonly jitterX: number;
  /** The hurt lean (degrees): the full key from the first freeze frame. */
  readonly angleDeg: number;
}

/**
 * 맞은 몸(`fightMs` = 싸움 시계, 멈춤 동안 0; `ageMs` = 화면 시간). 고개 꺾임은 멈춤 첫 프레임에 꽉 찬 채로 들어오고, 밀림은 싸움 시계가
 * 움직이는 첫 프레임에 한 번에 나간다(오르는 곡선 없음). 둘 다 그 티어 반응 길이의 `victim.holdShare` 동안 붙들고 `victim.tail` 한
 * 칸을 거쳐 제자리로 끊어 돌아온다. 떨림은 `nativeCityStaccatoShake`. 경직 저항·모션 감소 배율은 옛 곡선과 같다(모션 감소: 기울기·떨림
 * 없음, 밀림 절반 — 붙듦은 남는다).
 */
export function nativeCityStaccatoVictimFrame(hit: VictimHit, fightMs: number, ageMs: number, reduced = false,
  t: NativeCityStaccatoTuning = TUNING): NativeCityStaccatoVictimFrame {
  const spec = victimReactionSpec(hit);
  const soften = (hit.absorbed ? ABSORBED_SCALE : 1) * (reduced ? REDUCED_MOTION_RECOIL_SCALE : 1);
  const level = nativeCityStaccatoHold(fightMs, nativeCityStaccatoHoldMs(spec.durationMs, t.victim.holdShare, t), t.victim.tail, t.recoverStepMs);
  return {
    recoilX: fightMs > 0 ? hit.facing * spec.recoilPx * level * soften : 0,
    jitterX: nativeCityStaccatoShake(ageMs, spec.shakeAmpPx * soften, spec.shakeMs, reduced, t),
    angleDeg: reduced ? 0 : hit.facing * spec.angleDeg * level * soften,
  };
}
