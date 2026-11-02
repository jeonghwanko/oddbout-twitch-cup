import { nativeCityMeleeInCone, stepNativeCityKnock } from "./NativeCityMelee";
import { stepNativeCityFollowUp } from "./NativeCityFollowUp";
import { stepNativeCityFoeFollowUp } from "./NativeCityFoeFollowUp";
import { NATIVE_CITY_COMBAT, type NativeCityKumaActionKind, type NativeCityPlayerAirMove, type NativeCityPlayerActionKind } from "./NativeCityCombatTuning";
import { nativeCityDodgeEvadeLeftMs, nativeCityParryArmed, nativeCityVaultPasses } from "./NativeCityExchange";
import type { VillageFacing } from "../VillageFacing";
import type { CityPoint } from "../../world/NativeCityDefinition";
import { createNativeCityFight, cutNativeCityFightHit, freezeNativeCityFight, nativeCityWallFreezeMs, rematchNativeCityFight, skipNativeCityKoLie, slowNativeCityFight,
  snapNativeCityFight, stepNativeCityFight,
  type NativeCityFightKo } from "./NativeCityFight";
import { kumaScreenFacing, NATIVE_CITY_OPPOSITE_FACING } from "./NativeCityKumaGeometry";
import type { NativeCityKumaFighterEvent } from "./NativeCityKumaFighter";
import { cancelNativeCityPlayerSwing, createNativeCityPlayerSwing, deferNativeCityPlayerSwingContacts, markNativeCityPlayerSwingLanded,
  nativeCityPlayerAirTimeline, nativeCityPlayerSwingAirLift, nativeCityPlayerSwingCancellable, nativeCityPlayerSwingCharging,
  releaseNativeCityPlayerSwingCharge, startNativeCityPlayerSwing, stepNativeCityPlayerSwing } from "./NativeCityPlayerSwing";
import { cancelNativeCityDodge, createNativeCityPlayerDefense, nativeCityDodgeHopBackStrides, cutNativeCityDefense, endNativeCityVault, holdNativeCityGuard,
  nativeCityDefenseBlockStunned, nativeCityDefenseBowing, nativeCityDefenseDodgeReady, nativeCityDefenseDodging, nativeCityDefenseLocksMovement,
  latchNativeCityGuard, nativeCityDefensePressAgeMs, pressNativeCityGuard, startNativeCityBow, startNativeCityDodge, stepNativeCityPlayerDefense } from "./NativeCityPlayerDefense";
import { nativeCityPlayerVaultApexMs, nativeCityPlayerVaultInvulnerableLeftMs, nativeCityPlayerVaultLocks, startNativeCityPlayerVault,
  stepNativeCityPlayerVault }
  from "./NativeCityPlayerVault";
import { nativeCityPlayerBackstepLocks, nativeCityPlaceholderBackstepTimeline, startNativeCityPlayerBackstep,
  stepNativeCityPlayerBackstep } from "./NativeCityPlayerBackstep";
import { calmKuma, closeFightFrame, drawnFacing, emit, endBackstep, fightLocksMovement, guardWanted, hitLocked, inputLocked,
  interruptPlayer, playerFreeToGuard, playerIncapacitated, playerPressDropped, nativeCityUnit, openFightFrame, playerRadius, queuePress, swinging,
  walkCancellable, opponentOf, type FightEnemy, type FightFrame, type NativeCityFightSimContext, type NativeCityFightSimResult, type NativeCityFightSimState } from "./NativeCityFightFrame";
import { aimMove, endSpin, fightEnemies, fightEnemiesOf, fightOn, nearestFightEnemy } from "./CityFightFoes";
import { strikeFightEnemy, whiffNearEnemy } from "./NativeCityFightContacts";
import { counterKuma, spendKumaCounterEarly, enemyStrikesPlayer, kumaGrabBeat, kumaStrikesPlayer, reflectedSummonStrikesFoe, settleGuardWhiff,
  summonStrikesPlayer } from "./NativeCityFightDefend";
import type { CityFightStageLine } from "./CityFightStageLine";
import { cityFightSummonAlong, cityFightSummonThreats, type CityFightSummon, type CityFightSummonOutcome } from "./CityFightSummons";
import { NATIVE_CITY_PLAYER_ID } from "./NativeCityFactions";
import { cityFightMeterFull } from "./CityFightMeter";
import { cityFightSummonSpec } from "./CityFightSummonTuning";

export { NATIVE_CITY_FACING_SCREEN, nativeCityFightFrameMs, nativeCityPlanFromScreen, nativeCitySpinSteps, nativeCityUnit, SPIN_ORDER,
  type NativeCityEnemyBlow, type NativeCityExchangeBeat, type NativeCityExchangeFreeze, type NativeCityFightFeel,
  type NativeCityFightFinale, type NativeCityFightSimContext, type NativeCityFightSimEvent, type NativeCityFightSimResult, type NativeCityFightSimState,
  type NativeCityKumaFightOps, type NativeCityKumaReceive, type NativeCityKumaStrikeLanding, type NativeCityPlayerArt, type NativeCityPlayerArtAction,
  type NativeCityQueuedPress } from "./NativeCityFightFrame";



export function createNativeCityFightSim(): NativeCityFightSimState {
  return Object.freeze({ fight: createNativeCityFight(), swing: createNativeCityPlayerSwing(), defense: createNativeCityPlayerDefense(), queued: null,
    chain: Object.freeze({ next: 0, idleMs: 0, missed: false }), enderGateMs: 0, guardUp: false, stance: Object.freeze({ facing: "down-right",
      heading: [1, 0] as CityPoint }), lockedFacing: null, lockedHeading: null, lean: "right", released: false, finale: null, finales: 0, followUp: null, foeFollowUp: null, vault: null,
    backstep: null, backstepCooldownMs: 0, pursuit: null, meter: 0 });
}

/** A press of C (`combo`) or V (`attack`), X or Z with what the scene says he faces: the drawn heading and the standing plan heading. */
export interface NativeCityFightPress {
  readonly blocked: boolean;
  readonly facing: VillageFacing;
  readonly heading: CityPoint;
}

export interface NativeCityFightSimStep<K> extends NativeCityFightSimResult<K> {
  /** This frame's lunge + knockback (plan), slid along bodies and walls by the scene. */
  readonly travel: CityPoint;
  /** Screen ms of this frame outside the freeze (the fight zoom releases on it). */
  readonly free: number;
}

/**
 * Swinging (until its cancel point), staggered by a blow, knocked down, dodging, block-stunned, parrying, bowing or spinning: walking
 * and clicking wait.
 */
export function nativeCityFightSimLocksMovement(state: NativeCityFightSimState): boolean {
  return state.pursuit !== null || fightLocksMovement(state);
}

/** While locked, guarding or just released from the spin: the facing and standing heading the scene keeps (a push must not turn him). */
export function nativeCityFightSimHeld(state: NativeCityFightSimState): { readonly facing: VillageFacing | null; readonly heading: CityPoint | null } | null {
  return state.pursuit !== null || fightLocksMovement(state) || state.guardUp || state.released
    ? { facing: state.lockedFacing, heading: state.lockedHeading } : null;
}


export function nativeCityFightSimUntouchable(state: NativeCityFightSimState, threat: NativeCityKumaActionKind | null)
  : { readonly afterBlowMs: number; readonly dodgeMs: number; readonly vaultMs: number } {
  if (state.fight.ko !== null) return { afterBlowMs: 0, dodgeMs: 0, vaultMs: 0 };
  const dodge = state.defense.dodgeMs;
  // The vault's i-frames, only against a swing they let pass (the triangle's gold — `nativeCityVaultPasses`; no known swing: the window).
  return { afterBlowMs: Math.max(0, state.fight.victim.invulnerableMs), dodgeMs: dodge === null ? 0 : nativeCityDodgeEvadeLeftMs(dodge, threat),
    vaultMs: threat === null || nativeCityVaultPasses(threat) ? nativeCityPlayerVaultInvulnerableLeftMs(state.vault) : 0 };
}

/** In a fight right now: an enemy stands engaged in this view. */
export function nativeCityFightSimEngaged<K>(ctx: Pick<NativeCityFightSimContext<K>, "kuma" | "kumaOps" | "factions" | "otto" | "opponentId">)
  : boolean {
  return fightEnemiesOf(ctx.kuma, ctx.kumaOps, ctx.factions, ctx.otto, ctx.opponentId).some(enemy => enemy.engaged);
}


