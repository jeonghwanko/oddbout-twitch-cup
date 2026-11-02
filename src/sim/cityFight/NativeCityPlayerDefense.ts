import { NATIVE_CITY_COMBAT, type NativeCityDodgeHopTuning } from "./NativeCityCombatTuning";
import { armNativeCityParry, createNativeCityGuardGauge, nativeCityDodgeReady, nativeCityGuardBlock, nativeCityGuardWhiff, nativeCityParryRepress,
  stepNativeCityGuardGauge, type NativeCityBlockKind, type NativeCityGuardGauge } from "./NativeCityExchange";


export interface NativeCityPlayerDefenseState {
  /** The defense's own fight clock (ms): press ages and the dodge cooldown read it. */
  readonly fightMs: number;
  /** Fight ms of the armed guard press (the parry window), or null. */
  readonly armedAtMs: number | null;
  /** Z went down since the last step: it arms at the next one. */
  readonly pressPending: boolean;
  /** Z is held right now. */
  readonly held: boolean;
  /**
   * Z was held when a strike that fires from the guard went (the V counter, the super — 2026-10-21): it is no guard until it is let go
   * (`latchNativeCityGuard`). Else the guard-then-counter hand, letting go of Z a few frames after V, cut its own heel at the first cancel point.
   */
  readonly guardLatched: boolean;
  readonly gauge: NativeCityGuardGauge;
  /** Fight ms into the dodge, or null. */
  readonly dodgeMs: number | null;
  readonly dodgeEndedAtMs: number | null;
  /** The block reaction (`kind`, ms into it, its stun). */
  readonly block: { readonly kind: NativeCityBlockKind; readonly ms: number; readonly stunMs: number } | null;
  /** Fight ms into the parry pose, or null. */
  readonly parryMs: number | null;
  /** Fight ms into the closing bow, or null. */
  readonly bowMs: number | null;
  /** Fight ms the guard has been up (0 while down). */
  readonly guardUpMs: number;
  /** Fight ms the guard was last up (a press under `parry.whiffLoweredMs` after it is a re-press). */
  readonly lastUpAtMs: number | null;
  /** A re-press waiting to be consumed by a block or parry within `parry.windowMs` (`settleNativeCityGuardWhiff`), from this fight ms. */
  readonly repressAtMs: number | null;
}

const defense = (state: NativeCityPlayerDefenseState): NativeCityPlayerDefenseState => Object.freeze(state);

export function createNativeCityPlayerDefense(): NativeCityPlayerDefenseState {
  return defense({ fightMs: 0, armedAtMs: null, pressPending: false, held: false, guardLatched: false, gauge: createNativeCityGuardGauge(), dodgeMs: null,
    dodgeEndedAtMs: null, block: null, parryMs: null, bowMs: null, guardUpMs: 0, lastUpAtMs: null, repressAtMs: null });
}

/** Fight ms since the armed press, or null. */
export function nativeCityDefensePressAgeMs(state: NativeCityPlayerDefenseState): number | null {
  return state.armedAtMs === null ? null : state.fightMs - state.armedAtMs;
}
export function nativeCityDefenseDodging(state: NativeCityPlayerDefenseState): boolean { return state.dodgeMs !== null; }
export function nativeCityDefenseBlockStunned(state: NativeCityPlayerDefenseState): boolean {
  return state.block !== null && state.block.ms < state.block.stunMs;
}
export function nativeCityDefenseParrying(state: NativeCityPlayerDefenseState): boolean {
  return state.parryMs !== null && state.parryMs < NATIVE_CITY_COMBAT.parry.poseMs;
}
export function nativeCityDefenseBowing(state: NativeCityPlayerDefenseState): boolean {
  return state.bowMs !== null && state.bowMs < NATIVE_CITY_COMBAT.exchangeFx.ko.bowMs;
}
/** A defensive move holds his feet: dodging, block-stunned, in the parry pose or bowing. */
export function nativeCityDefenseLocksMovement(state: NativeCityPlayerDefenseState): boolean {
  return nativeCityDefenseDodging(state) || nativeCityDefenseBlockStunned(state) || nativeCityDefenseParrying(state) || nativeCityDefenseBowing(state);
}
/** Not inside a dodge, and `dodge.cooldownMs` has passed since the last one ended. */
export function nativeCityDefenseDodgeReady(state: NativeCityPlayerDefenseState): boolean {
  return state.dodgeMs === null && nativeCityDodgeReady(state.dodgeEndedAtMs === null ? null : state.fightMs - state.dodgeEndedAtMs);
}

