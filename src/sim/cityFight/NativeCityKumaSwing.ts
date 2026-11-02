import { NATIVE_CITY_COMBAT, type NativeCityKumaActionKind } from "./NativeCityCombatTuning";
import type { CityPoint } from "../../world/NativeCityDefinition";
import { NATIVE_CITY_KUMA_MOVES, type KumaCombatInput, type KumaCombatState, type KumaCombatStep, type KumaCombatTiming, type KumaLeap,
  type KumaTuning } from "./NativeCityKumaCombatState";
import { kumaActionFacing, kumaScreenDelta, unit } from "./NativeCityKumaGeometry";
import { kumaShiftStep } from "./NativeCityKumaShift";
import { kumaSkillKind, kumaSkillSpec, kumaSkillSuperForm } from "./NativeCityKumaSkill";
import { kumaAirChasing } from "./NativeCityKumaAirChase";

/** KUMA형 파이터의 휘두름 시계와 사거리(2026-10-13, `NativeCityKumaPatrol`에서 나눔): 쿨다운·예비동작 배율·커밋 시각, 사거리 사슬의 끝, 엉덩방아 도약. */

/**
 * His stand after attack `attackId` (`tempo.kuma.cooldownMs` [min, max]): a deterministic spread per attack id (no global
 * randomness — the fight replays the same).
 */
export function kumaCooldownMs(attackId: number, range: readonly [number, number] = NATIVE_CITY_COMBAT.tempo.kuma.cooldownMs): number {
  const [min, max] = range;
  const hash = Math.imul((Math.max(0, Math.floor(attackId)) + 1) | 0, 0x9e3779b1) >>> 0;
  return min + (Math.max(min, max) - min) * (hash / 0x100000000);
}

/**
 * A rotation swing's windup speed (`kuma.attack.windupRates`, × `tempo.kuma.windupRate`): seeded per attack id — deterministic, the
 * fight replays the same — so his windups are not one metronome. 1 with no table.
 */
export function kumaWindupScale(attackId: number, t: KumaTuning): number {
  return Math.max(1e-3, kumaSeededWindupRate(attackId, t) * kumaRhythmWindupSlow(attackId, t));
}

/** The seeded rotation rate alone (`kuma.attack.windupRates`): 1 with no table. */
function kumaSeededWindupRate(attackId: number, t: KumaTuning): number {
  const rates = t.attack.windupRates ?? [];
  if (rates.length === 0) return 1;
  const hash = Math.imul((Math.max(0, Math.floor(attackId)) + 7 + (t.windupSalt ?? 0)) | 0, 0x85ebca6b) >>> 0;
  return Math.max(1e-3, rates[(hash >>> 13) % rates.length] ?? 1);
}

/**
 * What the duel's rhythm does to that swing's seeded windup rate (`kuma.rhythm`, 2026-10-18; 1 without it): × `windupScale` — or, on the late
 * beat (`delay`: about one swing in `every`, seeded per attack id, never a fight's first), the rate becomes `delay.rate` outright. His
 * step-in before the commit slows by the same factor (`kumaTrack`), so a slower windup covers the same ground by the same point of it.
 */
export function kumaRhythmWindupSlow(attackId: number, t: KumaTuning): number {
  const rhythm = t.rhythm;
  if (!rhythm) return 1;
  const id = Math.max(0, Math.floor(attackId)), every = Math.floor(rhythm.delay.every);
  if (every > 0 && id > 1 && (Math.imul(id + 11, 0x27d4eb2f) >>> 0) % every === 0) {
    return Math.max(1e-3, rhythm.delay.rate) / kumaSeededWindupRate(id, t);
  }
  return Math.max(1e-3, rhythm.windupScale);
}

/**
 * In the air on the butt slam's leap (`KumaLeap`): from its takeoff until it lands on its contact. He cannot be hit, parried or cut into a
 * dash meanwhile.
 */
export function kumaCombatAirborne(state: KumaCombatState): boolean {
  return state.mode === "attack" && state.leap != null && state.hitsFired === 0;
}

/**
 * The swing's commit point (ms into it): the lunge `antiKite.commitLeadMs` before its first contact, the slam where its apex hold
 * starts (`timing.apexMs`), any other swing `attack.commitLeadMs` before its first contact.
 */
export function kumaCommitMs(action: NativeCityKumaActionKind, timing: KumaCombatTiming, lunge = false,
  t: KumaTuning): number {
  const first = timing.hitsMs[0];
  if (first === undefined) return 0;
  if (lunge) return Math.max(0, first - t.antiKite.commitLeadMs);
  if (action === "slam" && timing.apexMs !== undefined && timing.apexMs > 0) return Math.min(timing.apexMs, first);
  return Math.max(0, first - t.attack.commitLeadMs);
}

/** 마지막 접촉을 냈다(이번 공격의 회복 구간). */
export function kumaCombatRecovering(state: KumaCombatState): boolean {
  return state.mode === "attack" && state.attackHits > 0 && state.hitsFired >= state.attackHits;
}