export function swingNativeCityFightSim<K>(state: NativeCityFightSimState, ctx: NativeCityFightSimContext<K>,
  press: NativeCityFightPress & { readonly kind: NativeCityPlayerActionKind }): NativeCityFightSimResult<K> & { readonly accepted: boolean } {
  const f = openFightFrame(state, ctx);
  const accepted = trySwing(f, press.kind, press.blocked, press.facing, press.heading);
  return { ...closeFightFrame(f), accepted };
}

/** S (`super`, 2026-10-20): his super when his meter is full and he is free to strike (`trySuper`). */
export function superNativeCityFightSim<K>(state: NativeCityFightSimState, ctx: NativeCityFightSimContext<K>, press: NativeCityFightPress)
  : NativeCityFightSimResult<K> & { readonly accepted: boolean } {
  const f = openFightFrame(state, ctx);
  const accepted = !press.blocked && trySuper(f, press.facing, press.heading);
  return { ...closeFightFrame(f), accepted };
}

/**
 * V let go (2026-10-18, `player.actions.attack.charge`): the charging swing moves on to its kick, or a V still waiting in the queue is
 * marked let go (its swing fires as soon as the crouch is reached). No-op when nothing is charging (`nativeCityFightSimHeavyHeld`).
 */
export function releaseNativeCityFightSimHeavy<K>(state: NativeCityFightSimState, ctx: NativeCityFightSimContext<K>): NativeCityFightSimResult<K> {
  const f = openFightFrame(state, ctx), s = f.s;
  if (nativeCityPlayerSwingCharging(s.swing)) s.swing = releaseNativeCityPlayerSwingCharge(s.swing);
  else if (s.queued?.kind === "attack" && s.queued.released !== true) s.queued = { ...s.queued, released: true };
  // A V still running in (the chase before the kick, the ground blow) carries the release to its swing.
  else if (s.pursuit?.kind === "attack" && s.pursuit.released !== true) s.pursuit = { ...s.pursuit, released: true };
  return closeFightFrame(f);
}


export function nativeCityFightSimOnBeat(state: NativeCityFightSimState): boolean {
  const beat = chainBeat(state);
  return beat !== "early" && beat !== "dropped";
}


export function nativeCityFightSimAirMove(state: NativeCityFightSimState): { readonly move: NativeCityPlayerAirMove; readonly landed: boolean } | null {
  const swing = state.swing.current, air = swing?.timeline.jump?.air;
  if (!swing || !air || swing.elapsedMs >= air.landMs) return null;
  return { move: air.move, landed: swing.landed.some(Boolean) };
}

/** A V is still held down: its swing charges, or it waits in the queue not yet let go. */
export function nativeCityFightSimHeavyHeld(state: NativeCityFightSimState): boolean {
  return nativeCityPlayerSwingCharging(state.swing) || state.queued?.kind === "attack" && state.queued.released !== true
    || state.pursuit?.kind === "attack" && state.pursuit.released !== true;
}


export function dodgeNativeCityFightSim<K>(state: NativeCityFightSimState, ctx: NativeCityFightSimContext<K>, press: NativeCityFightPress)
  : NativeCityFightSimResult<K> & { readonly accepted: boolean } {
  const f = openFightFrame(state, ctx);
  const accepted = tryDodge(f, press.blocked, press.facing, press.heading);
  return { ...closeFightFrame(f), accepted };
}


export function backstepNativeCityFightSim<K>(state: NativeCityFightSimState, ctx: NativeCityFightSimContext<K>, press: NativeCityFightPress)
  : NativeCityFightSimResult<K> & { readonly accepted: boolean } {
  const f = openFightFrame(state, ctx);
  const accepted = tryBackstep(f, press.blocked, press.facing, press.heading);
  return { ...closeFightFrame(f), accepted };
}

/**
 * Z went down (keyboard event or pad edge): arms the parry window. Only in a fight. A dodge's tail gives way to the guard; so does his
 * own swing, at once (2026-10-18: X / Z / ←← cut a swing from its first frame — `NativeCityCancelBy` "defense").
 */
export function pressNativeCityFightSimGuard<K>(state: NativeCityFightSimState, ctx: NativeCityFightSimContext<K>): NativeCityFightSimResult<K> {
  const f = openFightFrame(state, ctx), s = f.s;
  // Held by a grab: Z does nothing (no guard, no parry window, no whiffed re-press).
  if (fightOn(f) && s.fight.grab === null) {
    s.pursuit = null;
    // A dodge's tail gives way to the guard (beat 4: dodge, then parry the string's next blow).
    s.defense = cancelNativeCityDodge(s.defense).state;
    s.defense = pressNativeCityGuard(s.defense);
    // Z cuts his own swing at once (`defense` cancel): the guard / parry window rises this frame, not after the swing. A broken gauge
    // keeps the guard down, so then the press must not end the swing for nothing.
    if (swinging(s) && !hitLocked(s) && !s.defense.gauge.broken) { s.swing = cancelNativeCityPlayerSwing(s.swing); interruptPlayer(s, ["queue"]); }
  }
  return closeFightFrame(f);
}

/** Z this frame: `held` (key or pad button down) and the scene's current facing / standing heading (the guard aims from them). */
export function holdNativeCityFightSimGuard<K>(state: NativeCityFightSimState, ctx: NativeCityFightSimContext<K>, held: boolean,
  stance: { readonly facing: VillageFacing; readonly heading: CityPoint }): NativeCityFightSimResult<K> {
  const f = openFightFrame(state, ctx), s = f.s;
  s.defense = holdNativeCityGuard(s.defense, held && fightOn(f));
  if (held) s.pursuit = null;
  s.stance = { facing: stance.facing, heading: stance.heading };
  return closeFightFrame(f);
}

/**
 * The scene moved him this frame under his own control: after the hit lock that cuts the rest of the drawn reaction (and a parry's /
 * block's tail); a walk past the swing's cancel point cuts the rest of it and drops a press waiting for it — an ender's follow-through
 * holds (`enderGateMs`).
 */
export function walkNativeCityFightSim(state: NativeCityFightSimState): NativeCityFightSimState {
  const fight = cutNativeCityFightHit(state.fight), cutDefense = cutNativeCityDefense(state.defense);
  const cut = state.swing.current !== null && walkCancellable(state);
  // The vault's crouched landing tail (after its lock) is cut by a walk too — the X cooldown counts from now.
  const vaultTail = state.vault !== null && !nativeCityPlayerVaultLocks(state.vault);
  const defense = vaultTail ? endNativeCityVault(cutDefense) : cutDefense;
  // The backstep's settle after its lock too (its cooldown counts from now).
  const backstepTail = state.backstep !== null && !nativeCityPlayerBackstepLocks(state.backstep);
  if (fight === state.fight && defense === state.defense && !cut && !vaultTail && !backstepTail && !state.pursuit) return state;
  return Object.freeze({ ...state, fight, defense, pursuit: null, ...(vaultTail ? { vault: null } : {}),
    ...(backstepTail ? { backstep: null, backstepCooldownMs: NATIVE_CITY_COMBAT.player.backstep.cooldownMs } : {}),
    ...(cut ? { swing: cancelNativeCityPlayerSwing(state.swing), queued: null } : {}) });
}

/**
 * One frame, before the scene moves him (`dtMs`: screen ms, `nativeCityFightFrameMs`): the fight's step (the shared freeze, the snap out,
 * the slow-mo — its curve read at the beat's age before the step — then on the fight ms that leaves: invulnerability, his KO, hit lock,
 * spin and knockback), the ender gate, the spin's end, the defense clocks, the guard, the finale's beats, his swing and its contacts on
 * the enemies, the input queue — and this frame's travel (the swing's step-in up to the enemies' bodies + the knockback).
 */
