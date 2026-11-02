import { NATIVE_CITY_COMBAT, type NativeCityKumaActionKind, type NativeCityPoiseTuning } from "./NativeCityCombatTuning";
import type { CityPoint } from "../../world/NativeCityDefinition";
import { enterReturn, NATIVE_CITY_KUMA_MOVES, toChase, type KumaCombatEvent, type KumaCombatInput, type KumaCombatState,
  type KumaCombatStep, type KumaControl, type KumaFighterOverrides, type KumaSpecialMove, type KumaTuning, kumaCastSpecial } from "./NativeCityKumaCombatState";
import { kumaActionFacing, kumaGap, kumaScreenDelta, kumaScreenFacing, kumaStepPx, kumaStrikeDirection, kumaWalkPhase, unit,
  walkToward } from "./NativeCityKumaGeometry";
import { enterAbort, kumaAttackStartStrides, kumaAuthoredReachStrides, kumaCommitMs, kumaCooldownMs, kumaLeapLock, kumaLeapReachStrides,
  kumaLeapSpec, kumaLeapStep, kumaRhythmWindupSlow, kumaStrikeRound, kumaSuperSwing, kumaWindupScale } from "./NativeCityKumaSwing";
import { kumaSkillDashKind, kumaSkillDrawn, kumaSkillDue, kumaSkillDueSlot, kumaSkillKind, kumaSkillReady, kumaSkillSlotOf, kumaSkillSlotSpec,
  kumaSkillSpecial, kumaSkillStrikeMisses, kumaSkillSwingStep } from "./NativeCityKumaSkill";
import { kumaPoiseAfter, kumaWakeupKind } from "./NativeCityKumaHit";
import { kumaShiftStep } from "./NativeCityKumaShift";
import { enterDash, kumaFled, kumaFleeMs, kumaPlayerGettingAway, kumaPlayerOutside, stepKumaDash } from "./NativeCityKumaDash";
import { cityFightSummonSpec } from "./CityFightSummonTuning";
import { cityFightMeterFull } from "./CityFightMeter";
import { stepKumaAir } from "./NativeCityKumaAir";
import { kumaBoutAiChase, kumaBoutMeasure, kumaBoutReact, kumaBoutRetreat } from "./NativeCityKumaBoutAi";
import { KUMA_AIR_CHASE, kumaAirChaseBranch, kumaAirChaseDue, kumaAirChasing, kumaAirSpec, kumaEnderLaunches, kumaSkillLaunches } from "./NativeCityKumaAirChase";

/** KUMA형 파이터의 한 걸음(2026-10-13, `NativeCityKumaPatrol`에서 나눔): 다음 공격 고르기, 쫓기·추적·취소, 깨어남, 공격의 접촉 사건 — `stepKumaCombat`. */




export function kumaPressOn(state: KumaCombatState): KumaCombatState {
  return state.mode === "attack" || state.mode === "dash" || state.mode === "cooldown" || state.mode === "chase" || state.mode === "abort"
    ? { ...state, pressOn: true } : state;
}


export function kumaGrabDue(state: Pick<KumaCombatState, "hp" | "attacks" | "blockedHits" | "sinceGrab">, gapUnits: number,
  input: Pick<KumaCombatInput, "stepUnits" | "playerGuardMs" | "opponentSwing" | "opponentOpen">, t: KumaTuning): boolean {
  const g = t.grab, shift = kumaShiftStep(state.hp, t);
  if (t.boutAi?.grabWaits === true && (input.opponentSwing || input.opponentOpen === true)) return false;
  // His first shift (`kuma.phases`) is white and gold only: no grab, not even the turtle punish.
  if (!g || shift?.grab === false || !(gapUnits <= Math.max(0, g.startStrides) * input.stepUnits + 1e-9)) return false;
  const turtle = (input.playerGuardMs ?? 0) >= g.turtleMs || g.turtleBlocks > 0 && (state.blockedHits ?? 0) >= g.turtleBlocks;
  const every = shift?.grabEvery ?? g.every;
  return turtle || every > 0 && (state.sinceGrab ?? 0) >= Math.floor(every) - 1;
}


function kumaChainGrabDue(s: KumaCombatState, player: CityPoint, input: KumaCombatInput, t: KumaTuning): boolean {
  if (kumaShiftStep(s.hp, t)?.chainGrab !== true || s.lunge || s.reversal || !(s.action === "combo" || s.action === "fast")) return false;
  if (!((s.blockedHits ?? 0) > 0) || !(kumaGap(s, player, input) <= Math.max(0, t.grab.startStrides) * input.stepUnits + 1e-9)) return false;
  const aim = unit([player[0] - s.point[0], player[1] - s.point[1]]);
  const facing = aim ? kumaActionFacing(input.projection, aim, "grab", input.artFacing) : null;
  return facing !== null && input.timing("grab", facing) !== null;
}

/** The third shift's grab after a guarded white string: outside the rotation (it does not count), drawn speed. */
const CHAIN_GRAB: KumaAttackOverride = Object.freeze({ action: "grab", windupScale: 1, reversal: false });


export function kumaPickAction(state: KumaCombatState, player: CityPoint, input: KumaCombatInput, t: KumaTuning)
  : NativeCityKumaActionKind {
  // His full meter's super (`super`, 2026-10-20): his super swing comes first.
  if (kumaSuperDue(state, t, input)) return kumaSuperAction(t);
  // A summoner's cast (`KumaTuning.summons`) from range; nobody else reads past this line.
  if (kumaSummonDue(state, player, input, t)) return "summon";
  const rotation = kumaHeavyHeld(kumaNextAction(state.attacks, t), input, t);
  // In chase, choose the owed grab before reaching its start distance. Otherwise a longer-range swing steals every approach.
  if (!kumaGrabDue(state, state.mode === "chase" ? 0 : kumaGap(state, player, input), input, t)) return rotation;
  const aim = unit([player[0] - state.point[0], player[1] - state.point[1]]);
  const facing = aim ? kumaActionFacing(input.projection, aim, "grab", input.artFacing) : null;
  return facing && input.timing("grab", facing) ? "grab" : rotation;
}

/**
 * His rotation swing where the first contact wins (`KumaFighterOverrides.heavyOnOpening`): a heavy `slam` only into an opening
 * (`KumaCombatInput.opponentOpen`), else his light swing — `combo`, or `fast` where his mix weighs it more.
 */
function kumaHeavyHeld(action: NativeCityKumaActionKind, input: KumaCombatInput, t: KumaTuning): NativeCityKumaActionKind {
  if (t.heavyOnOpening !== true || action !== "slam" || input.opponentOpen !== false) return action;
  return (t.attackMix?.fast ?? 0) > (t.attackMix?.combo ?? 0) ? "fast" : "combo";
}

/** The swing his full meter buys: his skill's action when his super is its super form (`superSkill`), else `superAction`, else `super.kumaAction`. */
export function kumaSuperAction(t: KumaTuning): NativeCityKumaActionKind {
  if (t.superSkill && t.skill) return t.skill.action;
  return t.superAction ?? NATIVE_CITY_COMBAT.super.kumaAction;
}

/**
 * He spends his meter on his next swing (`super`, 2026-10-20 — deterministic): it is full, the fight gives him one (`superOff` absent), and
 * the attack's seeded share (`kumaSummonShare` off his next attack id, its own stretch) falls under `super.aiShareUnder` — a full meter
 * waits a swing or two now and then.
 */
export function kumaSuperDue(state: Pick<KumaCombatState, "meter" | "attackId">, t: KumaTuning,
  input?: Pick<KumaCombatInput, "superLocked" | "opponentDown">): boolean {
  if (t.superOff === true || !cityFightMeterFull(state.meter)) return false;
  // The bout holds it (the other's super or its follow-up playing — 2026-10-23 arena audit) and never spends it on a body down.
  if (input?.superLocked === true || input?.opponentDown === true) return false;
  return kumaSummonShare(state.attackId + 1 + SUPER_SHARE_SALT) < NATIVE_CITY_COMBAT.super.aiShareUnder;
}

/** The super's share reads its own stretch of the scramble (never a summon slot's). */
const SUPER_SHARE_SALT = 104729;



export function kumaCarryCutSuper(before: KumaCombatState, after: KumaCombatState): KumaCombatState {
  // A dash super (`superAction: "dash"`) still running is the super going on, as a swing in its attack is.
  if (!kumaSuperSwing(before) || before.hitsFired > 0 || ((after.mode === "attack" || after.mode === "dash") && after.attackId === before.attackId)) {
    return after;
  }
  return { ...after, superAttack: undefined, superArmed: true };
}