export function kumaStrikeRound(s: KumaCombatState, action: NativeCityKumaActionKind, hitIndex: number, t: KumaTuning)
  : boolean {
  // A skill's leap (the burrow) comes up with a paw in front of him, not a shockwave round him; so does the air chase's.
  return s.leap != null && kumaSkillKind(s.special) === null && !kumaAirChasing(s.special) || s.swingRadial?.[hitIndex] === true
    || action === "slam" && t.slamShockwave !== undefined && kumaSkillKind(s.special) === null;
}

/**
 * His authored reach beyond body contact for `action` (strides): a fighter's measured one (`KumaTuning.reachExtraStrides`, baked off his
 * clips — `cityFighterReachTuning`), else his strike's (`strikes.<action>`). A drawn swing's own contact reach comes before it where
 * there is one (`swingReach`, the drawn dash's) — the callers ask that first. Every reach chain ends here (2026-10-13: three wrote it out).
 */
export function kumaAuthoredReachStrides(action: NativeCityKumaActionKind, t: KumaTuning): number {
  return t.reachExtraStrides?.[action] ?? t.strikes[action].reachExtraStrides;
}

/**
 * Where he starts `action` (strides beyond body contact): a fighter's measured start (`attackStartStridesBy`) first, else the drawn
 * swing's own (`native-city-kuma-moves.json` startStrides — KUMA's ball reaches further), else `attackStartStrides`. One order for the
 * chase and the wake-up reversal (they were written in two; no fighter has both a measured start and a drawn move).
 */
export function kumaAttackStartStrides(action: NativeCityKumaActionKind, drawnStart: number | undefined, t: KumaTuning)
  : number {
  return t.attackStartStridesBy?.[action] ?? drawnStart ?? t.attackStartStrides;
}

/** A leap's numbers (strides): its longest flight, how far short of contact it lands, its landing's reach. */
export interface KumaLeapSpec { readonly maxStrides: number; readonly landGapStrides: number; readonly reachStrides: number }

/**
 * The butt slam's leap (`native-city-kuma-moves.json` buttSlam); a skill's own (the burrow, `KumaTuning.skill`) when its swing is one — its
 * super form's (`superSkill`, 2026-10-22 4차) over it.
 */
export function kumaLeapSpec(s: Pick<KumaCombatState, "special">, t: Pick<KumaTuning, "skill" | "skill2" | "airChase" | "superSkill">): KumaLeapSpec {
  const chase = t.airChase;
  if (chase && kumaAirChasing(s.special)) return { maxStrides: chase.maxStrides, landGapStrides: chase.landGapStrides, reachStrides: chase.reachStrides };
  const skill = kumaSkillSpec(t, kumaSkillKind(s.special));
  if (skill) {
    const big = kumaSkillSuperForm(s.special) ? t.superSkill : undefined;
    return { maxStrides: big?.maxStrides ?? skill.maxStrides ?? 0, landGapStrides: big?.landGapStrides ?? skill.landGapStrides ?? 0,
      reachStrides: big?.reachStrides ?? skill.reachStrides ?? 0 };
  }
  const spec = NATIVE_CITY_KUMA_MOVES.buttSlam;
  return { maxStrides: spec.maxStrides, landGapStrides: spec.landGapStrides, reachStrides: spec.shockwaveReachExtraStrides };
}

/** A leap's reach beyond body contact (strides): its longest flight + its landing's reach (`kumaLeapSpec`). */
export function kumaLeapReachStrides(spec: KumaLeapSpec = kumaLeapSpec({ special: null }, {})): number {
  return Math.max(0, spec.maxStrides) + Math.max(0, spec.landGapStrides) + Math.max(0, spec.reachStrides);
}


export function kumaLeapLock(s: KumaCombatState, player: CityPoint | null, input: Pick<KumaCombatInput, "contactUnits" | "stepUnits">,
  timing: KumaCombatTiming, spec: KumaLeapSpec = kumaLeapSpec({ special: null }, {})): KumaLeap | null {
  const takeoff = timing.leap?.takeoffMs, land = timing.hitsMs[0];
  if (takeoff === undefined || land === undefined || s.lunge) return null;
  const from: CityPoint = [s.point[0], s.point[1]];
  const toward = player ? unit([player[0] - from[0], player[1] - from[1]]) : null;
  if (!player || !toward) return { from, to: from, takeoffMs: takeoff, landMs: Math.max(takeoff, land) };
  const distance = Math.hypot(player[0] - from[0], player[1] - from[1]);
  const travel = Math.max(0, Math.min(Math.max(0, spec.maxStrides) * input.stepUnits,
    distance - input.contactUnits - Math.max(0, spec.landGapStrides) * input.stepUnits));
  return { from, to: [from[0] + toward[0] * travel, from[1] + toward[1] * travel], takeoffMs: takeoff, landMs: Math.max(takeoff, land) };
}