export function stepNativeCityFightSim<K>(state: NativeCityFightSimState, ctx: NativeCityFightSimContext<K>, dtMs: number): NativeCityFightSimStep<K> {
  const f = openFightFrame(state, ctx), s = f.s;
  s.released = false;
  const dt = Number.isFinite(dtMs) ? Math.max(0, dtMs) : 0;
  const slow = s.fight.clock.slowMo, spinning = s.fight.stun !== null;
  // The whole fight plays at the scene's `playbackRate` (`tempo.playbackRate`, 2026-10-19) while an enemy is engaged; outside it at 1.
  const baseRate = ctx.playbackRate !== undefined && nativeCityFightSimEngaged(ctx) ? ctx.playbackRate : 1;
  const step = stepNativeCityFight(s.fight, { dtMs: dt, slowMoScale: slow ? ctx.feel.slowMoScale(slow.beat, slow.ageMs) : 1, stepUnits: ctx.stepUnits,
    baseRate });
  s.fight = step.state;
  const { fightDt, free } = step;
  let landed = false, stood: NativeCityFightKo | null = null;
  for (const event of step.events) {
    if (event.kind === "koLanded") landed = true;
    else if (event.kind === "stood") stood = event.ko;
    else if (event.kind === "grabDropped") emit(f, { kind: "grabDropped" });
  }
  emit(f, { kind: "stepped", dtMs: dt, fightDt, free, spinning, ko: s.fight.ko ?? stood, landed, stood, lockedFacing: s.lockedFacing,
    lockedHeading: s.lockedHeading });
  if (s.enderGateMs > 0) s.enderGateMs = Math.max(0, s.enderGateMs - fightDt);
  if (s.backstepCooldownMs > 0) s.backstepCooldownMs = Math.max(0, s.backstepCooldownMs - fightDt);
  for (const event of step.events) if (event.kind === "stunEnded") endSpin(f, event.recovered);
  const dodgeBefore = s.defense.dodgeMs;
  s.defense = stepNativeCityPlayerDefense(s.defense, fightDt, s.guardUp);
  const back = stepBackstep(f, fightDt), vaulted = stepVault(f, fightDt), hop = stepDodgeHop(f, dodgeBefore);
  let travel: CityPoint = [vaulted[0] + back[0] + hop[0], vaulted[1] + back[1] + hop[1]];
  stepGuard(f);
  stepFinale(f, fightDt);
  stepNativeCityFollowUp(f, fightDt);
  stepNativeCityFoeFollowUp(f, fightDt);
  const pursuitTravel = stepPursuit(f, fightDt);
  travel = [travel[0] + pursuitTravel[0], travel[1] + pursuitTravel[1]];
  if (s.finale) s.finale.screenMs += dt;
  const current = s.swing.current;
  if (current) {
    const { direction, attackId, kind, timeline, facing: swingFacing } = current;
    const swingStep = stepNativeCityPlayerSwing(s.swing, fightDt, ctx.feel.lungeCurve);
    s.swing = swingStep.state;
    const lunge = lungeRoom(f, direction, swingStep.lungeUnits);
    travel = [travel[0] + direction[0] * lunge, travel[1] + direction[1] * lunge];
    emit(f, { kind: "swingClock", swing: kind, timeline, elapsedMs: s.swing.current ? s.swing.current.elapsedMs : timeline.totalMs });
    for (const contact of swingStep.contacts) {
      const contactMs = timeline.hitsMs[contact.localIndex] ?? 0;
      // One landed contact freezes the rest of this frame: a later contact in the same frame (a long frame) waits.
      // Its reach: read off the art where the clip records its tip (`melee.reachFromArt`), else `melee.reachExtraStrides`.
      const reach = timeline.reachExtraStrides?.[contact.localIndex];
      const landedOn = fightEnemies(f).some(enemy => strikeFightEnemy(f, enemy, attackId, contact.hitIndex, direction, contact.damage, contact.tier,
        kind, contactMs, swingFacing, timeline, reach, contact.charge, contact.super === true));
      // The jumping heel drop meets the ground at its contact, landed or not: the shockwave at the heel (`heelDrop`).
      if (timeline.jump && !timeline.jump.air && Math.abs(contactMs - timeline.jump.contactMs) < 1e-6) {
        const ahead = playerRadius(f) + HEEL_AHEAD_STRIDES * ctx.stepUnits, point = ctx.point;
        emit(f, { kind: "heelDrop", heel: [point[0] + direction[0] * ahead, point[1] + direction[1] * ahead], direction, hit: landedOn });
      }
      if (landedOn) {
        // The contacts this long frame also passed are judged on the next frames (the hit-lag hold rewound the clock to this one).
        s.swing = deferNativeCityPlayerSwingContacts(markNativeCityPlayerSwingLanded(s.swing, contact.localIndex), contact.localIndex);
        break;
      }
      whiffNearEnemy(f, direction);
    }
  } else if (!s.pursuit) s.chain.idleMs += fightDt;
  // The queued press (C/V/X/Z during a swing) runs at the swing's cancel point, or the frame it ends.
  runQueue(f);
  // His knockback's travel this frame (the fight's step caught it up along the strike axis); a throw that meets the stage line's end splats.
  if (step.knock) {
    const knock = wallSplat(f, state.fight.knock, step.knock);
    travel = [travel[0] + knock[0], travel[1] + knock[1]];
  }
  return { ...closeFightFrame(f), travel, free };
}


export function answerNativeCityKumaStrikes<K>(state: NativeCityFightSimState, ctx: NativeCityFightSimContext<K>,
  events: readonly NativeCityKumaFighterEvent[]): NativeCityFightSimResult<K> {
  const f = openFightFrame(state, ctx);
  for (const event of events) {
    if (event.kind === "recovered") calmKuma(f);
    // He spent his meter on his super (`super`, 2026-10-20): the fight holds for its flash, both bodies.
    else if (event.kind === "super") {
      f.s.fight = freezeNativeCityFight(f.s.fight, NATIVE_CITY_COMBAT.super.flashMs);
      emit(f, { kind: "superFlash", by: opponentOf(f), point: f.ctx.kumaOps.point(f.kuma) });
    }
    else if (event.kind === "knock-wall") {
      const freeze = nativeCityWallFreezeMs();
      f.s.fight = freezeNativeCityFight(f.s.fight, freeze);
      emit(f, { kind: "kumaWall", point: event.point, direction: event.direction, strides: event.strides, freeze });
    }
    // Out of the air (`kuma.rhythm.launch.air`): the spike's bounce holds both clocks like a wall splat; the landing is the knockdown's.
    else if (event.kind === "air") {
      const freeze = event.beat === "bounce" ? nativeCityWallFreezeMs()
        : (f.ctx.kumaOps.tuning.rhythm?.launch.air?.landHitStopMs ?? 0) * NATIVE_CITY_COMBAT.hitStopScale;
      if (freeze > 0) f.s.fight = freezeNativeCityFight(f.s.fight, freeze);
      emit(f, { kind: "kumaAir", beat: event.beat, point: event.point, freeze });
    }
    else if (event.kind === "strike") {
      kumaStrikesPlayer(f, event.action, event.attackId, event.hitIndex, event.direction, event.damage, event.tier, event.facing as VillageFacing | undefined,
        event.super === true, event.pass === true);
    }
    // The grab's hold: a squeeze, then the throw (`kuma.grab`).
    else if (event.kind === "grab") kumaGrabBeat(f, event);
  }
  // A parry re-press nothing consumed has now whiffed (`parry.whiffCost`).
  settleGuardWhiff(f);
  return closeFightFrame(f);
}


export function answerNativeCitySummonTouches<K>(state: NativeCityFightSimState, ctx: NativeCityFightSimContext<K>, line: CityFightStageLine,
  touches: readonly { readonly summon: CityFightSummon; readonly targetId: string }[])
  : NativeCityFightSimResult<K> & { readonly outcomes: readonly CityFightSummonOutcome[] } {
  const f = openFightFrame(state, ctx);
  const outcomes = touches.map(touch => touch.targetId === NATIVE_CITY_PLAYER_ID ? summonStrikesPlayer(f, touch.summon, line)
    : reflectedSummonStrikesFoe(f, touch.summon, line));
  return { ...closeFightFrame(f), outcomes };
}


export function answerNativeCityEnemyStrike<K>(state: NativeCityFightSimState, ctx: NativeCityFightSimContext<K>, strike: {
  readonly enemyId: string; readonly direction: CityPoint; readonly from: CityPoint; readonly damage: number }):
  NativeCityFightSimResult<K> & { readonly outcome: "dodge" | "block" | "hit" | "ko" | "none" } {
  const f = openFightFrame(state, ctx);
  const outcome = enemyStrikesPlayer(f, strike.enemyId, strike.direction, strike.from, strike.damage);
  return { ...closeFightFrame(f), outcome };
}


export function rematchNativeCityFightSim<K>(state: NativeCityFightSimState, ctx: NativeCityFightSimContext<K>, spot: CityPoint): NativeCityFightSimResult<K> {
  const f = openFightFrame(state, ctx), s = f.s;
  s.fight = rematchNativeCityFight(s.fight);
  s.swing = cancelNativeCityPlayerSwing(s.swing);
  // A fresh defense, the guard gauge too (a broken gauge carried into the rematch left him guardless for ~0.7 s — 2026-10-12 review).
  s.defense = createNativeCityPlayerDefense();
  s.queued = null;
  s.chain = { next: 0, idleMs: 0, missed: false };
  s.vault = null;
  s.backstep = null;
  s.backstepCooldownMs = 0;
  s.meter = 0;
  s.followUp = null;
  s.foeFollowUp = null;
  const point = ctx.point, projection = ctx.projection;
  const toward = nativeCityUnit([spot[0] - point[0], spot[1] - point[1]]);
  if (toward) { s.lockedHeading = toward; s.lockedFacing = kumaScreenFacing(projection, toward) ?? s.lockedFacing; }
  f.kuma = ctx.kumaOps.rematch(f.kuma, spot, toward ? kumaScreenFacing(projection, [-toward[0], -toward[1]]) ?? undefined : undefined);
  return closeFightFrame(f);
}