/**
 * His summon cast is due now (2026-10-20, `KumaTuning.summons` — deterministic like the grab): some slot can cast (`kumaSummonSlot`). Without
 * a summon in his tuning: never (and nothing else is read).
 */
export function kumaSummonDue(state: Pick<KumaCombatState, "attacks" | "attackId" | "sinceSummon" | "summonSlot" | "point">, player: CityPoint,
  input: KumaCombatInput, t: KumaTuning): boolean {
  return kumaSummonSlot(state, player, input, t) !== null;
}


export function kumaSummonSlot(state: Pick<KumaCombatState, "attacks" | "attackId" | "sinceSummon" | "summonSlot" | "point">, player: CityPoint,
  input: KumaCombatInput, t: KumaTuning): number | null {
  const slots = t.summons ?? [];
  // The bout AI casts in a lull, never into the other's swing (2026-10-23 arena audit: two casts of three were cut 16–96 ms in).
  if (t.boutAi && input.opponentSwing) return null;
  if (slots.length === 0 || !input.summons) return null;
  const gap = Math.hypot(player[0] - state.point[0], player[1] - state.point[1]) - input.contactUnits;
  const aim = unit([player[0] - state.point[0], player[1] - state.point[1]]);
  const facing = aim ? kumaActionFacing(input.projection, aim, "summon", input.artFacing) : null;
  const n = slots.length > 1 ? state.attackId : state.attacks;
  for (let k = 1; k <= slots.length; k++) {
    const slot = ((state.summonSlot ?? -1) + k) % slots.length, spec = slots[slot]!;
    if ((input.summons.live[spec.kind] ?? 0) >= Math.max(0, Math.floor(cityFightSummonSpec(spec.kind).maxLive))) continue;
    if ((state.sinceSummon ?? spec.everyAttacks) < spec.everyAttacks) continue;
    if (gap < spec.minGapStrides * input.stepUnits - 1e-9 || kumaSummonShare(n + 1 + SLOT_SHARE_SALT * slot) >= spec.weight) continue;
    if (facing !== null && input.timing("summon", facing, 1, kumaCastSpecial(spec.clip)) !== null) return slot;
  }
  return null;
}

/** Each summon slot past the first reads its share from its own stretch of the scramble (slot 0's is the cast's as it was). */
const SLOT_SHARE_SALT = 7919;

/** Where he starts the cast of slot `slot` (strides beyond body contact): its `startStrides`, never inside its `minGapStrides`. */
function kumaSummonStartStrides(t: KumaTuning, slot: number): number | undefined {
  const spec = t.summons?.[slot];
  return spec ? Math.max(spec.minGapStrides, spec.startStrides) : undefined;
}

