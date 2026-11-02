import type { NativeCityKumaAirTuning } from "./NativeCityCombatTuning";
import type { KumaCombatInput, KumaCombatState, KumaSpecialMove, KumaTuning } from "./NativeCityKumaCombatState";
import { kumaSkillKind, kumaSkillSpec } from "./NativeCityKumaSkill";



/** His air chase (`native-city-fighters.json` row `airChase`, `KumaTuning.airChase`). Distances are strides beyond body contact. */
export interface CityFighterAirChaseTuning {
  /** The jump's longest flight toward the body in the air. */
  readonly maxStrides: number;
  /** He lands his first air contact this far short of body contact. */
  readonly landGapStrides: number;
  /** Each air contact's reach. */
  readonly reachStrides: number;
  /** A slide through the body (`CityFighterSkillTuning.passThrough`) turns back to chase once it is this far past him. */
  readonly passStrides: number;
  /** × the damage of each chase contact (the combo's for the air hits, the slam's for the spike): the juggle is a show, not a second KO. */
  readonly damageScale: number;
  /**
   * The share of his C strings whose last contact throws the body up (2026-10-22, 추천 2번 — every fighter's launch, not only a launching
   * skill's; seeded per string, `kumaEnderLaunches`). Absent: only a launching skill launches.
   */
  readonly launchEnder?: number;
}

/** The special that draws the air chase (his pack's `airCombo` clip). */
export const KUMA_AIR_CHASE: KumaSpecialMove = "airChase";
/** Its three-hit branch (2026-10-22 5차 — 추천 3번 "두 대냐 세 대냐"): his pack's `airCombo3`, one more juggle before the spike. */
export const KUMA_AIR_CHASE_LONG: KumaSpecialMove = "airChase3";

/** The swing is an air chase, either branch. */
export function kumaAirChasing(special: KumaSpecialMove | null | undefined): boolean {
  return special === KUMA_AIR_CHASE || special === KUMA_AIR_CHASE_LONG;
}

/**
 * Which branch his chase `attackId` takes (`kuma.attack` salt `windupSalt` mixed in, so two corners differ): a seeded half of his chases
 * are the three-hit one — where his pack draws it.
 */
export function kumaAirChaseBranch(attackId: number, t: Pick<KumaTuning, "windupSalt">): KumaSpecialMove {
  return (Math.imul(Math.max(0, Math.floor(attackId)) + 31 + (t.windupSalt ?? 0), 0x9e3779b1) >>> 16) % 2 === 1 ? KUMA_AIR_CHASE_LONG : KUMA_AIR_CHASE;
}


export function kumaAirSpec(t: Pick<KumaTuning, "rhythm" | "boutAir">): NativeCityKumaAirTuning | undefined {
  return t.rhythm?.launch.air ?? t.boutAir;
}

/** His skill's contact throws the body up (`CityFighterSkillTuning.launches`): the swing he is in is that skill. */
export function kumaSkillLaunches(s: Pick<KumaCombatState, "special">, t: Pick<KumaTuning, "skill" | "skill2" | "boutAir">): boolean {
  return kumaSkillSpec(t, kumaSkillKind(s.special))?.launches === true && t.boutAir !== undefined;
}

/**
 * His C string's last contact (`hitIndex` of `hits`) throws the body up (`CityFighterAirChaseTuning.launchEnder`): a seeded share of his
 * strings, salted per corner (`windupSalt`), on the bout's air. Never a skill's swing (its own `launches`).
 */
export function kumaEnderLaunches(s: Pick<KumaCombatState, "action" | "special" | "attackId">, hitIndex: number, hits: number,
  t: Pick<KumaTuning, "airChase" | "boutAir" | "windupSalt">): boolean {
  const share = t.airChase?.launchEnder;
  if (share === undefined || share <= 0 || !t.boutAir || s.action !== "combo" || s.special != null || hits < 2 || hitIndex !== hits - 1) return false;
  const roll = (Math.imul(Math.max(0, Math.floor(s.attackId)) + 53 + (t.windupSalt ?? 0), 0x2c1b3c6d) >>> 16) % 1000;
  return roll < share * 1000;
}

/**
 * He jumps after the body up there now: it flies unspiked, he has an air chase and is not in one, and he is done with what he was doing —
 * his swing's contacts all thrown, his stand or chase, or his slide past the body by `passStrides` (a slide that stopped on it: at once).
 */
export function kumaAirChaseDue(s: KumaCombatState, input: Pick<KumaCombatInput, "opponentAir" | "player" | "stepUnits">, t: KumaTuning): boolean {
  const air = input.opponentAir, chase = t.airChase, player = input.player;
  if (!chase || !air || air.spiked || !player || kumaAirChasing(s.special)) return false;
  if (s.mode === "cooldown" || s.mode === "chase") return true;
  if (s.mode === "attack") return s.attackHits > 0 && s.hitsFired >= s.attackHits;
  if (s.mode !== "dash" || !s.dash?.struck) return false;
  if (kumaSkillSpec(t, kumaSkillKind(s.dash.special))?.passThrough !== true || s.dash.phase !== "travel") return true;
  const past = (s.point[0] - player[0]) * s.dash.heading[0] + (s.point[1] - player[1]) * s.dash.heading[1];
  return past >= Math.max(0, chase.passStrides) * input.stepUnits;
}