export function challengeNativeCityFightSim<K>(state: NativeCityFightSimState, ctx: NativeCityFightSimContext<K>): NativeCityFightSimResult<K> {
  const f = openFightFrame(state, ctx), s = f.s;
  s.defense = createNativeCityPlayerDefense();
  s.queued = null;
  s.guardUp = false;
  s.backstep = null;
  s.backstepCooldownMs = 0;
  s.chain = { next: 0, idleMs: 0, missed: false };
  s.meter = 0;
  s.followUp = null;
  s.foeFollowUp = null;
  return closeFightFrame(f);
}


export function standDownNativeCityFightSim<K>(state: NativeCityFightSimState, ctx: NativeCityFightSimContext<K>): NativeCityFightSimResult<K> {
  const f = openFightFrame(state, ctx);
  calmKuma(f);
  f.s.followUp = null;
  f.s.foeFollowUp = null;
  f.s.fight = skipNativeCityKoLie(f.s.fight);
  return closeFightFrame(f);
}


function wallSplat<K>(f: FightFrame<K>, before: NativeCityFightSimState["fight"]["knock"], knock: CityPoint): CityPoint {
  const s = f.s, line = f.ctx.stage, step = f.ctx.stepUnits;
  // A launch, or the KO blow's flight (`player.ko.launchStrides`, 2026-10-20 — not a knockdown's).
  const koFlight = before?.flightMs !== undefined && s.fight.ko !== null && s.fight.ko.downed !== true;
  if (!line || (before?.launch !== true && !koFlight)) return knock;
  const along = (p: CityPoint) => (p[0] - line.origin[0]) * line.direction[0] + (p[1] - line.origin[1]) * line.direction[1];
  const point = f.ctx.point, r = playerRadius(f), from = along(point), to = along([point[0] + knock[0], point[1] + knock[1]]);
  const limit = Math.max(line.min + r, Math.min(line.max - r, to));
  if (Math.abs(limit - to) < 1e-9) return knock;
  const spec = NATIVE_CITY_COMBAT.knockback.launch, allowed = limit - from, wanted = to - from;
  const left = Math.abs(wanted - allowed) + (s.fight.knock ? stepNativeCityKnock(s.fight.knock, 0, step).leftUnits : 0);
  const scale = Math.abs(wanted) > 1e-9 ? Math.max(0, allowed / wanted) : 0;
  const clipped: CityPoint = [knock[0] * scale, knock[1] * scale];
  if (left < spec.wallMinStrides * step) return clipped;
  const freeze = nativeCityWallFreezeMs();
  const ko = s.fight.ko;
  // The flight ends on the wall (a thrown knock-out skips to its ground impact; the KO blow's fall plays on where he stopped).
  s.fight = freezeNativeCityFight({ ...s.fight, knock: null,
    ...(before?.launch === true && ko && ko.elapsedMs < ko.timing.impactMs
      ? { ko: Object.freeze({ ...ko, elapsedMs: Math.max(ko.elapsedMs, ko.timing.impactMs - 1e-3) }) } : {}) },
  freeze);
  const at: CityPoint = [point[0] + clipped[0], point[1] + clipped[1]];
  const direction = nativeCityUnit(knock) ?? before.direction;
  emit(f, { kind: "playerWall", point: at, direction: [direction[0], direction[1]], strides: step > 0 ? left / step : 0, freeze });
  return clipped;
}

/** Where the heel strikes the ground ahead of his body (strides beyond his radius): the heel drop's shockwave centre. */
const HEEL_AHEAD_STRIDES = 0.6;

// ── the frame's rules ───────────────────────────────────────────────────────────────────────────────────────────────────────

function trySwing<K>(f: FightFrame<K>, kind: NativeCityPlayerActionKind, blocked: boolean, facing: VillageFacing, heading: CityPoint): boolean {
  const s = f.s;
  // Knocked down, held by a grab, spinning dizzy, bowing or past his finisher (the KO plays to his bow — 2026-10-17: a V pressed on
  // after the KO swung at the fallen body before the bow): the press is dropped. The sliding tackle is a fight move only.
  if (blocked || playerPressDropped(s)) return false;
  // V into his gauge's window (`kuma.rhythm.counter`): the counter, at once — from his guard, a block stun or his own swing too.
  if (kind === "attack" && tryCounter(f, facing, heading)) return true;
  if (kind === "dashAttack" && !fightOn(f)) return false;
  // His super's run-in (`trySuper`, the meter already spent) takes C and V as its own (2026-10-20 review: a C mashed on the way cut it).
  if (s.pursuit?.super === true && (kind === "combo" || kind === "attack")) return true;
  if (s.pursuit && !s.pursuit.vault && kind === (s.pursuit.kind ?? "combo")) return true;
  s.pursuit = null;
  // timed (a V on the beat is the string's knockdown ender — kept until the cut like the C).
  const beat = kind === "combo" || kind === "attack" ? chainBeat(s) : null;
  if (kind === "combo" && beat === "dropped") return true;
  if (kind === "combo" && beat === "early") {
    s.chain.missed = true; s.chain.next = 0;
    if (s.queued?.kind === "combo") s.queued = null;
    emit(f, { kind: "chainMiss" });
    return true;
  }
  if (swinging(s) && !hitLocked(s)) {
    // Up in an air move (`player.air`): only the next air move cuts it (from the height he is at); anything else waits for the landing.
    const airFrom = nativeCityPlayerSwingAirLift(s.swing), by = airMoveFor(f, kind, airFrom) ? "air" : "swing";
    if (nativeCityPlayerSwingCancellable(s.swing, by)) {
      s.swing = cancelNativeCityPlayerSwing(s.swing); approachOrSwing(f, kind, facing, heading, false, false, airFrom); return true;
    }
    queuePress(f, kind, facing, heading);
    if (beat === "timed") s.queued = { ...s.queued!, timed: true };
    return true;
  }
  // A lock that ends on its own: the press waits for it (parry -> C comes out the moment the pose ends).
  if (inputLocked(s)) { queuePress(f, kind, facing, heading); return true; }
  // No swing while the guard is up: C / V wait for it to drop (`runQueue`, if still fresh — 2026-10-16 audit: a C pressed on the frame
  // Z let go read last frame's guard and was dropped, so the cut of the third shift's chain grab failed 4 / 4). The →→ tackle is refused.
  if (s.guardUp && kind !== "dashAttack") { queuePress(f, kind, facing, heading); return true; }
  if (s.guardUp || fightLocksMovement(s)) return false;
  approachOrSwing(f, kind, facing, heading);
  return true;
}


function chainBeat(s: Pick<NativeCityFightSimState, "swing" | "chain">): "dropped" | "early" | "timed" | null {
  const current = s.swing.current;
  if (!current || current.kind !== "combo" || current.timeline.ender) return null;
  if (s.chain.missed) return "dropped";
  const open = (current.timeline.hitsMs[0] ?? 0) - NATIVE_CITY_COMBAT.tempo.player.chainTiming.openBeforeContactMs;
  return current.elapsedMs < open - 1e-9 ? "early" : "timed";
}

/**
 * X against a fighter (`dodge.vault`): the vault — over his head to body contact (+ `landGapStrides`) behind him — when he is engaged, at
 * most `triggerGapStrides` between their bodies and in front of the aimed heading (on the side stage X aims at him whatever the heading,
 * 2026-10-18 손맛 2단계). `charge` (2026-10-18): from up to `chargeMaxGapStrides` he runs in first (`player.pursuit`) and vaults on arrival
 * (`stepPursuit`). False: no vault — X is the hop.
 */