/** The `n`-th attack's seeded share in [0, 1) for the summon's `weight` (its own scramble — never the rotation's `kumaMixedAction` hash). */
export function kumaSummonShare(n: number): number {
  let h = Math.imul((Math.max(0, Math.floor(n)) + 29) | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 0x100000000;
}

/** 다음 공격: `comboEvery` 번째는 콤보, 나머지 중 `fastCombo.every` 번째는 빠른 콤보, 그 밖은 내려찍기. */
export function kumaNextAction(attacks: number, t: KumaTuning): NativeCityKumaActionKind {
  const n = attacks + 1;
  if (t.attackMix) return kumaMixedAction(n, t.attackMix);
  if (t.comboEvery > 0 && n % t.comboEvery === 0) return "combo";
  const ordinal = t.comboEvery > 0 ? n % t.comboEvery : n;
  return t.fastCombo.every > 0 && ordinal % t.fastCombo.every === 0 ? "fast" : "slam";
}

/**
 * A weighted pick of his `n`-th rotation swing (`attackMix`, the test fighters): a hash of `n` against the weights — deterministic
 * (the fight replays the same) and not a fixed cycle the player can count. Slam when the weights are all zero.
 */
export function kumaMixedAction(n: number, mix: NonNullable<KumaFighterOverrides["attackMix"]>): NativeCityKumaActionKind {
  const kinds = ["slam", "combo", "fast"] as const, weights = kinds.map(kind => Math.max(0, mix[kind] ?? 0));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (!(total > 0)) return "slam";
  // A scrambled hash (a plain multiply would walk the weights in a countable stride).
  let h = Math.imul((Math.max(0, Math.floor(n)) + 13) | 0, 0x27d4eb2d);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  let u = (h >>> 0) / 0x100000000 * total;
  for (let i = 0; i < kinds.length; i++) { u -= weights[i]!; if (u < 0) return kinds[i]!; }
  return "slam";
}


function kumaStepBack(s: KumaCombatState, player: CityPoint | null, input: KumaCombatInput, t: KumaTuning, dt: number): KumaCombatState | null {
  const spec = t.spacing;
  if (!spec || !player || s.wakeGuard || !(dt > 0) || s.modeMs > spec.withinMs) return null;
  // The bout's AI steps back after every swing, landed or not (`boutAi`, 2026-10-23 — the trade had no room between its turns).
  if (!t.boutAi && (!(s.attackHits > 0) || s.lastLandedHit < s.attackHits - 1)) return null;
  const away = unit([s.point[0] - player[0], s.point[1] - player[1]]);
  if (!away) return null;
  const backed = s.backedUnits ?? 0;
  const left = Math.min(spec.backStrides * input.stepUnits - backed, spec.maxGapStrides * input.stepUnits - kumaGap(s, player, input));
  if (!(left > 1e-9)) return null;
  const step = walkToward(s, [s.point[0] + away[0] * left, s.point[1] + away[1] * left], input, input.pacePxPerSec * Math.max(0, spec.backPaceScale),
    left, dt);
  if (!(step.movedPx > 0)) return null;
  const moved = Math.hypot(step.point[0] - s.point[0], step.point[1] - s.point[1]);
  return { ...s, point: step.point, movedPx: step.movedPx, backedUnits: backed + moved, phase: kumaWalkPhase(s.phase, step.movedPx, input.stridePx, true) };
}

/**
 * A swing outside his rotation: the wake-up reversal (`knockdown.wakeup`) — its own action, windup speed and commitment — or a person's
 * press (`controlled`, `KumaControl`): it counts as a rotation attack, may be his super (`superMove`) or a given summon slot.
 */
interface KumaAttackOverride {
  readonly action: NativeCityKumaActionKind; readonly windupScale: number; readonly reversal: boolean;
  readonly controlled?: true; readonly superMove?: true; readonly summonSlot?: number;
  /** His skill (`KumaTuning.skill`, 2026-10-22): its action's numbers, drawn by his `skill` clip, a rotation attack. */
  readonly skill?: true;
  /** Which of his skills (2026-10-25, `KumaTuning.skill2`): 0 his `skill`, 1 his `skill2`. Absent: 0. */
  readonly skillSlot?: number;
}

/** His skill in `slot` as an attack override (the AI's pick and a person's X — always slot 0). */
function kumaSkillOverride(t: KumaTuning, controlled: boolean, slot = 0): KumaAttackOverride {
  return { action: kumaSkillSlotSpec(t, slot)!.action, windupScale: 1, reversal: false, skill: true, ...(controlled ? { controlled: true as const } : {}),
    ...(slot !== 0 ? { skillSlot: slot } : {}) };
}

function startAttack(state: KumaCombatState, player: CityPoint, input: KumaCombatInput, t: KumaTuning, lunge: boolean,
  override: KumaAttackOverride | null = null, cuttable = false): KumaCombatStep | null {
  const direction = unit([player[0] - state.point[0], player[1] - state.point[1]]) ?? state.direction;
  // A super he gave up by his own step (`superArmed`) is this rotation swing, in its own action.
  const armed = state.superArmed === true && override === null && !lunge;
  const action = override?.action ?? (lunge ? t.antiKite.action : armed ? kumaSuperAction(t) : kumaPickAction(state, player, input, t));
  // His full meter spent on this swing (`super`): a rotation pick only, never the lunge, the reversal or the chain grab.
  const superMove = armed || override?.superMove === true || (override === null && !lunge && action === kumaSuperAction(t) && kumaSuperDue(state, t, input));
  // His skill's super form (2026-10-22 4차, `superSkill` — the penguin's three runs through, the gopher's three exits): the full meter buys his
  // skill in its big form, its contacts his super's. Without its art at his heading his plain super goes on below.
  if (superMove && t.superSkill && t.skill) {
    const big = kumaStartSkill(state, player, direction, input, t, override?.controlled === true, true);
    if (big) {
      const attackId = big.state.attackId;
      return { state: { ...big.state, superAttack: attackId, ...(armed ? { superArmed: false } : { meter: 0 }) },
        events: [...big.events, ...(armed ? [] : [{ kind: "super" as const, action, attackId }])] };
    }
  }
  // dash (the dash is a mode, not a swing), its one strike his super's (`kumaSuperSwing`: damage, flag, armour); a connected dash restarts
  // his next rotation swing as any dash does. Only the super takes this way — a lunge or an override naming the dash is as before.
  if (action === "dash" && superMove) {
    const dash = enterDash(state, player, input, t, kumaNextAction(state.attacks, t), false);
    return { state: { ...dash.state, superAttack: dash.state.attackId, ...(armed ? { superArmed: false } : { meter: 0 }) },
      events: [...dash.events, ...(armed ? [] : [{ kind: "super" as const, action, attackId: dash.state.attackId }])] };
  }
  // His skill (2026-10-22, `KumaTuning.skill`): drawn by his `skill` clip as drawn; a dash kind runs as his dash (`enterDash`).
  if (override?.skill === true && kumaSkillSlotSpec(t, override.skillSlot ?? 0)) {
    return kumaStartSkill(state, player, direction, input, t, override.controlled === true, false, override.skillSlot ?? 0);
  }
  const facing = kumaActionFacing(input.projection, direction, action, input.artFacing) ?? state.facing;
  const attackId = state.attackId + 1;
  // Its windup speed: the override's (the reversal), the lunge and the grab as drawn, a rotation swing seeded (`kuma.attack.windupRates`).
  const windupScale = override?.windupScale ?? (lunge || action === "grab" || action === "summon" ? 1 : kumaWindupScale(attackId, t));
  // The duel's rhythm slows a rotation swing's windup (`kuma.rhythm`); his step-in slows with it (`kumaTrack`).
  const windupSlow = override || lunge || action === "grab" || action === "summon" ? 1 : kumaRhythmWindupSlow(attackId, t);
  // The butt slam stands in for a slam now and then (`specials.buttSlam`) — where it is drawn (its timing leaps).
  const slams = (state.slams ?? 0) + (action === "slam" ? 1 : 0);
  // A person's slam is always his slam (the same button, the same move).
  const wantsButt = action === "slam" && override?.controlled !== true && kumaButtSlamDue(state, slams, t);
  const butt = wantsButt ? input.timing(action, facing, windupScale, "buttSlam") : null;
  // A summon cast is drawn from its slot's clip (`kumaCastSpecial`; his plain `summon` clip carries no special).
  const slot = action === "summon" ? override?.summonSlot ?? kumaSummonSlot(state, player, input, t) ?? 0 : null;
  const special: KumaSpecialMove | null = butt?.leap ? "buttSlam" : slot !== null ? kumaCastSpecial(t.summons?.[slot]?.clip) : null;
  const timing = butt?.leap ? butt : input.timing(action, facing, windupScale, special);
  if (!timing) return null;
  // The lunge and the reversal are outside the slam / fast / combo rotation; the lunge spends the kiting count.
  const counts = !lunge && (override === null || override.controlled === true);
  return { state: { ...state, mode: "attack", modeMs: 0, action, attacks: counts ? state.attacks + 1 : state.attacks, attackId, hitsFired: 0,
    direction, facing, movedPx: 0, attackHits: timing.hitsMs.length, lastLandedHit: -1, lastHurtHit: -1, counterChain: false, committed: false, trackedPx: 0,
    lunge, kiteCount: lunge ? 0 : state.kiteCount, running: false, openingMs: 0, lastGap: Number.NaN, restart: false,
    fleeOutsideAtStart: !state.playerInside, windupScale, reversal: override?.reversal === true, wakeGuard: false, pressOn: false, guardBlocks: 0, guardHoldMs: 0,
    leap: null, special, swingReach: timing.move?.reachExtraStrides ?? null, swingRadial: timing.move?.radial ?? null, slams,
    slamAfterDown: special === "buttSlam" ? false : state.slamAfterDown === true, grab: null, blockedHits: 0,
    sinceGrab: action === "grab" ? 0 : (state.sinceGrab ?? 0) + (counts ? 1 : 0),
    // A summoner counts his attacks since the last cast (`KumaTuning.summons` everyAttacks); nobody else writes it. One with more than one
    // summon remembers the slot he cast (the next is looked for after it).
    ...(t.summons?.length ? { sinceSummon: action === "summon" ? 0 : (state.sinceSummon ?? t.summons[0]!.everyAttacks) + (counts ? 1 : 0) } : {}),
    ...(slot !== null && (t.summons?.length ?? 0) > 1 ? { summonSlot: slot } : {}),
    // A fighter with a skill counts his attacks since the last one (`KumaTuning.skill` everyAttacks); nobody else writes it.
    ...((t.skill ?? t.skill2) ? { sinceSkill: (state.sinceSkill ?? (t.skill ?? t.skill2)!.everyAttacks) + (counts ? 1 : 0), skillMarks: null,
      skillTriggered: false, skillFollow: false } : {}),
    // The duel's rhythm (`kuma.rhythm`): a swing from his stand or chase opens with the jab's window; his own swing starts a new exchange
    // (the launch may be followed again).
    jabCut: cuttable && t.rhythm !== undefined, followUps: 0, followOpen: false, windupSlow,
    ...(superMove ? { superAttack: attackId } : {}), ...(superMove && !armed ? { meter: 0 } : {}), ...(armed ? { superArmed: false } : {}) },
  // A carried super flashed already (`superArmed`): no second flash.
  events: [lunge ? { kind: "attack-start", action, attackId, lunge: true } : { kind: "attack-start", action, attackId },
    ...(superMove && !armed ? [{ kind: "super" as const, action, attackId }] : [])] };
}

/**
 * His skill starts (`KumaTuning.skill`, `NativeCityKumaSkill`): a dash kind is his dash under the skill's special (its tell the clip's
 * crouch); any other a swing of the skill's action drawn by his `skill` clip, its marks copied for the hit side. It counts as a rotation
 * attack and resets his skill cadence. Its super form (`superForm`, `superSkill`): `super:<kind>`, drawn by his `superSkill` clip (else his
 * `skill` clip, the special then the plain one), the slide with its passes to run. Null without its art at his heading.
 */
function kumaStartSkill(state: KumaCombatState, player: CityPoint, direction: CityPoint, input: KumaCombatInput, t: KumaTuning, controlled: boolean,
  superForm = false, slot = 0): KumaCombatStep | null {
  const spec = kumaSkillSlotSpec(t, slot)!, dashKind = kumaSkillDashKind(spec.kind);
  const facing = kumaActionFacing(input.projection, direction, dashKind ? "dash" : "slam", input.artFacing) ?? state.facing;
  let special = kumaSkillSpecial(spec.kind, superForm), timing = input.timing(spec.action, facing, 1, special);
  if (superForm && !timing?.skill) { special = kumaSkillSpecial(spec.kind); timing = input.timing(spec.action, facing, 1, special); }
  if (!timing?.skill) return null;
  const counted = { attacks: state.attacks + 1, sinceSkill: 0, skillMarks: timing.skill, skillTriggered: false, skillFollow: false,
    sinceGrab: (state.sinceGrab ?? 0) + 1, ...(t.skill2 ? { skillSlot: slot } : {}) };
  if (dashKind) {
    const dash = enterDash({ ...state, ...counted }, player, input, t, kumaNextAction(state.attacks + 1, t), false, timing.skill.windupMs ?? t.dash.windupMs,
      special);
    // The slide's super form runs `passes` times through the body (`superSkill.passes`, `stepKumaDash`).
    const passes = superForm && spec.kind === "slide" ? Math.max(1, Math.floor(t.superSkill?.passes ?? 1)) : 1;
    const runs = passes > 1 && dash.state.dash ? { dash: { ...dash.state.dash, passesLeft: passes - 1, pass: 0 }, attackHits: passes } : {};
    return { state: { ...dash.state, ...runs, controlGuard: false }, events: dash.events };
  }
  const attackId = state.attackId + 1;
  return { state: { ...state, ...counted, mode: "attack", modeMs: 0, action: spec.action, attackId, hitsFired: 0, direction, facing, movedPx: 0,
    attackHits: timing.hitsMs.length, lastLandedHit: -1, lastHurtHit: -1, counterChain: false, committed: false, trackedPx: 0, lunge: false,
    running: false, openingMs: 0, lastGap: Number.NaN, restart: false, fleeOutsideAtStart: !state.playerInside, windupScale: 1, reversal: false,
    wakeGuard: false, pressOn: false, guardBlocks: 0, guardHoldMs: 0, leap: null, special, swingReach: timing.move?.reachExtraStrides ?? null,
    swingRadial: timing.move?.radial ?? null, grab: null, blockedHits: 0, jabCut: false, followUps: 0, followOpen: false, windupSlow: 1,
    ...(controlled ? { controlGuard: false } : {}) },
  events: [{ kind: "attack-start", action: spec.action, attackId }] };
}

/**
 * His air chase (`NativeCityKumaAirChase`): turned to the body in the air, his `airCombo` clip from its first frame, committed at once with its
 * jump locked toward the body (`kumaLeapLock` — he flies to it from the takeoff and meets it at the first contact). Not a rotation attack.
 * Null without the clip.
 */
function kumaStartAirChase(state: KumaCombatState, player: CityPoint, input: KumaCombatInput, t: KumaTuning): KumaCombatStep | null {
  const direction = unit([player[0] - state.point[0], player[1] - state.point[1]]) ?? state.direction;
  const facing = kumaActionFacing(input.projection, direction, "combo", input.artFacing) ?? state.facing;
  const attackId = state.attackId + 1;
  // Two hits or three (`kumaAirChaseBranch`); a pack without the three-hit clip chases with two.
  const branch = kumaAirChaseBranch(attackId, t), long = branch === KUMA_AIR_CHASE ? null : input.timing("combo", facing, 1, branch);
  const special = long?.leap ? branch : KUMA_AIR_CHASE, timing = long?.leap ? long : input.timing("combo", facing, 1, KUMA_AIR_CHASE);
  if (!timing?.leap) return null;
  const base: KumaCombatState = { ...state, mode: "attack", modeMs: 0, action: "combo", attackId, hitsFired: 0, direction, facing, movedPx: 0,
    attackHits: timing.hitsMs.length, lastLandedHit: -1, lastHurtHit: -1, counterChain: false, committed: true, trackedPx: 0, lunge: false,
    running: false, openingMs: 0, lastGap: Number.NaN, restart: false, fleeOutsideAtStart: false, windupScale: 1, reversal: false, wakeGuard: false,
    pressOn: false, guardBlocks: 0, guardHoldMs: 0, dash: null, special, swingReach: timing.move?.reachExtraStrides ?? null,
    swingRadial: timing.move?.radial ?? null, grab: null, blockedHits: 0, jabCut: false, followUps: 0, followOpen: false, windupSlow: 1,
    skillMarks: null, leap: null };
  return { state: { ...base, leap: kumaLeapLock(base, player, input, timing, kumaLeapSpec(base, t)) },
    events: [{ kind: "attack-start", action: "combo", attackId }] };
}

/**
 * A slam is the butt slam now (`specials.buttSlam`, deterministic): the first slam after a knockdown, and in his low-HP phase (HP at most
 * `lowHpShare` of his max) every `lowHpEvery`-th slam (`slams`: this one's count).
 */
export function kumaButtSlamDue(state: Pick<KumaCombatState, "hp" | "slamAfterDown">, slams: number, t: KumaTuning): boolean {
  const spec = NATIVE_CITY_KUMA_MOVES.specials.buttSlam;
  if (spec.afterKnockdown && state.slamAfterDown === true) return true;
  const every = Math.max(0, Math.floor(spec.lowHpEvery));
  return every > 0 && state.hp <= spec.lowHpShare * t.hp && slams % every === 0;
}

/**
 * He rises with a reversal queued. Outside its measured reach he closes in with his chase gait; armour begins only with the swing.
 * In reach it starts immediately, windup × `reversalWindupRate`. A guard wake-up raises guard for `guardMs`. No `recovered`.
 */
function kumaWakeUp(s: KumaCombatState, input: KumaCombatInput, t: KumaTuning): KumaCombatStep {
  const risen: KumaCombatState = { ...s, knockdown: false, action: null, hitsFired: 0, attackHits: 0, lastLandedHit: -1, lastHurtHit: -1, counterChain: false,
    shiftRise: false };
  if (!input.hostile) return { state: enterReturn(risen, input), events: [] };
  // A person rises into his neutral: no reversal, no guard of the mix-up (`KumaControl`).
  if (input.control) return { state: toChase(risen), events: [] };
  // Up from a shift change (`kuma.phases`): the guard wake-up — a breath before the new shift, never the reversal.
  const wake = s.shiftRise === true ? "guard" : kumaWakeupKind(s.knockdowns, t);
  if (wake === "reversal") {
    const ready = { ...toChase(risen), reversal: true, running: kumaReengageRun(risen, input, t) };
    if (input.player && kumaGap(ready, input.player, input) <= kumaReversalStart(ready, input, t)) {
      const attack = startAttack(ready, input.player, input, t, false, kumaReversal(t));
      if (attack) return attack;
    }
    return { state: ready, events: [] };
  }
  if (wake === "guard") {
    const toward = input.player ? unit([input.player[0] - s.point[0], input.player[1] - s.point[1]]) : null;
    const facing = toward ? kumaScreenFacing(input.projection, toward) ?? s.facing : s.facing;
    return { state: { ...risen, mode: "cooldown", modeMs: 0, wakeGuard: true, guardBlocks: 0, guardHoldMs: 0, backedUnits: 0, direction: toward ?? s.direction, facing },
      events: [] };
  }
  return { state: { ...toChase(risen), running: kumaReengageRun(risen, input, t) }, events: [] };
}


function kumaReengageRun(s: KumaCombatState, input: KumaCombatInput, t: KumaTuning): boolean {
  return input.player !== null && kumaGap(s, input.player, input) > t.chase.reengageRunBeyondStrides * input.stepUnits;
}

function kumaReversal(t: KumaTuning): KumaAttackOverride {
  return { action: t.knockdown.wakeup.reversalAction, windupScale: Math.max(1e-3, t.knockdown.wakeup.reversalWindupRate), reversal: true };
}

/** Start inside the first drawn contact's reach. Closing uses walk/run frames, not a sliding attack or a larger hitbox. */
function kumaReversalStart(s: KumaCombatState, input: KumaCombatInput, t: KumaTuning): number {
  const action = t.knockdown.wakeup.reversalAction;
  const aim = input.player ? unit([input.player[0] - s.point[0], input.player[1] - s.point[1]]) : null;
  const facing = aim ? kumaActionFacing(input.projection, aim, action, input.artFacing) ?? s.facing : s.facing;
  const drawn = input.timing(action, facing, t.knockdown.wakeup.reversalWindupRate)?.move;
  const reach = drawn?.reachExtraStrides?.[0] ?? kumaAuthoredReachStrides(action, t);
  return Math.max(0, Math.min(kumaAttackStartStrides(action, drawn?.startStrides, t), reach)) * input.stepUnits;
}


function kumaTrack(s: KumaCombatState, input: KumaCombatInput, t: KumaTuning, dt: number): { readonly state: KumaCombatState; readonly abort: boolean } {
  const action = s.action ?? "slam", player = input.player;
  // stance and recoil skills (their own steps move him, `kumaSkillSwingStep`), the stretch (its arm covers the distance) and the matrix (he
  // leans back where he stands).
  const skill = kumaSkillKind(s.special);
  if (action === "summon" || skill === "counter" || skill === "brace" || skill === "recoil" || skill === "stretch" || skill === "matrix") {
    return { state: { ...s, committed: true }, abort: false };
  }
  let timing = input.timing(action, s.facing, s.windupScale, s.special);
  if (!timing) return { state: s, abort: false };
  if (!player) {
    return { state: s.modeMs >= kumaCommitMs(action, timing, s.lunge, t) ? { ...s, committed: true, leap: kumaLeapLock(s, null, input, timing, kumaLeapSpec(s, t)) } : s,
      abort: false };
  }
  let next = s;
  const aim = unit([player[0] - s.point[0], player[1] - s.point[1]]);
  if (aim) {
    const facing = kumaActionFacing(input.projection, aim, action, input.artFacing) ?? s.facing;
    const turned = facing === s.facing ? timing : input.timing(action, facing, s.windupScale, s.special);
    if (turned) {
      timing = turned;
      next = { ...next, direction: aim, facing, attackHits: turned.hitsMs.length, swingReach: turned.move?.reachExtraStrides ?? null,
        swingRadial: turned.move?.radial ?? null };
    }
  }
  const spec = s.lunge ? t.antiKite : t.attack;
  // The butt slam squats planted (no step-in walk): its leap covers the distance. The grab is planted too: a short step-in only
  // (`kuma.grab.trackStrides`) — backing out of its reach aborts it.
  const leaping = timing.leap !== undefined && !s.lunge;
  const track = action === "grab" && !s.lunge ? t.grab.trackStrides : spec.trackStrides;
  const launch = s.restart ? Math.max(0, t.strikes.dash.knockbackStrides) : 0;
  const budgetPx = leaping ? 0 : (Math.max(0, track) + launch) * kumaStepPx(input);
  const along = Math.hypot(...kumaScreenDelta(input.projection, next.direction));
  const left = Math.max(0, budgetPx - s.trackedPx);
  if (left > 0 && along > 1e-9 && (!s.lunge || s.modeMs >= t.antiKite.chargeMs)) {
    const gap = Math.hypot(player[0] - s.point[0], player[1] - s.point[1]) - input.contactUnits;
    // A windup the duel's rhythm slowed (`windupSlow`) steps in as much slower: the same ground by the same point of it.
    const step = walkToward(next, player, input, input.pacePxPerSec * Math.max(0, spec.trackPaceScale) * (s.windupSlow ?? 1),
      Math.min(gap - t.stopStrides * input.stepUnits, left / along), dt);
    next = { ...next, point: step.point, movedPx: step.movedPx, trackedPx: s.trackedPx + step.movedPx };
  }
  const gap = Math.hypot(player[0] - next.point[0], player[1] - next.point[1]) - input.contactUnits;
  // The butt slam reaches its leap + its shockwave; a drawn swing its first contact's (the ball's).
  const reach = (leaping ? kumaLeapReachStrides(kumaLeapSpec(s, t)) : Math.max(0, next.swingReach?.[0] ?? kumaAuthoredReachStrides(action, t))) * input.stepUnits + 1e-9;
  const dashable = !s.restart && t.dash.maxStrides > 0 && s.dashCooldownMs <= 0;
  // The wake-up reversal is committed from its first frame: it whiffs rather than abort (backing off is the read that punishes it).
  // A person's swing is committed from its first frame (`KumaControl`): it whiffs rather than abort.
  const cancellable = !s.restart && !s.reversal && !input.control && (!dashable || gap > t.dash.fleeRadiusStrides * input.stepUnits);
  // stepping in past the commit point, until its first contact (a drawn dash strikes from further out — the rising ball, 2026-10-11 —
  const restartShort = s.restart && gap > reach && next.modeMs < (timing.hitsMs[0] ?? 0);
  if (next.modeMs >= kumaCommitMs(action, timing, s.lunge, t) && !restartShort) {
    // Commit — unless the pace he is heading away at takes him out of reach by the first contact (on the frame it will fire).
    const away = Math.max(0, next.playerVel[0] * next.direction[0] + next.playerVel[1] * next.direction[1]);
    const toContact = Math.max(0, (timing.hitsMs[0] ?? next.modeMs) - next.modeMs);
    const ahead = dt > 0 ? Math.ceil(toContact / dt - 1e-9) * dt : toContact;
    if (cancellable && gap + away * ahead * Math.max(0, t.attack.abortPredictScale) > reach) return { state: next, abort: true };
    return { state: { ...next, committed: true, leap: leaping ? kumaLeapLock(next, player, input, timing, kumaLeapSpec(s, t)) : null }, abort: false };
  }
  const stillLeft = along > 1e-9 ? Math.max(0, budgetPx - next.trackedPx) / along : 0;
  return { state: next, abort: cancellable && gap > reach + stillLeft };
}

/**
 * He touched the ground out of the air (`rhythm.launch.air`): V's knockdown, its drawn fall picked up at the ground impact (after the
 * spike's bounce, at the lying step — the bounce flew the cells between). The ground blow is open as after V's knockdown; a shift's line
 * crossed in the air (`shiftRise`) makes it the shift's fall instead (no ground blow, the guard wake-up).
 */
function kumaAirLanding(s: KumaCombatState, input: KumaCombatInput, t: KumaTuning): KumaCombatState {
  const fallMs = Math.max(0, input.fallMs ?? NATIVE_CITY_COMBAT.exchangeFx.ko.launchMs);
  const impactMs = Math.min(fallMs, Math.max(0, input.fallImpactMs ?? fallMs));
  const shift = s.shiftRise === true;
  return { ...s, air: null, mode: "down", modeMs: s.air?.bounced ? fallMs : impactMs, action: null, movedPx: 0, counterChain: false,
    dash: null, restart: false, knockdown: true, knockdowns: shift ? s.knockdowns : s.knockdowns + 1, slamAfterDown: true,
    groundOpen: t.rhythm !== undefined && !shift, stringHits: 0, retaliate: false, hurtMs: 0, followOpen: false, chance: null };
}

export function stepKumaCombat(state: KumaCombatState, input: KumaCombatInput, t: KumaTuning,
  poise: NativeCityPoiseTuning = NATIVE_CITY_COMBAT.poise): KumaCombatStep {
  const dt = Number.isFinite(input.dtMs) ? Math.max(0, input.dtMs) : 0;
  const seen = input.player;
  const playerVel: CityPoint = seen && state.lastPlayer
    ? dt > 0 ? [(seen[0] - state.lastPlayer[0]) / dt, (seen[1] - state.lastPlayer[1]) / dt] : state.playerVel : [0, 0];
  const wasInside = state.playerInside === true;
  const inside = seen !== null && !kumaPlayerOutside(state, seen, input, t);
  const far = seen !== null && kumaGap(state, seen, input) > NATIVE_CITY_KUMA_MOVES.specials.bowling.farBeyondStrides * input.stepUnits;
  const farMs = inside ? 0 : (state.farMs ?? 0) + (far && state.mode !== "idle" && state.mode !== "return" ? dt : 0);
  const lastPlayer: CityPoint | null = seen ? [seen[0], seen[1]] : null;
  const dashCooldownMs = Math.max(0, (state.dashCooldownMs ?? 0) - dt), guardHoldMs = Math.max(0, (state.guardHoldMs ?? 0) - dt);
  // The step's state is built once (2026-10-30 — four copies a step were most of a bout's time). Its flight time, chance and poise read
  // only what the start of the step leaves as it was (mode, flight time, chance, poise, the held guard), so they are read off `state`.
  // step's body; it is built only when the flight time asks for it.
  const fleeMs = kumaFleeMs(state, inside, () => kumaPlayerGettingAway({ ...state, modeMs: state.modeMs + dt, movedPx: 0, lastPlayer, playerVel,
    dashCooldownMs, guardHoldMs, playerInside: inside, fleeOutsideAtStart: false, farMs }, seen, input, wasInside, t), dt);
  const chanceLeftMs = !state.chance ? 0 : state.mode === "hurt" ? state.chance.leftMs : state.chance.leftMs - dt;
  const chance = !state.chance ? state.chance : chanceLeftMs > 0 ? { ...state.chance, leftMs: chanceLeftMs } : null;
  // A person's guard held up does not refill (`guard.held`): only letting it down does.
  const regen = (state.mode === "chase" || state.mode === "attack" || state.mode === "abort" || state.mode === "cooldown" || state.mode === "hurt"
    || state.mode === "parried" || state.mode === "dash") && !(input.control?.guard === true && state.controlGuard === true);
  const recovered = regen ? kumaPoiseAfter(state, dt, poise) : state;
  let s: KumaCombatState = { ...state, modeMs: state.modeMs + dt, movedPx: 0, lastPlayer, playerVel, dashCooldownMs, guardHoldMs, playerInside: inside,
    fleeOutsideAtStart: state.fleeOutsideAtStart === true && !inside, farMs, fleeMs, chance, poise: recovered.poise, poiseIdleMs: recovered.poiseIdleMs };
  // Thrown up (`rhythm.launch.air`): he flies on the fight clock — up there he does nothing else; touching the ground lands him.
  let airEvents: readonly KumaCombatEvent[] = [];
  const airSpec = kumaAirSpec(t);
  if (s.air && (s.mode === "hurt" || s.mode === "down")) {
    const flown = airSpec ? stepKumaAir(s.air, dt, airSpec) : { air: null, bounced: false };
    if (flown.bounced) airEvents = [{ kind: "air", beat: "bounce", point: s.point }];
    if (flown.air) {
      s = { ...s, air: flown.air };
      if (s.mode === "hurt") return { state: s, events: airEvents };
    } else {
      airEvents = [{ kind: "air", beat: "land", point: s.point }];
      s = s.mode === "hurt" ? kumaAirLanding(s, input, t) : { ...s, air: null };
      if (s.mode === "down" && s.hp > 0) return { state: s, events: airEvents };
    }
  }
  switch (s.mode) {
    case "idle":
      return { state: input.hostile ? { ...toChase(s), poise: poise.max, poiseIdleMs: 0, counterChain: false, kiteCount: 0 } : state,
        events: [] };
    case "down": {
      // A knockdown (`kuma.knockdown`) lies `lieMs` after his drawn fall reaches its lying step; the KO lies `down.ms`.
      // With the duel's rhythm he lies longer (`kuma.rhythm.down.lieMs`): the ground blow's time.
      const lieMs = t.rhythm?.down.lieMs ?? t.knockdown.lieMs;
      const downMs = s.knockdown ? Math.max(0, input.fallMs ?? NATIVE_CITY_COMBAT.exchangeFx.ko.launchMs) + Math.max(0, lieMs) : t.down.ms;
      // The get-up is untouchable: the ground blow closes with it.
      return { state: s.modeMs >= downMs ? { ...s, mode: "getup", modeMs: 0, groundOpen: false } : s, events: airEvents };
    }
    case "getup":
      if (s.modeMs < input.getUpMs) return { state: s, events: [] };
      // Up from a knockdown: the wake-up mix-up, the fight goes on (no `recovered`).
      if (s.knockdown) return kumaWakeUp(s, input, t);
      return { state: enterReturn({ ...s, hp: t.hp, poise: poise.max, poiseIdleMs: 0 }, input), events: [{ kind: "recovered" }] };
    case "return": {
      if (input.hostile) return { state: { ...toChase(s), path: [] }, events: [] };
      const goal = s.path[0] ?? input.home;
      const step = walkToward(s, goal, input, input.pacePxPerSec, Number.POSITIVE_INFINITY, dt);
      const path = step.arrived ? s.path.slice(1) : s.path;
      const next = { ...s, point: step.point, movedPx: step.movedPx, facing: step.facing,
        phase: kumaWalkPhase(s.phase, step.movedPx, input.stridePx), path };
      if (step.arrived && path.length === 0) return { state: { ...next, mode: "idle", modeMs: 0, movedPx: 0 }, events: [{ kind: "home" }] };
      // A blocked walk home (someone stands in the way) simply waits; it never pushes through.
      return { state: next, events: [] };
    }
    default:
      break;
  }
  if (!input.hostile) return { state: enterReturn({ ...s, dash: null, restart: false }, input), events: [] };
  // The body he threw up (`NativeCityKumaAirChase`): he jumps after it as soon as he is free to. A person's fighter (`KumaControl`) jumps
  if (input.player && kumaAirChaseDue(s, input, t) && (!input.control || input.control.press === "light")) {
    const chase = kumaStartAirChase(s, input.player, input, t);
    if (chase) return chase;
  }
  if (s.mode === "dash") return stepKumaDash(s, input, t, dt);
  if (s.mode === "hurt") {
    if (s.modeMs < (s.hurtMs > 0 ? s.hurtMs : input.hurtMs)) return { state: s, events: [] };
    // A launch nobody followed (`kuma.rhythm.launch`) ends like an ender: his turn, the chance it ran in spent.
    const free = { ...toChase(s), counterChain: false, hurtMs: 0, stringHits: 0, retaliate: false, running: !input.control && kumaReengageRun(s, input, t),
      followOpen: false, ...(s.retaliate ? { chance: null } : {}) };
    // A person's turn after a flinch is his own (`KumaControl`): no retaliation, no run back.
    if (input.control) return { state: free, events: [] };
    // The bout AI backs off after a string on him (`boutAi.retreat`): no retaliation into the other's next swing.
    const backing = kumaBoutRetreat(free, input, t);
    if (backing.neutral) return { state: backing, events: [] };
    // After a launch, close with running feet before the retaliation. A swing cannot cover an entire knockback with its short step-in.
    const nextAction = input.player ? kumaPickAction(free, input.player, input, t) : "slam";
    const retaliateStart = nextAction === "grab" ? t.grab.startStrides : kumaAttackStartStrides(nextAction, undefined, t);
    if (s.retaliate && t.hurt.retaliate && input.player && kumaGap(s, input.player, input) <= retaliateStart * input.stepUnits) {
      const attack = startAttack(free, input.player, input, t, false);
      if (attack) return attack;
    }
    return { state: { ...free, running: s.retaliate || free.running }, events: [] };
  }
  if (s.mode === "parried") {
    if (s.modeMs < (s.recoilMs ?? input.parriedMs ?? NATIVE_CITY_COMBAT.parry.recoilMs)) return { state: s, events: [] };
    return { state: kumaBoutRetreat({ ...toChase(s), recoilMs: undefined, counterChain: false, stringHits: 0, retaliate: false, hurtMs: 0 }, input, t),
      events: [] };
  }
  if (s.mode === "break") {
    // He cannot act while staggered; standing up again gives him his whole poise back.
    if (s.modeMs < (input.breakMs ?? 1000)) return { state: s, events: [] };
    return { state: kumaBoutRetreat({ ...toChase(s), poise: poise.max, poiseIdleMs: 0, counterChain: false, stringHits: 0, retaliate: false, hurtMs: 0 },
      input, t), events: [] };
  }
  const player = input.player;
  const toward: CityPoint | null = player ? [player[0] - s.point[0], player[1] - s.point[1]] : null;
  if (s.mode === "attack") {
    // The butt slam in the air is committed: no dash out of a leap. Its squat starts from further out (`startStrides`), so there only
    const leapSwing = s.action === "slam" && input.timing("slam", s.facing, s.windupScale, s.special)?.leap !== undefined;
    // His skill is its own answer to distance: no flight dash out of it.
    if (s.hitsFired === 0 && !s.leap && s.action !== "summon" && kumaSkillKind(s.special) === null && !input.control
      && kumaFled(leapSwing ? { ...s, fleeOutsideAtStart: false } : s, player, input, wasInside, t)) {
      // A fled grab's dash restarts the swing the grab stood in for (never a grab on the spinning body).
      const resume = s.action === "grab" ? kumaNextAction(Math.max(0, s.attacks - 1), t) : s.action ?? "slam";
      return enterDash(s, player!, input, t, resume, false);
    }
    if (!s.committed && s.hitsFired === 0) {
      const tracked = kumaTrack(s, input, t, dt);
      if (tracked.abort) return enterAbort(tracked.state, t);
      s = tracked.state;
    }
    // The butt slam's flight: on toward the landing point (it lands on the contact frame, below).
    if (s.leap) s = kumaLeapStep(s, input);
    // His skill's own step (the recoil's hop and branch, the stance's window, the brace's shove): its clock may jump.
    if (s.skillMarks) s = kumaSkillSwingStep(s, input, t, dt);
    const timing = s.action ? input.timing(s.action, s.facing, s.windupScale, s.special) : null;
    const hitsMs = timing?.hitsMs ?? [];
    const events: KumaCombatEvent[] = [];
    let hitsFired = s.hitsFired;
    const action = s.action ?? "slam", spec = t.actions[action];
    const hold = s.grab && timing?.grab ? timing.grab : null;
    const totalMs = hold ? (hitsMs[0] ?? 0) + hold.holdMs : timing?.totalMs ?? 0;
    while (hitsFired < hitsMs.length && s.modeMs >= hitsMs[hitsFired]!) {
      // The summon cast's release: the slot's object appears (the session spawns it); the cast has no contact of its own.
      const cast = action === "summon" ? t.summons?.[s.summonSlot ?? 0] : undefined;
      if (cast) {
        const toward = (player && unit([player[0] - s.point[0], player[1] - s.point[1]])) ?? s.direction;
        events.push({ kind: "summon", summon: cast.kind, attackId: s.attackId, damage: cityFightSummonSpec(cast.kind).damage
          * Math.max(0, cast.damageScale), direction: toward, facing: s.facing });
        hitsFired++;
        continue;
      }
      // The stretch's fist overshoots a body too near (`kumaSkillStrikeMisses`): the contact goes out unthrown.
      if (kumaSkillStrikeMisses(s, player, input, t)) { hitsFired++; continue; }
      // (he is pushed away from KUMA).
      const round = kumaStrikeRound(s, action, hitsFired, t);
      const shock = round ? (player && unit([player[0] - s.point[0], player[1] - s.point[1]])) ?? s.direction : null;
      // The air combo (`NativeCityKumaAirChase`): his launching skill throws the body up; his chase juggles it and its last contact is the
      // spike (the slam's tier and damage).
      // His own ending after the spike (`KumaCombatTiming.airSpike`, 2026-10-22 4차) is one more air hit — on the bounce it lands, lifting nothing.
      const air = kumaAirChasing(s.special) ? (hitsFired === (timing?.airSpike ?? hitsMs.length - 1) ? "spike" as const : "hit" as const)
        : kumaSkillLaunches(s, t) || kumaEnderLaunches(s, hitsFired, hitsMs.length, t) ? "launch" as const : null;
      const hit = air === "spike" ? t.actions.slam : spec;
      events.push({ kind: "strike", action, attackId: s.attackId, hitIndex: hitsFired,
        damage: (hit.damage[air === "spike" ? 0 : hitsFired] ?? hit.damage.at(-1) ?? 0) * (kumaSuperSwing(s) ? NATIVE_CITY_COMBAT.super.damageScale : 1)
          * (kumaAirChasing(s.special) ? t.airChase?.damageScale ?? 1 : 1),
        tier: hit.tier, direction: shock ?? kumaStrikeDirection(input.projection, s.direction, s.facing),
        facing: shock ? kumaScreenFacing(input.projection, shock) ?? s.facing : s.facing, ...(kumaSuperSwing(s) ? { super: true as const } : {}),
        ...(air ? { air } : {}) });
      hitsFired++;
    }
    if (hold && s.grab) {
      const beats = [...hold.squeezeMs, hold.throwMs], at = s.modeMs - (hitsMs[0] ?? 0);
      let fired = s.grab.beats;
      const shock = (player && unit([player[0] - s.point[0], player[1] - s.point[1]])) ?? s.direction;
      while (fired < beats.length && at >= beats[fired]!) {
        const index = fired, throwing = index === beats.length - 1;
        // His super grab (2026-10-22 4차, `superAction: "grab"`): its beats take the super's damage, the throw flies further (the bout's).
        const superGrab = kumaSuperSwing(s);
        events.push({ kind: "grab", beat: throwing ? "throw" : "squeeze", attackId: s.attackId, index,
          damage: (spec.damage[index] ?? spec.damage.at(-1) ?? 0) * (superGrab ? NATIVE_CITY_COMBAT.super.damageScale : 1),
          direction: kumaStrikeDirection(input.projection, shock, s.facing), facing: s.facing, ...(superGrab ? { super: true as const } : {}) });
        fired++;
      }
      if (fired !== s.grab.beats) s = { ...s, grab: { beats: fired } };
    }
    if (s.modeMs < totalMs) return { state: { ...s, hitsFired }, events };
    // A swing that landed nothing (out of reach, dodged) counts toward the anti-kite lunge; a landed / blocked one reset it.
    const whiffed = s.attackHits > 0 && s.lastLandedHit < 0 && action !== "summon";
    const stand: KumaCombatState = { ...s, hitsFired, mode: "cooldown", modeMs: 0, kiteCount: whiffed ? s.kiteCount + 1 : s.kiteCount, restart: false,
      reversal: false, wakeGuard: false, backedUnits: 0, grab: null };
    // Finish the authored throw, then follow its landing. The catch and the release still keep their full readable poses.
    if (hold && s.grab && s.grab.beats > hold.squeezeMs.length) return { state: { ...toChase(stand), running: true }, events };
    if (player && !s.chance && !input.control && kumaChainGrabDue(s, player, input, t)) {
      const grab = startAttack(stand, player, input, t, false, CHAIN_GRAB);
      if (grab) return { state: grab.state, events: [...events, ...grab.events] };
    }
    if (s.pressOn && player && !s.chance && !input.control) {
      const next = startAttack(stand, player, input, t, false);
      if (next) return { state: next.state, events: [...events, ...next.events] };
    }
    return { state: stand, events };
  }
  if (s.mode === "abort") {
    if (kumaFled(s, player, input, wasInside, t)) return enterDash(s, player!, input, t, kumaNextAction(s.attacks, t), true, t.dash.chaseWindupMs);
    const rewound = s.modeMs >= t.attack.abortRecoveryMs * Math.max(0, Math.min(1, t.attack.abortRewindShare));
    const facing = rewound && toward ? kumaScreenFacing(input.projection, toward) ?? s.facing : s.facing;
    const next = { ...s, facing, direction: (toward && unit(toward)) ?? s.direction };
    return { state: s.modeMs >= t.attack.abortRecoveryMs ? { ...toChase(next), action: null } : next, events: [] };
  }
  if (s.mode === "cooldown") {
    if (input.control) return kumaControlledStand(s, input);
    // The bout AI reads the other's swing in his stand (`boutAi.react`): his guard up through it, or a step back (his chase walks it).
    if (t.boutAi) {
      s = kumaBoutReact(s, input, t.boutAi, t);
      if (((s.backstep ?? 0) > 1e-9 || s.vault) && !s.chance) return { state: toChase(s), events: [] };
    }
    // His matrix answers a high shot he sees coming from his stand too (2026-10-25, 이토 — a reaction: the aim comes while he rests between
    // his swings, and the chase alone would read it too late).
    const matrix = kumaSkillSlotOf(t, "matrix");
    if (matrix !== null && player && !s.chance && kumaSkillDue(s, player, input, t, "matrix")) {
      const attack = startAttack(s, player, input, t, false, kumaSkillOverride(t, false, matrix));
      if (attack) return attack;
    }
    // can do nothing: no dash, no press-on, the stand holds until it ends.
    if (!s.chance && kumaFled(s, player, input, wasInside, t)) return enterDash(s, player!, input, t, kumaNextAction(s.attacks, t), true);
    if (s.pressOn && player && !s.chance) {
      const attack = startAttack(s, player, input, t, false);
      if (attack) return attack;
    }
    const facing = toward ? kumaScreenFacing(input.projection, toward) : null;
    const facingPlayer = { ...s, facing: facing ?? s.facing, direction: (toward && unit(toward)) ?? s.direction };
    const next = kumaStepBack(facingPlayer, player, input, t, dt) ?? facingPlayer;
    const far = toward !== null && t.chase.leaveStandBeyondStrides > 0
      && Math.hypot(toward[0], toward[1]) - input.contactUnits > t.chase.leaveStandBeyondStrides * input.stepUnits;
    // A blocked contact holds the stance through the next chain opening. Keep modeMs running: rewinding it repeats the step back.
    const done = !s.chance && (s.guardHoldMs ?? 0) <= 0 && s.aiGuard == null && (s.wakeGuard ? s.modeMs >= t.knockdown.wakeup.guardMs
      : s.modeMs >= kumaCooldownMs(s.attackId, t.cooldownMs) * (kumaShiftStep(s.hp, t)?.cooldownScale ?? 1)
        || far && s.modeMs >= NATIVE_CITY_COMBAT.exchange.counter.cooldownMs);
    // Up from a knockdown (the guard wake-up's stand): knocked away, so he comes back running.
    return { state: done ? { ...toChase(next), running: s.wakeGuard && kumaReengageRun(next, input, t) } : next, events: [] };
  }
  // A person's neutral (`KumaControl`): his walk, his guard, his press — in place of the chase.
  if (input.control) return kumaControlledNeutral(s, input.control, input, t, dt);
  // chase: a player in another view leaves him standing where he is.
  if (!player) return { state: s, events: [] };
  if (s.chance) {
    const facing = kumaScreenFacing(input.projection, [player[0] - s.point[0], player[1] - s.point[1]]) ?? s.facing;
    return { state: { ...s, facing }, events: [] };
  }
  // The bout AI's neutral (`boutAi`): its read of the other's swing, a step back, room for a body down, a measure's hold.
  if (t.boutAi) {
    const neutral = kumaBoutAiChase(s, player, input, t, t.boutAi, dt);
    if (neutral.hold) return { state: neutral.state, events: [] };
    s = neutral.state;
  }
  if (kumaFled(s, player, input, wasInside, t)) return enterDash(s, player, input, t, kumaNextAction(s.attacks, t), true, t.dash.chaseWindupMs);
  const gap = Math.hypot(player[0] - s.point[0], player[1] - s.point[1]) - input.contactUnits;
  // keeping away; the cast does not spend the kite count, so the lunge follows if he still keeps away).
  const lunge = !s.reversal && t.antiKite.threshold > 0 && s.kiteCount >= t.antiKite.threshold
    && !((t.summons?.length ?? 0) > 0 && kumaSummonSlot(s, player, input, t) !== null);
  // A fighter with measured reaches starts each swing at its own distance (`attackStartStridesBy`); KUMA at one — his butt slam from
  // further out (`native-city-kuma-moves.json` buttSlam `startStrides`: its leap closes the gap).
  // His skill when it is due (`KumaTuning.skill`): before the rotation, from its own distance.
  const skillSlot = !lunge && !s.reversal && !kumaSuperDue(s, t, input) ? kumaSkillDueSlot(s, player, input, t) : null;
  const skillNow = skillSlot !== null, skillSpec = skillNow ? kumaSkillSlotSpec(t, skillSlot) : undefined;
  // His super as his skill's super form (`superSkill`) starts where his skill does.
  const superSkillNow = !lunge && !s.reversal && !skillNow && t.superSkill !== undefined && t.skill !== undefined && kumaSuperDue(s, t, input)
    && kumaSkillDrawn(s.point, player, input, t);
  const next = s.reversal ? t.knockdown.wakeup.reversalAction : lunge ? t.antiKite.action : skillSpec ? skillSpec.action : kumaPickAction(s, player, input, t);
  // A drawn swing starts at its own distance (`native-city-kuma-moves.json` startStrides: the ball reaches further) — asked only when no
  // measured start wins (`kumaAttackStartStrides`); the lunge starts from its own.
  let drawnStart: number | undefined;
  // A summon cast starts at its slot's distance.
  const castStart = skillSpec ? skillSpec.startStrides : superSkillNow ? t.skill.startStrides
    : next === "summon" && !lunge && !s.reversal ? kumaSummonStartStrides(t, kumaSummonSlot(s, player, input, t) ?? 0) : undefined;
  if (castStart === undefined && !lunge && t.attackStartStridesBy?.[next] === undefined) {
    const aim = unit([player[0] - s.point[0], player[1] - s.point[1]]);
    const heading = aim ? kumaActionFacing(input.projection, aim, next, input.artFacing) : null;
    drawnStart = heading ? input.timing(next, heading)?.move?.startStrides : undefined;
  }
  const start = castStart ?? kumaAttackStartStrides(next, drawnStart, t);
  const startUnits = s.reversal ? kumaReversalStart(s, input, t) : (lunge ? Math.max(t.antiKite.startStrides, start) : start) * input.stepUnits;
  // The bout AI's measure (`boutAi.measure`): once per attack, just outside the swing's start, he may stand a beat first — not into an opening.
  if (t.boutAi && !lunge && !s.reversal && (s.measured ?? -1) !== s.attacks && input.opponentOpen !== true
    && gap <= startUnits + t.boutAi.measure.marginStrides * input.stepUnits) {
    const measuring = kumaBoutMeasure(s, t, t.boutAi);
    if (measuring) {
      const facing = kumaScreenFacing(input.projection, [player[0] - s.point[0], player[1] - s.point[1]]) ?? s.facing;
      return { state: { ...measuring, facing }, events: [] };
    }
    s = { ...s, measured: s.attacks };
  }
  if (gap <= startUnits) {
    // A rotation swing from his chase is the one a jab can cut in its first moments (`kuma.rhythm.jabCut`); the lunge and the reversal not.
    const attack = startAttack(s, player, input, t, lunge, s.reversal ? kumaReversal(t) : skillNow ? kumaSkillOverride(t, false, skillSlot) : null,
      !lunge && !s.reversal);
    if (attack) return attack;
  }
  const c = t.chase;
  const openingMs = dt <= 0 ? s.openingMs : Number.isFinite(s.lastGap) && gap > s.lastGap + 1e-9 ? s.openingMs + dt : 0;
  const running = s.running || gap > c.runBeyondStrides * input.stepUnits || c.runWhenOpeningMs > 0 && openingMs >= c.runWhenOpeningMs;
  const pace = input.pacePxPerSec * (running ? c.runPaceScale : NATIVE_CITY_COMBAT.tempo.kuma.chasePaceScale);
  const step = walkToward(s, player, input, pace, gap - Math.min(t.stopStrides * input.stepUnits, startUnits), dt);
  const facing = step.movedPx > 0 ? step.facing
    : kumaScreenFacing(input.projection, [player[0] - s.point[0], player[1] - s.point[1]]) ?? s.facing;
  const stride = running ? input.runStridePx ?? input.stridePx * c.runPaceScale : input.stridePx;
  return { state: { ...s, point: step.point, movedPx: step.movedPx, facing, phase: kumaWalkPhase(s.phase, step.movedPx, stride), running,
    openingMs, lastGap: gap }, events: [] };
}

/**
 * A person's neutral (`KumaControl`, 2026-10-22): facing the opponent, his press starts its swing at once (no start distance, no rotation,
 * no seeded windup — the same button is the same move); else his held guard stands; else he walks as told — toward the opponent up to
 * `stopStrides` from contact, away still facing him with his walk played backwards (`spacing.backPaceScale`).
 */
function kumaControlledNeutral(s: KumaCombatState, control: KumaControl, input: KumaCombatInput, t: KumaTuning, dt: number): KumaCombatStep {
  const player = input.player;
  if (!player) return { state: { ...s, movedPx: 0, controlGuard: false }, events: [] };
  const toward = unit([player[0] - s.point[0], player[1] - s.point[1]]) ?? s.direction;
  const faced: KumaCombatState = { ...s, direction: toward, facing: kumaScreenFacing(input.projection, toward) ?? s.facing, running: false };
  const press = kumaControlPress(faced, control, input, t);
  if (press) {
    const attack = startAttack(faced, player, input, t, false, press);
    if (attack) return { state: { ...attack.state, controlGuard: false }, events: attack.events };
  }
  if (control.guard || control.walk === 0) return { state: { ...faced, movedPx: 0, controlGuard: control.guard }, events: [] };
  const forward = control.walk > 0;
  const pace = input.pacePxPerSec * NATIVE_CITY_COMBAT.tempo.kuma.chasePaceScale * (forward ? 1 : Math.max(0, t.spacing?.backPaceScale ?? 1));
  const gap = Math.hypot(player[0] - s.point[0], player[1] - s.point[1]) - input.contactUnits;
  const away: CityPoint = [s.point[0] - toward[0] * input.stepUnits, s.point[1] - toward[1] * input.stepUnits];
  const step = walkToward(faced, forward ? player : away, input, pace,
    forward ? gap - t.stopStrides * input.stepUnits : input.stepUnits, dt);
  return { state: { ...faced, point: step.point, movedPx: step.movedPx, controlGuard: false,
    phase: kumaWalkPhase(s.phase, step.movedPx, input.stridePx, !forward) }, events: [] };
}

/** The swing a person's press starts (`KumaControlPress`), or null (no press, an empty meter, no summon to cast). */
function kumaControlPress(s: KumaCombatState, control: KumaControl, input: KumaCombatInput, t: KumaTuning): KumaAttackOverride | null {
  const swing = (action: NativeCityKumaActionKind, extra: Partial<KumaAttackOverride> = {}): KumaAttackOverride =>
    ({ action, windupScale: 1, reversal: false, controlled: true, ...extra });
  switch (control.press) {
    case "light": return swing("combo");
    case "heavy": return swing("slam");
    case "super": return cityFightMeterFull(s.meter) ? swing(kumaSuperAction(t), { superMove: true }) : null;
    case "special": {
      // A summoner's slots in turn from the one after his last cast, each while fewer than its kind's `maxLive` are out, `everyAttacks` of
      // launchers in a row and KO'd KUMA in 24 s) and it is drawn at the heading the cast would turn to (`kumaActionFacing`, as the AI's).
      // The AI's own choices (the gap, the seeded share) are his to make.
      // The AI's own slots (`aiOnly`, 2026-10-22) are never X's.
      const slots = t.summons ?? [], playable = slots.some(spec => !spec.aiOnly);
      // A fighter with a skill and no summon of a person's: X is his skill, on its cadence (`KumaTuning.skill` everyAttacks).
      if (!playable && t.skill && input.player) {
        return kumaSkillReady(s, t) && kumaSkillDrawn(s.point, input.player, input, t) ? kumaSkillOverride(t, true) : null;
      }
      if (!playable || !input.summons) return null;
      const facing = kumaActionFacing(input.projection, s.direction, "summon", input.artFacing) ?? s.facing;
      for (let i = 1; i <= slots.length; i++) {
        const slot = ((s.summonSlot ?? -1) + i) % slots.length, spec = slots[slot]!;
        if (spec.aiOnly) continue;
        if ((input.summons.live[spec.kind] ?? 0) >= Math.max(0, Math.floor(cityFightSummonSpec(spec.kind).maxLive))) continue;
        if ((s.sinceSummon ?? spec.everyAttacks) < spec.everyAttacks) continue;
        if (input.timing("summon", facing, 1, kumaCastSpecial(spec.clip)) !== null) return swing("summon", { summonSlot: slot });
      }
      return null;
    }
    default: return null;
  }
}

/**
 * A person's stand after his swing (`KumaControl`): none, unless the swing whiffed — then the counter window (`exchange.counter.cooldownMs`)
 * holds him, facing the opponent, so a whiff can be punished as the AI's can. No flight dash, no press-on, no step back.
 */
function kumaControlledStand(s: KumaCombatState, input: KumaCombatInput): KumaCombatStep {
  const toward = input.player ? unit([input.player[0] - s.point[0], input.player[1] - s.point[1]]) : null;
  const faced = toward ? { ...s, direction: toward, facing: kumaScreenFacing(input.projection, toward) ?? s.facing } : s;
  // A whiff is the last contact missing (`kumaCombatCounterOpen`'s): a string that lands its first two and whiffs its last stands open too.
  const whiffed = s.attackHits > 0 && s.lastLandedHit < s.attackHits - 1;
  const standMs = whiffed ? NATIVE_CITY_COMBAT.exchange.counter.cooldownMs : 0;
  return { state: s.modeMs >= standMs ? toChase(faced) : faced, events: [] };
}
