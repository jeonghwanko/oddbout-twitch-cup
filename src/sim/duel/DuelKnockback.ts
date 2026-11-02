import { knockbackRemainingPx, type KnockbackCurve } from "../KnockbackCurve";

/** A body's rule-owned push, independent of the encounter and its renderer. */
export interface DuelKnock {
  readonly direction: readonly [number, number];
  readonly units: number;
  readonly elapsedMs: number;
  readonly launch?: boolean;
  readonly holdMs?: number;
  readonly flightMs?: number;
  /**
   * How far a flight front-loads its travel (`flightMs` only): it covers `u * ((1 + ease) - ease * u)` of its length by share `u` of its
   * time. Absent: 0.15 (nearly even). The KO blow's launch uses more (2026-10-20, game-animator: a slow motion after the blow ate the
   * launch — the body hung, then whipped away).
   */
  readonly flightEase?: number;
  /** A short, decelerating ground slide after the flight; units are additional to the flight. */
  readonly slide?: { readonly afterMs: number; readonly units: number; readonly ms: number };
}

/**
 * The push growing as the struck body's HP runs out (2026-10-20, the Rivals reference — Smash's "the higher your damage, the further you
 * fly"): `1 + growth · (lost share)^exponent`, at most `maxScale`. A push grown past `launchFromStrides` flies on the launch curve (the
 * caller's rule — its wall splat). Pure; the fight that uses it owns the numbers.
 */
export interface DuelHpKnockTuning {
  readonly growth: number;
  readonly exponent: number;
  readonly maxScale: number;
  readonly launchFromStrides: number;
}

export function duelHpKnockScale(hpShare: number, spec: DuelHpKnockTuning): number {
  const lost = 1 - Math.max(0, Math.min(1, Number.isFinite(hpShare) ? hpShare : 1));
  return Math.min(spec.maxScale, 1 + spec.growth * lost ** spec.exponent);
}

/** Closed-form travel preserves the same distance across frame rates and held clocks. */
export function stepDuelKnock<K extends DuelKnock>(knock: K, dtMs: number, curve: KnockbackCurve)
  : { readonly travel: number; readonly leftUnits: number; readonly knock: K | null } {
  const flightRemaining = (ms: number): number => {
    if (!(knock.flightMs !== undefined && knock.flightMs > 0)) return knockbackRemainingPx(knock.units, ms, curve);
    const u = Math.max(0, Math.min(1, ms / knock.flightMs));
    if (u >= 1) return 0;
    const ease = knock.flightEase ?? 0.15;
    return knock.units * (1 - u * ((1 + ease) - ease * u));
  };
  const remaining = (ms: number): number => {
    const slide = knock.slide;
    if (!slide || slide.ms <= 0 || slide.units <= 0) return flightRemaining(ms);
    if (ms < slide.afterMs) return flightRemaining(ms) + slide.units;
    const u = Math.max(0, Math.min(1, (ms - slide.afterMs) / slide.ms));
    return slide.units * (1 - u) ** 2;
  };
  const leftUnits = remaining(knock.elapsedMs);
  if (!(dtMs > 0)) return { travel: 0, leftUnits, knock };
  const held = Math.min(dtMs, Math.max(0, knock.holdMs ?? 0));
  const elapsedMs = knock.elapsedMs + dtMs - held, after = remaining(elapsedMs);
  return { travel: leftUnits - after, leftUnits, knock: after <= 0 ? null : Object.freeze({ ...knock, elapsedMs,
    ...(knock.holdMs !== undefined ? { holdMs: Math.max(0, knock.holdMs - held) } : {}) }) };
}