/** Z went down this frame (keyboard event or pad edge): arms the parry window at the next step. */
export function pressNativeCityGuard(state: NativeCityPlayerDefenseState): NativeCityPlayerDefenseState {
  return defense({ ...state, pressPending: true });
}

/** Z is held right now (a latched Z counts as let go until it really is — `guardLatched`). */
export function holdNativeCityGuard(state: NativeCityPlayerDefenseState, held: boolean): NativeCityPlayerDefenseState {
  if (state.guardLatched) return held ? state : defense({ ...state, guardLatched: false });
  return state.held === held ? state : defense({ ...state, held });
}

/** A strike fired from the guard (the counter, the super): the Z held now is no guard, and no parry press, until it is let go. */
export function latchNativeCityGuard(state: NativeCityPlayerDefenseState): NativeCityPlayerDefenseState {
  return state.held || state.pressPending || state.armedAtMs !== null
    ? defense({ ...state, held: false, guardLatched: state.held || state.guardLatched, pressPending: false, armedAtMs: null }) : state;
}

/** Once per frame on the fight clock (before the enemies' strikes are judged). `guardUp`: the guard showed this frame. */
export function stepNativeCityPlayerDefense(state: NativeCityPlayerDefenseState, fightDt: number, guardUp: boolean): NativeCityPlayerDefenseState {
  const dt = Number.isFinite(fightDt) ? Math.max(0, fightDt) : 0;
  let { armedAtMs, pressPending, repressAtMs, dodgeMs, dodgeEndedAtMs, block, parryMs, bowMs, lastUpAtMs } = state;
  if (pressPending) {
    // A re-press (the guard up, or lowered just now) can whiff (`settleNativeCityGuardWhiff`); the first raise is free.
    // With the parry off (`parry.enabled`, 2026-10-18) nothing whiffs: Z only blocks.
    if (NATIVE_CITY_COMBAT.parry.enabled && nativeCityParryRepress(guardUp, lastUpAtMs === null ? null : state.fightMs - lastUpAtMs)
      && !state.gauge.broken) repressAtMs = state.fightMs;
    armedAtMs = armNativeCityParry(armedAtMs, state.fightMs);
    pressPending = false;
  }
  const fightMs = state.fightMs + dt;
  const gauge = stepNativeCityGuardGauge(state.gauge, dt);
  const guardUpMs = guardUp ? state.guardUpMs + dt : 0;
  if (guardUp) lastUpAtMs = fightMs;
  if (dodgeMs !== null) {
    dodgeMs += dt;
    if (dodgeMs >= NATIVE_CITY_COMBAT.dodge.totalMs) { dodgeMs = null; dodgeEndedAtMs = fightMs; }
  }
  if (block) { const ms = block.ms + dt; block = ms >= block.stunMs + 200 ? null : Object.freeze({ ...block, ms }); }
  if (parryMs !== null) { parryMs += dt; if (parryMs >= NATIVE_CITY_COMBAT.parry.poseMs + 200) parryMs = null; }
  if (bowMs !== null) { bowMs += dt; if (bowMs >= NATIVE_CITY_COMBAT.exchangeFx.ko.bowMs) bowMs = null; }
  return defense({ fightMs, armedAtMs, pressPending, held: state.held, guardLatched: state.guardLatched, gauge, dodgeMs, dodgeEndedAtMs, block, parryMs, bowMs, guardUpMs, lastUpAtMs,
    repressAtMs });
}

/**
 * How far back the dodge's hop has carried him `ms` into it (strides, `dodge.hop`, 2026-10-16): 0 to the take-off, eased out to
 * `backStrides` at the landing, held to the spring, smoothly back to 0 by `returnMs` (null: not dodging).
 */
export function nativeCityDodgeHopBackStrides(ms: number | null, hop: NativeCityDodgeHopTuning = NATIVE_CITY_COMBAT.dodge.hop): number {
  if (ms === null || !Number.isFinite(ms) || ms <= hop.takeoffMs) return 0;
  const back = Math.max(0, hop.backStrides);
  if (ms < hop.landMs) { const u = (ms - hop.takeoffMs) / Math.max(1, hop.landMs - hop.takeoffMs); return back * (1 - (1 - u) * (1 - u)); }
  if (ms < hop.springMs) return back;
  if (ms < hop.returnMs) { const u = (ms - hop.springMs) / Math.max(1, hop.returnMs - hop.springMs); return back * (1 - u * u * (3 - 2 * u)); }
  return 0;
}