function tryVault<K>(f: FightFrame<K>, facing: VillageFacing, heading: CityPoint, charge = false): boolean {
  const s = f.s, art = f.ctx.art, spec = NATIVE_CITY_COMBAT.dodge.vault, point = f.ctx.point, step = f.ctx.stepUnits;
  const kuma = fightEnemies(f).find(enemy => enemy.vaultable && enemy.engaged && enemy.vulnerable);
  if (!kuma || !art.vault) return false;
  const toward: CityPoint = [kuma.point[0] - point[0], kuma.point[1] - point[1]], distance = Math.hypot(toward[0], toward[1]);
  const gap = distance - kuma.radius - playerRadius(f);
  // On the side stage he vaults the one opponent on the line, whichever way the stick leans.
  const at = f.ctx.stage ? nativeCityUnit(toward) : null;
  if (at) { heading = at; facing = drawnFacing(f, at, "vault"); }
  if (gap > spec.triggerGapStrides * step + 1e-9) {
    // Out of reach: run in to him (the stage's pursuit, his pace and limits), and vault on arrival — not into a summoned object coming at
    // him (its run-in has no i-frames): that X is the hop on the spot.
    if (!charge || !at || gap > spec.chargeMaxGapStrides * step + 1e-9 || summonComing(f)) return false;
    interruptPlayer(s, ["queue", "chain", "hitTail"]);
    s.pursuit = { enemyId: kuma.id, direction: at, facing, ms: 0, travelled: 0, vault: true };
    s.lockedFacing = facing; s.lockedHeading = at;
    return true;
  }
  const { direction, swing } = aimMove(f, facing, heading, "vault");
  if (!nativeCityMeleeInCone(point, direction, kuma.point, spec.coneHalfAngleDeg)) return false;
  const timeline = art.vault(swing);
  if (!timeline) return false;
  const over = Math.max(0, toward[0] * direction[0] + toward[1] * direction[1]);
  // No room behind him on the stage line (its end, a wall): X is the bow-duck — a vault would land inside his body (2026-10-12 review).
  const landUnits = over + kuma.radius + playerRadius(f) + spec.landGapStrides * step, line = f.ctx.stage;
  if (line) {
    const along = (p: CityPoint) => (p[0] - line.origin[0]) * line.direction[0] + (p[1] - line.origin[1]) * line.direction[1];
    const land = along([point[0] + direction[0] * landUnits, point[1] + direction[1] * landUnits]), r = playerRadius(f);
    if (land < line.min + r - 1e-6 || land > line.max - r + 1e-6) return false;
  }
  s.vault = startNativeCityPlayerVault(timeline, swing, direction, over, landUnits);
  s.lockedFacing = swing;
  s.lockedHeading = direction;
  interruptPlayer(s, ["queue", "chain", "hitTail"]);
  emit(f, { kind: "vaultStart", direction, facing: swing });
  return true;
}

/**
 * The vault this frame (fight ms): its travel (pose to pose — the root jumps to each step's place), its landing (he now faces back
 * toward KUMA: the locked facing and heading turn round) and its end (the X cooldown counts from then).
 */
function stepVault<K>(f: FightFrame<K>, fightDt: number): CityPoint {
  const s = f.s, vault = s.vault;
  if (!vault) return [0, 0];
  const step = stepNativeCityPlayerVault(vault, fightDt), { direction } = vault;
  s.vault = step.state;
  // The apex beat (`dodge.vault.apex`): slow on his head, then the snap (a short freeze; its release burst whips him over).
  const apex = NATIVE_CITY_COMBAT.dodge.vault.apex, onHead = nativeCityPlayerVaultApexMs(vault.timeline), after = vault.ms + fightDt;
  if (!f.ctx.reducedMotion && s.vault) {
    const snapAt = onHead + apex.slowFightMs;
    if (vault.ms < onHead && after >= onHead) s.fight = slowNativeCityFight(s.fight, { scale: apex.slowScale,
      holdMs: apex.slowFightMs / apex.slowScale + 50, releaseMs: 0, vignette: 0, desaturate: apex.desaturate, cooldownMs: 0 });
    else if (vault.ms < snapAt && after >= snapAt) s.fight = slowNativeCityFight(snapNativeCityFight(s.fight, apex.snapStopMs),
      { scale: apex.whipScale, holdMs: apex.whipMs, releaseMs: 0, vignette: 0, desaturate: 0, cooldownMs: 0 });
  }
  if (step.landed) {
    s.lockedFacing = NATIVE_CITY_OPPOSITE_FACING[vault.facing];
    s.lockedHeading = [-direction[0], -direction[1]];
    emit(f, { kind: "vaultLanded", direction });
  }
  if (!s.vault) s.defense = endNativeCityVault(s.defense);
  return [direction[0] * step.travelUnits, direction[1] * step.travelUnits];
}

/**
 * The dodge's hop this frame (`dodge.hop`, 2026-10-16): back away from the opponent, then in again, along the heading it was aimed at
 * (`lockedHeading`, toward him). `before`: the dodge's ms before this frame's step (null: none).
 */
function stepDodgeHop<K>(f: FightFrame<K>, before: number | null): CityPoint {
  const s = f.s, heading = s.lockedHeading;
  if (before === null || !heading) return [0, 0];
  const after = s.defense.dodgeMs ?? NATIVE_CITY_COMBAT.dodge.totalMs;
  const delta = (nativeCityDodgeHopBackStrides(after) - nativeCityDodgeHopBackStrides(before)) * f.ctx.stepUnits;
  return [-heading[0] * delta, -heading[1] * delta];
}

/**
 * The backstep this frame (fight ms): its travel away from the opponent (eased out from the push-off to the landing), its landing and
 * its end (its cooldown counts from then).
 */
function stepBackstep<K>(f: FightFrame<K>, fightDt: number): CityPoint {
  const s = f.s, backstep = s.backstep;
  if (!backstep) return [0, 0];
  const step = stepNativeCityPlayerBackstep(backstep, fightDt), { direction } = backstep;
  s.backstep = step.state;
  if (step.landed) emit(f, { kind: "backstepLanded", direction });
  if (!s.backstep) s.backstepCooldownMs = NATIVE_CITY_COMBAT.player.backstep.cooldownMs;
  return [direction[0] * step.travelUnits, direction[1] * step.travelUnits];
}

/**
 * Close a knocked-back foe with running feet before C — and before V on a foe on the ground (`kuma.rhythm.down`, 2026-10-18: the ground
 * blow); no chase without an explicit press, or outside the fight stage.
 */
function approachOrSwing<K>(f: FightFrame<K>, kind: NativeCityPlayerActionKind, facing: VillageFacing, heading: CityPoint, released = false,
  superMove = false, airFrom = 0): void {
  // An air move (`player.air`) jumps to him itself: no run-in.
  const air = superMove ? null : airMoveFor(f, kind, airFrom);
  if (air) { beginAirSwing(f, air, facing, heading, airFrom, kind); return; }
  const enemy = nearestFightEnemy(f), spec = NATIVE_CITY_COMBAT.player.pursuit, point = f.ctx.point;
  // C and V close a stage gap first (2026-10-18, user: "V 발차기를 했는데 왜 안 맞냐" — the one-blow V lost the string's 1.55-stride
  // walk-in, so from a C's distance it fell short).
  // An object he can knock back about to reach him (`reflect`, 2026-10-20): he swings where he stands, at it.
  const chases = (kind === "combo" || kind === "attack") && reflectableFrom(f) === null;
  if (chases && f.ctx.stage && enemy?.vulnerable) {
    const delta: CityPoint = [enemy.point[0] - point[0], enemy.point[1] - point[1]], direction = nativeCityUnit(delta);
    const gap = (Math.hypot(...delta) - enemy.radius - playerRadius(f)) / f.ctx.stepUnits;
    if (direction && gap > spec.stopGapStrides && gap <= spec.startGapStrides && direction[0] * heading[0] + direction[1] * heading[1] > 0) {
      const drawn = drawnFacing(f, direction, kind);
      interruptPlayer(f.s, ["moves", "hitTail"]);
      f.s.pursuit = { enemyId: enemy.id, direction, facing: drawn, ms: 0, travelled: 0, ...(kind === "combo" ? {} : { kind }),
        ...(kind === "attack" && released ? { released: true as const } : {}), ...(superMove ? { super: true as const } : {}) };
      f.s.lockedFacing = drawn; f.s.lockedHeading = direction;
      return;
    }
  }
  beginSwing(f, kind, facing, heading, released, superMove);
}

