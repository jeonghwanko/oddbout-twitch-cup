import type { NativeCityImpactTier } from "../../sim/cityFight/NativeCityCombatTuning";
import type { CombatStatusId } from "./CombatStatusTag";
import type { DamageNumberTier } from "./DamageNumberPresentation";



/**
 * Where the floats sit on a body, as shares of its drawn height: a number just over the drawn hit's contact (`numberLift`) and beside it
 * on the pushed side (`numberSide`); a status by the head (`statusHeight`) on the side away from the other fighter (`statusSide`).
 */
export const NATIVE_CITY_FLOAT_PLACE = Object.freeze({ numberLift: 0.12, numberSide: 0.2, statusHeight: 0.92, statusSide: 0.32 });

/** The village fight shows HP × this, rounded (user 2026-10-18: whole numbers — real HP made 0.1–2.3 per blow). */
export const NATIVE_CITY_DAMAGE_DISPLAY_SCALE = 10;

/** HP as the village fight shows it: × `NATIVE_CITY_DAMAGE_DISPLAY_SCALE`, rounded — never "0" (a blow that took HP shows at least 1). */
export function nativeCityDisplayDamage(hp: number): number {
  return Math.max(1, Math.round(hp * NATIVE_CITY_DAMAGE_DISPLAY_SCALE));
}

export interface NativeCityHitNumber {
  readonly tier: DamageNumberTier;
  readonly critical: boolean;
  readonly label: string;
}


export function nativeCityEnemyHitNumber(hit: { readonly damage: number; readonly tier: NativeCityImpactTier; readonly armored: boolean })
  : NativeCityHitNumber | null {
  if (!(hit.damage > 0)) return null;
  const tier: DamageNumberTier = hit.armored ? "absorbed"
    : hit.tier === "ko" ? "finisher"
      : hit.tier === "counter" ? "counter"
        : hit.tier === "dash" ? "dash"
          : hit.tier === "heavy" || hit.tier === "slam" || hit.tier === "break" ? "heavy"
            : "light";
  return { tier, critical: !hit.armored && hit.tier === "break", label: `${nativeCityDisplayDamage(hit.damage)}` };
}


export function nativeCityPlayerLossNumber(lost: number, tier?: NativeCityImpactTier): NativeCityHitNumber | null {
  if (!(lost > 1e-9)) return null;
  const heavy = tier !== undefined && tier !== "light";
  return { tier: heavy ? "player-heavy" : "player", critical: false, label: `-${nativeCityDisplayDamage(lost)}` };
}

/** One status a body has on now (`body`: "player" or the enemy's id). */
export interface NativeCityStatusOn {
  readonly body: string;
  readonly status: CombatStatusId;
}

/**
 * The statuses that started this frame: on now and not on the frame before (a status shows once as it begins, never again while it
 * lasts). Order is `now`'s.
 */
export function nativeCityStatusEdges(previous: readonly NativeCityStatusOn[], now: readonly NativeCityStatusOn[]): NativeCityStatusOn[] {
  const before = new Set(previous.map(on => `${on.body}\u0000${on.status}`));
  return now.filter(on => !before.has(`${on.body}\u0000${on.status}`));
}