/** X: starts the bow-duck when ready (`started` false otherwise). */
export function startNativeCityDodge(state: NativeCityPlayerDefenseState): { readonly state: NativeCityPlayerDefenseState; readonly started: boolean } {
  if (!nativeCityDefenseDodgeReady(state)) return { state, started: false };
  return { state: defense({ ...state, dodgeMs: 0, block: null, parryMs: null }), started: true };
}

/**
 * Z during the dodge's tail (`dodge.cancelAfterMs` on): the dodge ends now so the guard can rise for the next blow (dodge, then
 * parry). `cancelled`: it cut the dodge.
 */
export function cancelNativeCityDodge(state: NativeCityPlayerDefenseState): { readonly state: NativeCityPlayerDefenseState; readonly cancelled: boolean } {
  if (state.dodgeMs === null || state.dodgeMs < NATIVE_CITY_COMBAT.dodge.cancelAfterMs) return { state, cancelled: false };
  return { state: defense({ ...state, dodgeMs: null, dodgeEndedAtMs: state.fightMs }), cancelled: true };
}

/**
 * A blow met his guard. `broke`: the guard broke (the gauge ran out). The press that blocked it is spent: the next press arms at once
 * (like a parry), otherwise the mash lock would swallow the parry of the string's next blow.
 */
export function blockNativeCityGuard(state: NativeCityPlayerDefenseState, kind: NativeCityBlockKind, crush = false)
  : { readonly state: NativeCityPlayerDefenseState; readonly broke: boolean } {
  // `crush`: a gold contact (the triangle) empties the gauge at once — the guard break.
  const result = nativeCityGuardBlock(state.gauge, kind, NATIVE_CITY_COMBAT, crush);
  return { state: defense({ ...state, gauge: result.gauge, armedAtMs: null, repressAtMs: null,
    block: result.broke ? null : Object.freeze({ kind, ms: 0, stunMs: NATIVE_CITY_COMBAT.guard.blockStunMs[kind] }) }), broke: result.broke };
}

/** He parried: the parry pose, and the next press may arm at once. */
export function parryNativeCityGuard(state: NativeCityPlayerDefenseState): NativeCityPlayerDefenseState {
  return defense({ ...state, parryMs: 0, armedAtMs: null, block: null, repressAtMs: null });
}

/**
 * After the enemies' contacts of this frame were judged: a re-press that no block or parry consumed within `parry.windowMs` WHIFFS — it
 * costs `parry.whiffCost` of the guard (`nativeCityGuardWhiff`) and plays the parry pose as a whiff. `whiff` null when nothing whiffed;
 * `broke`: this whiff emptied the gauge (the guard breaks).
 */
export function settleNativeCityGuardWhiff(state: NativeCityPlayerDefenseState)
  : { readonly state: NativeCityPlayerDefenseState; readonly whiff: { readonly broke: boolean } | null } {
  if (state.repressAtMs === null || state.fightMs - state.repressAtMs <= NATIVE_CITY_COMBAT.parry.windowMs) return { state, whiff: null };
  const result = nativeCityGuardWhiff(state.gauge);
  // The parry clip as a whiff (the pose locks his feet `parry.poseMs`); a broken guard staggers instead (the fight's guard break).
  return { state: defense({ ...state, repressAtMs: null, gauge: result.gauge, block: null, parryMs: result.broke ? null : 0 }),
    whiff: { broke: result.broke } };
}


export function endNativeCityVault(state: NativeCityPlayerDefenseState): NativeCityPlayerDefenseState {
  return defense({ ...state, dodgeEndedAtMs: state.fightMs });
}

/** He walked off after a parry or a block stun: their drawn tails stop (like the hit reaction's cut). */
export function cutNativeCityDefense(state: NativeCityPlayerDefenseState): NativeCityPlayerDefenseState {
  const parry = state.parryMs !== null && !nativeCityDefenseParrying(state), block = state.block !== null && !nativeCityDefenseBlockStunned(state);
  return parry || block ? defense({ ...state, parryMs: parry ? null : state.parryMs, block: block ? null : state.block }) : state;
}

/** The closing bow after the KO. */
export function startNativeCityBow(state: NativeCityPlayerDefenseState): NativeCityPlayerDefenseState {
  return defense({ ...state, bowMs: 0, dodgeMs: null, block: null, parryMs: null });
}

/** A blow landed (or he went down): every defensive pose stops (and a pending re-press is forgotten — the blow is its price). */
export function interruptNativeCityDefense(state: NativeCityPlayerDefenseState): NativeCityPlayerDefenseState {
  return defense({ ...state, dodgeEndedAtMs: state.dodgeMs !== null ? state.fightMs : state.dodgeEndedAtMs, dodgeMs: null, block: null, parryMs: null,
    bowMs: null, repressAtMs: null });
}