function stepPursuit<K>(f: FightFrame<K>, dt: number): CityPoint {
  const s = f.s, chase = s.pursuit, spec = NATIVE_CITY_COMBAT.player.pursuit;
  if (!chase) return [0, 0];
  const enemy = fightEnemies(f).find(e => e.id === chase.enemyId && e.engaged && e.vulnerable);
  const delta: CityPoint = enemy ? [enemy.point[0] - f.ctx.point[0], enemy.point[1] - f.ctx.point[1]] : [0, 0];
  if (!enemy || !f.ctx.stage || inputLocked(s) || s.guardUp || playerIncapacitated(s)
    || delta[0] * chase.direction[0] + delta[1] * chase.direction[1] <= 0) {
    s.pursuit = null; return [0, 0];
  }
  if (dt <= 0) return [0, 0];
  const gap = Math.hypot(...delta) - enemy.radius - playerRadius(f);
  // X's run-in ends in the vault once he is in its reach (no vault there — a wall behind him: the hop where he stands).
  const stopGap = chase.vault ? NATIVE_CITY_COMBAT.dodge.vault.triggerGapStrides - VAULT_ARRIVAL_STRIDES : spec.stopGapStrides;
  if (gap <= stopGap * f.ctx.stepUnits + 1e-6) {
    s.pursuit = null;
    if (chase.vault) { if (!tryVault(f, chase.facing, chase.direction)) hop(f, chase.facing, chase.direction); }
    else beginSwing(f, chase.kind ?? "combo", chase.facing, chase.direction, chase.released === true, chase.super === true);
    return [0, 0];
  }
  if (chase.ms >= spec.maxMs || chase.travelled >= spec.maxTravelStrides * f.ctx.stepUnits) {
    s.pursuit = null; return [0, 0];
  }
  // His super's run-in goes at `super.runInPaceScale` x the pace (2026-10-21: after the cut-in the blow must arrive, not jog in).
  const pace = spec.paceStridesPerSec * (chase.super === true ? NATIVE_CITY_COMBAT.super.runInPaceScale : 1);
  const travel = Math.max(0, Math.min(pace * f.ctx.stepUnits * dt / 1000,
    gap - stopGap * f.ctx.stepUnits, spec.maxTravelStrides * f.ctx.stepUnits - chase.travelled));
  s.pursuit = { ...chase, ms: chase.ms + dt, travelled: chase.travelled + travel };
  return [chase.direction[0] * travel, chase.direction[1] * travel];
}

/** `released`: a V whose key is already up (it fires as soon as the crouch is reached — `player.actions.attack.charge`). */
function beginSwing<K>(f: FightFrame<K>, kind: NativeCityPlayerActionKind, pressFacing: VillageFacing, pressHeading: CityPoint, released = false,
  superMove = false): void {
  // The run-in ended under an opponent thrown up (`player.air`): the jump to meet him.
  const air = superMove ? null : airMoveFor(f, kind, 0);
  if (air) { beginAirSwing(f, air, pressFacing, pressHeading, 0, kind); return; }
  const s = f.s, stepUnits = f.ctx.stepUnits;
  // The sliding tackle goes at the nearest engaged enemy as it starts: a press queued before a crossover (the vault) must not slide away
  // from him (2026-10-12 review) — the press only said "toward him". On the side-scroll stage every swing does (2026-10-17 Otto fight
  // the one he swings at).
  // A C or V swung at an object about to reach him (`reflect`) faces it, not the enemy (2026-10-20 review: one coming from behind him after a
  // crossover was swung away from).
  let facing = pressFacing, heading = pressHeading;
  if (kind === "dashAttack" || f.ctx.stage) {
    const enemy = nearestFightEnemy(f), point = f.ctx.point;
    const incoming = kind === "combo" || kind === "attack" ? reflectableFrom(f) : null;
    const toward = incoming ?? (enemy ? nativeCityUnit([enemy.point[0] - point[0], enemy.point[1] - point[1]]) : null);
    if (toward) { heading = toward; facing = drawnFacing(f, toward, kind); }
  }
  const { direction, swing } = aimMove(f, facing, heading, kind);
  // The vault's landing tail (from behind him) and the backstep's settle give way to the swing.
  interruptPlayer(s, ["hitTail", "moves"]);
  emit(f, { kind: "swingStart" });
  // The C chain: the next swing while the last one is running or ended less than chainResetMs ago, else the jab; V starts it over.
  const reset = !swinging(s) && s.chain.idleMs > NATIVE_CITY_COMBAT.tempo.player.chainResetMs;
  const segment = kind === "combo" ? (reset ? 0 : s.chain.next) : null;
  // How long he stood free before it (`freeBeforeMs` — the jab's cut takes an answer from a free stance, `kuma.rhythm.jabCut`).
  const freeBeforeMs = swinging(s) ? 0 : s.chain.idleMs;
  s.swing = startNativeCityPlayerSwing(s.swing, { kind, facing: swing, direction, stepUnits, timeline: f.ctx.art.swing(swing, kind, segment),
    freeBeforeMs, released, ...(superMove ? { super: true } : {}) });
  const segments = NATIVE_CITY_COMBAT.player.actions.combo.damage.length;
  s.chain = { next: segment === null || segment + 1 >= segments ? 0 : segment + 1, idleMs: 0, missed: false };
  s.lockedFacing = swing;
  s.lockedHeading = direction;
}


function airMoveFor<K>(f: FightFrame<K>, kind: NativeCityPlayerActionKind, airFrom: number): NativeCityPlayerAirMove | null {
  const spec = NATIVE_CITY_COMBAT.player.air;
  if (!spec || !f.ctx.stage) return null;
  const point = f.ctx.point, stepUnits = Math.max(1e-9, f.ctx.stepUnits);
  const stompReach = (e: FightEnemy) => Math.hypot(e.point[0] - point[0], e.point[1] - point[1]) / stepUnits - spec.stomp.rootGapStrides
    <= spec.stomp.maxTravelStrides + 1e-6;
  if (kind === "attack") {
    if (airFrom > 1e-6) return "v";
    // V at him lying there (`grounded`, his ground blow): the stomp too (2026-10-22, user: the charged high kick swept the air over him
    // after a long crouch). From afar V runs in first (`approachOrSwing`) and stomps on arrival (`beginSwing`).
    const lying = nearestFightEnemy(f);
    return lying?.grounded === true && stompReach(lying) ? "stomp" : null;
  }
  if (kind !== "combo") return null;
  const enemy = nearestFightEnemy(f), air = enemy?.vulnerable ? enemy.air : undefined;
  if (!enemy || !air) return null;
  // His bounce after the spike: the stomp (every blow reaches him there; the jab's three palm strikes ran on over him lying).
  if (air.bounced === true) return airFrom <= 1e-6 && air.heightAfter(spec.stomp.contactMs) > 1e-6 && stompReach(enemy) ? "stomp" : null;
  if (!air.hitsLeft || air.heightAfter(spec.c.contactMs) < spec.c.minFoeBodies) return null;
  const gap = (Math.hypot(enemy.point[0] - point[0], enemy.point[1] - point[1]) - enemy.radius - playerRadius(f)) / stepUnits;
  return gap <= spec.c.maxTravelStrides + spec.c.contactGapStrides + 1e-6 ? "c" : null;
}


function beginAirSwing<K>(f: FightFrame<K>, move: NativeCityPlayerAirMove, pressFacing: VillageFacing, pressHeading: CityPoint, airFrom: number,
  pressed: NativeCityPlayerActionKind = "combo"): void {
  // The stomp keeps the key it came from (C on the bounce, V on him lying there — V's is the ground blow's full weight).
  const s = f.s, spec = NATIVE_CITY_COMBAT.player.air!, kind: NativeCityPlayerActionKind = move === "v" ? "attack" : move === "c" ? "combo" : pressed;
  const enemy = nearestFightEnemy(f), point = f.ctx.point, stepUnits = f.ctx.stepUnits;
  let facing = pressFacing, heading = pressHeading;
  const toward = enemy ? nativeCityUnit([enemy.point[0] - point[0], enemy.point[1] - point[1]]) : null;
  if (toward) { heading = toward; facing = drawnFacing(f, toward, kind); }
  const { direction, swing } = aimMove(f, facing, heading, kind);
  interruptPlayer(s, ["hitTail", "moves"]);
  emit(f, { kind: "swingStart" });
  const between = enemy ? Math.hypot(enemy.point[0] - point[0], enemy.point[1] - point[1]) : 0;
  const gap = enemy ? between - enemy.radius - playerRadius(f) : 0;
  const travelUnits = move === "c" ? Math.max(0, Math.min(gap - spec.c.contactGapStrides * stepUnits, spec.c.maxTravelStrides * stepUnits))
    : enemy ? Math.max(0, Math.min(between - spec[move].rootGapStrides * stepUnits, spec[move].maxTravelStrides * stepUnits)) : 0;
  // Where he meets the opponent: the air C level with him then, the spike and the stomp from above him.
  const foeAt = enemy?.air?.heightAfter(spec[move].contactMs) ?? 0;
  const contactBodies = move === "c" ? Math.max(spec.c.minApexBodies, Math.min(spec.c.maxApexBodies, foeAt + spec.c.apexOverBodies))
    : foeAt + spec[move].apexOverBodies;
  // Its own drawn clip where the pack has one (the air tie whip, the hammer spike, the stomp), else the C chain's segment / V's swing / the jab.
  const base = f.ctx.art.air?.(swing, move)
    ?? f.ctx.art.swing(swing, kind, move === "c" ? spec.c.segment : move === "stomp" ? 0 : null);
  const timeline = nativeCityPlayerAirTimeline(base, move,
    { fromBodies: airFrom, contactBodies, travelUnits }, spec);
  s.pursuit = null;
  s.swing = startNativeCityPlayerSwing(s.swing, { kind, facing: swing, direction, stepUnits, timeline, freeBeforeMs: 0, released: true });
  s.chain = { next: 0, idleMs: 0, missed: false };
  s.lockedFacing = swing;
  s.lockedHeading = direction;
}

