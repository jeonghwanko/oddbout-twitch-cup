import { NATIVE_CITY_COMBAT, type NativeCitySuperTuning } from "./NativeCityCombatTuning";



export type CityFightMeterGain = "hit" | "blocked" | "taken";

/** The meter after `gain` (at most `super.max`). */
export function cityFightMeterGain(meter: number | undefined, gain: CityFightMeterGain, t: NativeCitySuperTuning = NATIVE_CITY_COMBAT.super): number {
  const amount = gain === "hit" ? t.gainHit : gain === "blocked" ? t.gainBlocked : t.gainTaken;
  return Math.min(t.max, Math.max(0, meter ?? 0) + Math.max(0, amount));
}

/** The meter is full: the super can be spent. */
export function cityFightMeterFull(meter: number | undefined, t: NativeCitySuperTuning = NATIVE_CITY_COMBAT.super): boolean {
  return (meter ?? 0) >= t.max;
}

/** The meter's share of full (0..1) — what the HUD draws. */
export function cityFightMeterShare(meter: number | undefined, t: NativeCitySuperTuning = NATIVE_CITY_COMBAT.super): number {
  return Math.max(0, Math.min(1, (meter ?? 0) / Math.max(1e-9, t.max)));
}