export function kumaLeapStep(s: KumaCombatState, input: KumaCombatInput): KumaCombatState {
  // The air chase homes on the body in the air the whole way (it flies on along its launch and the juggle's pushes).
  if (kumaAirChasing(s.special)) return kumaAirChaseHome(s, input);
  const leap = s.leap;
  if (!leap || s.hitsFired > 0 || s.modeMs < leap.takeoffMs) return s;
  const k = Math.max(0, Math.min(1, (s.modeMs - leap.takeoffMs) / Math.max(1, leap.landMs - leap.takeoffMs)));
  let want: CityPoint = [leap.from[0] + (leap.to[0] - leap.from[0]) * k, leap.from[1] + (leap.to[1] - leap.from[1]) * k];
  const player = input.player;
  if (k >= 1 && player && Math.hypot(want[0] - player[0], want[1] - player[1]) < input.contactUnits) {
    const away = unit([want[0] - player[0], want[1] - player[1]]) ?? unit([leap.from[0] - leap.to[0], leap.from[1] - leap.to[1]])
      ?? [-s.direction[0], -s.direction[1]];
    want = [player[0] + away[0] * input.contactUnits, player[1] + away[1] * input.contactUnits];
  }
  const next = (input.moveGhost ?? input.move)(s.point, want);
  const moved = kumaScreenDelta(input.projection, [next[0] - s.point[0], next[1] - s.point[1]]);
  const landed = { ...s, point: next, movedPx: Math.hypot(moved[0], moved[1]) };
  // The burrow comes up turned to the body as it is now (2026-10-22 action review): its exit was locked at the dig, and a body that crossed
  // over the mound meanwhile was struck at from behind — his paw thrust into the air on the other side.
  const aim = k >= 1 && player && kumaSkillKind(s.special) === "burrow" ? unit([player[0] - next[0], player[1] - next[1]]) : null;
  const facing = aim ? kumaActionFacing(input.projection, aim, s.action ?? "slam", input.artFacing) : null;
  return aim && facing ? { ...landed, direction: aim, facing } : landed;
}

/**
 * One frame of the air chase's flight: from the takeoff it closes on the body in the air at a pace that meets it at body contact by the
 * first contact, then keeps that distance through the juggle to the spike — through bodies, walls only.
 */
function kumaAirChaseHome(s: KumaCombatState, input: KumaCombatInput): KumaCombatState {
  const leap = s.leap, player = input.player;
  if (!leap || !player || s.modeMs < leap.takeoffMs) return s;
  const toward = unit([player[0] - s.point[0], player[1] - s.point[1]]);
  if (!toward) return s;
  const gap = Math.max(0, Math.hypot(player[0] - s.point[0], player[1] - s.point[1]) - input.contactUnits);
  const left = s.hitsFired > 0 ? 1 : Math.max(0, leap.landMs - s.modeMs) / Math.max(1, input.dtMs);
  const units = s.hitsFired > 0 ? gap : gap / Math.max(1, left);
  if (units <= 1e-9) return s;
  const next = (input.moveGhost ?? input.move)(s.point, [s.point[0] + toward[0] * units, s.point[1] + toward[1] * units]);
  const moved = kumaScreenDelta(input.projection, [next[0] - s.point[0], next[1] - s.point[1]]);
  return { ...s, point: next, movedPx: Math.hypot(moved[0], moved[1]) };
}

/** The swing is cut before its commit: nothing is thrown (no contact, no counter window) and the rotation does not advance. */
export function enterAbort(s: KumaCombatState, t: KumaTuning): KumaCombatStep {
  const action = s.action ?? "slam";
  // The rotation does not advance: an aborted grab is still owed — by the cadence the grab is picked with (`kumaGrabDue`: his shift's
  // `grabEvery`, else his `grab.every`) — and an aborted rotation swing gives its count back.
  const sinceGrab = action === "grab" ? Math.max(0, Math.floor(kumaShiftStep(s.hp, t)?.grabEvery ?? t.grab.every) - 1)
    : s.lunge || s.reversal ? s.sinceGrab ?? 0 : Math.max(0, (s.sinceGrab ?? 0) - 1);
  return { state: { ...s, mode: "abort", modeMs: 0, abortFromMs: s.modeMs, attacks: s.lunge ? s.attacks : Math.max(0, s.attacks - 1), sinceGrab,
    hitsFired: 0, attackHits: 0, lastLandedHit: -1, committed: false, kiteCount: s.kiteCount + 1, lunge: false, counterChain: false },
  events: [{ kind: "attack-abort", action, attackId: s.attackId }] };
}

/** The swing he is in is his super (`KumaCombatState.superAttack`). */
export function kumaSuperSwing(state: Pick<KumaCombatState, "superAttack" | "attackId">): boolean {
  return state.superAttack !== undefined && state.superAttack === state.attackId;
}