function tryDodge<K>(f: FightFrame<K>, blocked: boolean, facing: VillageFacing, heading: CityPoint): boolean {
  const s = f.s;
  if (blocked || !fightOn(f) || playerPressDropped(s)) return false;
  s.pursuit = null;
  if (swinging(s) && !hitLocked(s)) {
    if (!nativeCityPlayerSwingCancellable(s.swing, "defense")) { queuePress(f, "dodge", facing, heading); return true; }
    // Refused before anything is cut: an X on the dodge's cooldown (no dodge, no vault) must not end his swing from its first frame.
    if (!nativeCityDefenseDodgeReady(s.defense)) return false;
    s.swing = cancelNativeCityPlayerSwing(s.swing);
  }
  if (inputLocked(s)) { queuePress(f, "dodge", facing, heading); return true; }
  if (fightLocksMovement(s)) return false;
  // The vault's landing tail: a new X ends it first (its cooldown then decides); the backstep's settle too.
  interruptPlayer(s, ["moves"]);
  // Against a fighter X is the vault at any range — from afar he runs in to it (2026-10-18 손맛 2단계).
  if (nativeCityDefenseDodgeReady(s.defense) && tryVault(f, facing, heading, true)) return true;
  return hop(f, facing, heading);
}

/** A summoned object reaches him within this many fight ms (`summonComing`): X hops where he stands. */
const SUMMON_HOP_WITHIN_MS = 1000;

/** A summoned object of the opponent's (`NativeCityFightSimContext.summons`) reaches him within `SUMMON_HOP_WITHIN_MS`. */
function summonComing<K>(f: FightFrame<K>): boolean {
  const field = f.ctx.summons, line = f.ctx.stage;
  if (!field || field.live.length === 0 || !line) return false;
  const threat = cityFightSummonThreats(field, f.ctx.stepUnits,
    { id: NATIVE_CITY_PLAYER_ID, along: cityFightSummonAlong(line, f.ctx.point), radius: playerRadius(f) })[0];
  return threat !== undefined && threat.untilMs <= SUMMON_HOP_WITHIN_MS;
}

/** A summoned object he can knock back (`CityFightSummonSpec.reflect`) reaches him within this many fight ms: C / V swing where he stands. */
const REFLECT_SWING_WITHIN_MS = 400;

/**
 * An object of the opponent's he can knock back reaches him within `REFLECT_SWING_WITHIN_MS`: the way to it from him (plan, along the stage
 * line — back up its heading), else null.
 */
function reflectableFrom<K>(f: FightFrame<K>): CityPoint | null {
  const field = f.ctx.summons, line = f.ctx.stage;
  if (!field || field.live.length === 0 || !line) return null;
  const threat = cityFightSummonThreats(field, f.ctx.stepUnits, { id: NATIVE_CITY_PLAYER_ID, along: cityFightSummonAlong(line, f.ctx.point), radius: playerRadius(f) })
    .find(each => each.untilMs <= REFLECT_SWING_WITHIN_MS && cityFightSummonSpec(each.kind).reflect !== undefined);
  const summon = threat ? field.live.find(each => each.id === threat.id) : undefined;
  return summon ? [-line.direction[0] * summon.heading, -line.direction[1] * summon.heading] : null;
}

/** How far inside the vault's reach (`dodge.vault.triggerGapStrides`) X's run-in stops (strides): it never ends a hair outside it. */
const VAULT_ARRIVAL_STRIDES = 0.1;

/** The hop (the dodge — X's fallback: Otto's X, a fighter too far to run in to, no room behind him). False when it cannot start. */
function hop<K>(f: FightFrame<K>, facing: VillageFacing, heading: CityPoint): boolean {
  const s = f.s;
  const started = startNativeCityDodge(s.defense);
  if (!started.started) return false;
  s.defense = started.state;
  const { direction, swing } = aimMove(f, facing, heading, "dodge");
  s.lockedFacing = swing;
  s.lockedHeading = direction;
  interruptPlayer(s, ["queue", "chain", "hitTail"]);
  emit(f, { kind: "dodgeStart" });
  return true;
}

/**
 * V into his counter window (`kuma.rhythm.counter`, `counterKuma`): free enough to strike — not in a hit lock, a grab, a hop or a vault in
 * the air (his guard, a block stun, his own swing and a run-in give way) — the counter cuts his swing and the heel goes in. False: V is the
 * heavy blow.
 */
function tryCounter<K>(f: FightFrame<K>, facing: VillageFacing, heading: CityPoint): boolean {
  const s = f.s;
  if (!fightOn(f) || hitLocked(s) || s.fight.grab !== null || nativeCityDefenseDodging(s.defense) || nativeCityPlayerVaultLocks(s.vault)) return false;
  if (!counterKuma(f)) return false;
  s.pursuit = null;
  if (swinging(s)) s.swing = cancelNativeCityPlayerSwing(s.swing);
  interruptPlayer(s, ["moves", "defense", "guard", "hitTail"]);
  // The Z he countered from is no guard until he lets go of it (`guardLatched`) — held, it cut the heel at its first cancel point.
  s.defense = latchNativeCityGuard(s.defense);
  // The counter kicks at once (2026-10-19 merge): it is the answer to his window, never a charge.
  approachOrSwing(f, "attack", facing, heading, true);
  return true;
}

/**
 * S with a full meter (`super`, 2026-10-20): free enough to strike — not in a hit lock, a grab, a hop or a vault in the air (his guard, a
 * block stun, his own swing and a run-in give way) — the meter is spent, the fight holds `super.flashMs` for the super flash and his super
 * goes: an instant full-charge V his guard cannot take (`super.damageScale`), run in to like any V. False: not full, or not free.
 */
function trySuper<K>(f: FightFrame<K>, facing: VillageFacing, heading: CityPoint): boolean {
  const s = f.s;
  // spin escaped it, and one after his KO blow whiffed at the fallen body and cut the bow).
  if (!fightOn(f) || !cityFightMeterFull(s.meter) || playerPressDropped(s) || hitLocked(s)
    || nativeCityDefenseDodging(s.defense) || nativeCityPlayerVaultLocks(s.vault)) return false;
  s.meter = 0;
  s.pursuit = null;
  if (swinging(s)) s.swing = cancelNativeCityPlayerSwing(s.swing);
  interruptPlayer(s, ["moves", "defense", "guard", "hitTail", "queue"]);
  s.defense = latchNativeCityGuard(s.defense);
  s.fight = freezeNativeCityFight(s.fight, NATIVE_CITY_COMBAT.super.flashMs);
  emit(f, { kind: "superFlash", by: NATIVE_CITY_PLAYER_ID, point: f.ctx.point });
  approachOrSwing(f, "attack", facing, heading, true, true);
  return true;
}

/**
 * ←←: he steps back from the nearest engaged enemy, still facing him (`player.backstep`). During a swing it cuts at the swing's cancel
 * point for "other" (or waits for it); during a lock it waits (buffered); on cooldown or with the guard up it is dropped (like →→: the guard
 * commits his feet — 2026-10-12 review).
 */
