import { NATIVE_CITY_COMBAT, type NativeCityImpactTier } from "../../sim/cityFight/NativeCityCombatTuning";
import type { NativeCityFightFeel } from "../../sim/cityFight/NativeCityFightSim";
import { easeOutCubic } from "../art/easing";
import { HIT_STOP_BY_TIER } from "./CombatPresentation";
import { combatSlowMoScaleAt } from "./CombatSlowMo";
import { nativeCityExchangeFinisherRate, nativeCityExchangeHitStopMs } from "./NativeCityExchangeFx";


export function nativeCityHitStopMs(tier: NativeCityImpactTier, armored = false, chainLight: boolean | number = false): number {
  const feel = NATIVE_CITY_COMBAT.feel, spec = feel.tiers[tier], ladder = NATIVE_CITY_COMBAT.tempo.player.chainLightHitStopMs;
  const segment = chainLight === true ? 0 : typeof chainLight === "number" ? Math.max(0, Math.floor(chainLight)) : null;
  const base = segment !== null && tier === "light" ? ladder[segment] ?? ladder.at(-1) ?? HIT_STOP_BY_TIER.light
    : HIT_STOP_BY_TIER[spec.hitStop] * spec.hitStopScale;
  return base * NATIVE_CITY_COMBAT.hitStopScale * (armored ? feel.armoredHitStopScale : 1);
}

/**
 * The presentation's feel numbers the village fight's rules run on (`NativeCityFightFeel`, Phaser-free): the tier freeze ladder, the
 * exchange recipes' freezes (`nativeCityExchangeHitStopMs`), the finisher's slow-mo rate, the slow-mo curve (`combatSlowMoScaleAt`) and the
 * swing's step-in easing. The controller passes it to `NativeCityFightSim`; a rule test does the same.
 */
export const NATIVE_CITY_FIGHT_FEEL: NativeCityFightFeel = Object.freeze({
  hitStopMs: nativeCityHitStopMs,
  exchangeHitStopMs: beat => nativeCityExchangeHitStopMs(beat),
  finisherRate: (reducedMotion, scale) => nativeCityExchangeFinisherRate(reducedMotion, scale),
  slowMoScale: (beat, ageMs) => combatSlowMoScaleAt(beat, ageMs),
  lungeCurve: easeOutCubic,
} satisfies NativeCityFightFeel);
