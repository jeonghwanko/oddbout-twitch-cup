import { NATIVE_CITY_COMBAT, type NativeCityImpactTier } from "./NativeCityCombatTuning";
import { duelHpKnockScale } from "../duel/DuelKnockback";
import { knockbackStopMs } from "../KnockbackCurve";
import { nativeCityKnockbackCurve } from "./NativeCityMelee";
import { NATIVE_CITY_OTTO, NATIVE_CITY_OTTO_BLOW, NATIVE_CITY_OTTO_ID, ottoContactFeel, ottoFighting, ottoKoLaunch, ottoLaunch, ottoTakeHit, type OttoState } from "./NativeCityOttoEncounter";
import { emit, type FightEnemy, type FightFrame } from "./NativeCityFightFrame";
import { chainLaunchFor, endsString, type CityFightFoeRules, type EnemyTake, type PlayerStrike } from "./CityFightFoe";
import { OTTO_GROUND_SLAM, ottoGroundSlams } from "./NativeCityOttoGroundSlam";




export function ottoFightEnemy(state: OttoState, radius: number): FightEnemy {
  const fighting = ottoFighting(state);
  const rock = ottoGroundSlams(state), pattern = state.pattern ?? "sweep";
  const feel = ottoContactFeel(state);
  const blow = { ...NATIVE_CITY_OTTO_BLOW, tier: feel.tier as NativeCityImpactTier, freezeMs: feel.freezeMs, contact: "hook" as const };
  return { id: NATIVE_CITY_OTTO_ID, engaged: fighting, vulnerable: fighting, point: state.point, radius, invulnerableMs: NATIVE_CITY_OTTO.invulnerableMs,
    defeatCard: false, rules: OTTO_FOE_RULES, vaultable: false,
    blow: rock ? { ...blow, tier: "slam", contact: "stone", launch: true, knockdown: true,
      landing: { flightMs: knockbackStopMs(OTTO_GROUND_SLAM.knockbackStrides, nativeCityKnockbackCurve(1, true)),
        lieMs: OTTO_GROUND_SLAM.lieMs, contact: "stone", slide: OTTO_GROUND_SLAM.slide }, knockbackStrides: OTTO_GROUND_SLAM.knockbackStrides,
      stunMs: OTTO_GROUND_SLAM.stunMs, freezeMs: OTTO_GROUND_SLAM.freezeMs, contactHeight: OTTO_GROUND_SLAM.contactHeight }
      : pattern === "drive" ? { ...blow, pullStrides: NATIVE_CITY_OTTO.patterns.drive.pullStrides } : blow };
}


export const OTTO_FOE_RULES: CityFightFoeRules = Object.freeze({ receive: ottoReceive });


function ottoReceive<K>(f: FightFrame<K>, strike: PlayerStrike): EnemyTake {
  const otto = f.otto;
  if (!otto) return { kind: "none" };
  const taken = ottoTakeHit(otto, strike.origin, strike.attackId), outcome = taken.outcome, damage = Math.max(0, otto.hp - taken.state.hp);
  f.otto = taken.state;
  if (outcome === "none") return { kind: "none" };
  if (outcome !== "hit") {
    emit(f, { kind: "ottoTook", outcome, defeated: taken.defeated });
    return { kind: outcome };
  }
  const followUp = taken.followUp === true && !taken.defeated;
  const ender = !followUp && endsString(strike);
  const launch = chainLaunchFor(strike);
  let flown = 0;
  if (taken.defeated) {
    const thrown = ottoKoLaunch(f.otto, strike.push, f.ctx.stepUnits);
    f.otto = thrown.state;
    flown = thrown.units;
  } else if (launch) {
    // The string's ender pushes further as his HP runs out (`knockback.hpScale`, 2026-10-20).
    const grow = ender ? duelHpKnockScale(f.otto.hp / Math.max(1e-9, NATIVE_CITY_OTTO.hp), NATIVE_CITY_COMBAT.knockback.hpScale) : 1;
    const pushed = ottoLaunch(f.otto, strike.push, launch.strides * f.ctx.stepUnits * grow, launch.curve);
    f.otto = pushed.state;
    flown = Math.max(0, pushed.units);
  }
  // The blow that takes his last HP is the fight's finisher, as KUMA's is (2026-10-12): the finisher freeze and slow-mo (`landHit`'s
  // `ko`), the KO accent — not the swing's own tier.
  const tier: NativeCityImpactTier = taken.defeated ? "ko" : followUp ? "light"
    : strike.kind === "attack" && strike.timeline.jump !== undefined ? "slam" : strike.tier;
  const beat = strike.kind === "combo" && strike.hitIndex < 2 ? (strike.hitIndex + 1) as 1 | 2 : undefined;
  return { kind: "hit", impact: tier, armored: false, stopTier: tier, damage, skidUnits: flown,
    chainLight: !ender && !followUp && tier === "light" ? strike.hitIndex : false,
    speedLines: ender && launch !== null && launch.curve && flown > 0, accent: taken.defeated ? "ko" : ender ? "ender" : null,
    after: freezeMs => emit(f, { kind: "ottoTook", outcome, defeated: taken.defeated,
      ...(!followUp ? { impact: { tier, push: strike.push, motion: strike.motion, freezeMs, ...(beat ? { chainBeat: beat } : {}) } } : {}) }) };
}