function tryBackstep<K>(f: FightFrame<K>, blocked: boolean, facing: VillageFacing, heading: CityPoint): boolean {
  const s = f.s;
  if (blocked || !fightOn(f) || playerPressDropped(s)) return false;
  // Refused before anything is cut: the guard up, one already running or its cooldown (a refused press must not end his swing).
  if (s.guardUp || s.backstep !== null || s.backstepCooldownMs > 0) return false;
  s.pursuit = null;
  if (swinging(s) && !hitLocked(s)) {
    if (!nativeCityPlayerSwingCancellable(s.swing, "defense")) { queuePress(f, "backstep", facing, heading); return true; }
    s.swing = cancelNativeCityPlayerSwing(s.swing);
  }
  if (inputLocked(s)) { queuePress(f, "backstep", facing, heading); return true; }
  if (fightLocksMovement(s)) return false;
  const enemy = nearestFightEnemy(f), point = f.ctx.point;
  const toward = enemy ? nativeCityUnit([enemy.point[0] - point[0], enemy.point[1] - point[1]]) : null;
  if (!toward) return false;
  // (No backstep runs here — one running refused the press above.)
  interruptPlayer(s, ["moves"]);
  const drawn = drawnFacing(f, toward, "backstep"), direction: CityPoint = [-toward[0], -toward[1]];
  const timeline = f.ctx.art.backstep?.(drawn) ?? nativeCityPlaceholderBackstepTimeline();
  s.backstep = startNativeCityPlayerBackstep(timeline, drawn, direction, NATIVE_CITY_COMBAT.player.backstep.travelStrides * f.ctx.stepUnits);
  s.lockedFacing = drawn;
  s.lockedHeading = toward;
  interruptPlayer(s, ["queue", "chain", "guard", "hitTail"]);
  emit(f, { kind: "backstepStart", direction, facing: drawn });
  return true;
}


function runQueue<K>(f: FightFrame<K>): void {
  const s = f.s, press = s.queued;
  if (swinging(s) && guardWanted(s) && nativeCityPlayerSwingCancellable(s.swing, "defense") && fightOn(f) && !s.defense.gauge.broken) {
    // Z held through the cancel point: the swing gives way to the guard (it comes up next frame).
    s.swing = cancelNativeCityPlayerSwing(s.swing);
  }
  if (!press) return;
  if (playerPressDropped(s)) { s.queued = null; return; }
  const swing = press.kind === "combo" || press.kind === "attack" || press.kind === "dashAttack";
  // Not yet: a lock still holds, or (a swing) the guard is still held up.
  if (inputLocked(s) || swing && s.guardUp) return;
  // Up in an air move (`player.air`): only an air move cuts it in the air (from his height there); the rest waits for the landing.
  const airFrom = nativeCityPlayerSwingAirLift(s.swing);
  const by = swing && (press.kind === "combo" || press.kind === "attack") && airMoveFor(f, press.kind, airFrom) ? "air" : swing ? "swing" : "defense";
  if (swinging(s) && !nativeCityPlayerSwingCancellable(s.swing, by)) return;
  // The first frame it could run: too old, and it is dropped.
  const buffer = NATIVE_CITY_COMBAT.tempo.player.bufferMs;
  // A C on the beat (`chainTiming`) is kept however long the cut takes; any other press ages out.
  if (press.timed !== true && s.fight.clock.ms - press.atMs > (swing ? buffer.swing : buffer.defense) + 1e-6) { s.queued = null; return; }
  if (swinging(s)) s.swing = cancelNativeCityPlayerSwing(s.swing);
  s.queued = null;
  if (press.kind === "dodge") tryDodge(f, false, press.facing, press.heading);
  else if (press.kind === "backstep") tryBackstep(f, false, press.facing, press.heading);
  else if (press.kind === "combo" || press.kind === "attack" || press.kind === "dashAttack") {
    if (press.kind === "attack") {
      if (tryCounter(f, press.facing, press.heading)) return;
      spendKumaCounterEarly(f);
    }
    if (!s.guardUp && !nativeCityDefenseLocksMovement(s.defense)) {
      approachOrSwing(f, press.kind, press.facing, press.heading, press.released === true, false, by === "air" ? airFrom : 0);
    }
  }
  // A queued guard only cuts the swing: the guard rises next frame when Z is still held (or the parry press is fresh).
}

/**
 * The guard this frame: up while Z is held (or a fresh press's parry window, or a block stun) and he is free to guard. Raising it aims
 * him at the enemy; while it stays up he keeps facing the nearest enemy as long as it stays inside the guard cone (a walk does not turn him).
 */
function stepGuard<K>(f: FightFrame<K>): void {
  const s = f.s, d = s.defense;
  const up = fightOn(f) && playerFreeToGuard(s) && !d.gauge.broken
    && (d.held || nativeCityParryArmed(nativeCityDefensePressAgeMs(d)) || nativeCityDefenseBlockStunned(d));
  if (up && !s.guardUp) {
    // The vault's landing tail and the backstep's settle give way to the guard; the C chain starts over.
    interruptPlayer(s, ["moves", "chain"]);
    const { direction, swing } = aimMove(f, s.stance.facing, s.stance.heading, "block");
    s.lockedFacing = swing; s.lockedHeading = direction;
  } else if (up && s.lockedHeading) {
    const enemy = nearestFightEnemy(f)?.point, point = f.ctx.point;
    if (enemy && nativeCityMeleeInCone(point, s.lockedHeading, enemy, NATIVE_CITY_COMBAT.guard.coneHalfAngleDeg)) {
      const toward = nativeCityUnit([enemy[0] - point[0], enemy[1] - point[1]]);
      if (toward) { s.lockedHeading = toward; s.lockedFacing = drawnFacing(f, toward, "block"); }
    }
  }
  s.guardUp = up;
}


function stepFinale<K>(f: FightFrame<K>, fightDt: number): void {
  const s = f.s, finale = s.finale;
  if (!finale) return;
  finale.fightMs += fightDt;
  emit(f, { kind: "finaleTick", id: finale.id });
  const ko = NATIVE_CITY_COMBAT.exchangeFx.ko, ops = f.ctx.kumaOps;
  // When his body lands (his drawn fall's ground-impact step, else the procedural launch).
  const impactMs = ops.koImpactMs(f.kuma) ?? ko.launchMs;
  if (!finale.landed && finale.fightMs >= impactMs) {
    finale.landed = true;
    s.fight = freezeNativeCityFight(s.fight, f.ctx.feel.exchangeHitStopMs("koLand") * NATIVE_CITY_COMBAT.hitStopScale);
    emit(f, { kind: "finaleLanded", side: finale.side });
    emit(f, { kind: "exchange", beat: "koLand" });
  }
  emit(f, { kind: "finaleSettled", id: finale.id, landed: finale.landed, screenMs: finale.screenMs });
  if (finale.landed && !finale.card && finale.fightMs >= impactMs + ko.cardDelayMs) {
    finale.card = true;
    emit(f, { kind: "callingCard", side: finale.side, impactMs });
  }
  if (finale.landed && !finale.bowed && finale.fightMs >= impactMs + ko.bowDelayMs && !swinging(s) && !hitLocked(s) && s.fight.ko === null
    && !nativeCityPlayerBackstepLocks(s.backstep)) {
    finale.bowed = true;
    s.guardUp = false;
    // The backstep's drawn settle gives way to the bow (it would hide its first beat).
    endBackstep(s);
    // Keep the exchange art's view toward KUMA. The bow shares its dodge/vault poses;
    // forcing a diagonal here turned a side-on finale into the village's oblique view.
    const point = f.ctx.point, kuma = ops.point(f.kuma);
    const toward = nativeCityUnit([kuma[0] - point[0], kuma[1] - point[1]]);
    if (toward) { s.lockedHeading = toward; s.lockedFacing = drawnFacing(f, toward, "dodge"); }
    s.defense = startNativeCityBow(s.defense);
    emit(f, { kind: "bow" });
  }
  if (finale.bowed && !nativeCityDefenseBowing(s.defense) || finale.fightMs > impactMs + ko.bowDelayMs + 4000) s.finale = null;
}

/**
 * How much of a swing's step-in (`lungeUnits`, plan) he may take toward an engaged enemy: it stops `melee.minGapStrides` beyond body
 * contact — the drawn step in the art carries him the rest of the way. Away from every enemy: all of it.
 */
function lungeRoom<K>(f: FightFrame<K>, direction: CityPoint, lungeUnits: number): number {
  if (!(lungeUnits > 0)) return Math.max(0, lungeUnits);
  const point = f.ctx.point, length = Math.hypot(direction[0], direction[1]);
  let room = lungeUnits;
  for (const enemy of fightEnemies(f)) {
    if (!enemy.engaged) continue;
    const toward: CityPoint = [enemy.point[0] - point[0], enemy.point[1] - point[1]], distance = Math.hypot(toward[0], toward[1]);
    if (distance < 1e-6 || length < 1e-9) return 0;
    const along = (toward[0] * direction[0] + toward[1] * direction[1]) / (distance * length);
    if (along <= 0) continue;
    const gap = distance - enemy.radius - playerRadius(f) - NATIVE_CITY_COMBAT.melee.minGapStrides * f.ctx.stepUnits;
    room = Math.max(0, Math.min(room, gap / along));
  }
  return room;
}
