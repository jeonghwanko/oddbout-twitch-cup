import type { NativeCityBlockKind } from "./NativeCityExchange";
import { NATIVE_CITY_MELEE_VICTIM, resolveNativeCityMelee, stepNativeCityKnock, stepNativeCityMeleeVictim, type NativeCityKnock, type NativeCityMeleeBody, type NativeCityMeleeOptions, type NativeCityMeleeResult, type NativeCityMeleeStrike, type NativeCityMeleeVictim } from "./NativeCityMelee";
import { NATIVE_CITY_COMBAT, type NativeCityImpactTier } from "./NativeCityCombatTuning";
import type { CityPoint } from "../../world/NativeCityDefinition";
import { createDuelClock, DUEL_NO_RELEASE_RAMP, freezeDuelClock, holdDuelClock, slowDuelClock, stepDuelClock, type DuelClock,
  type DuelSlowMoBeat } from "../duel/DuelClock";



/** A slow-mo beat on the fight clock — the fields of the presentation's `CombatSlowMoBeat` (whose curve reads them). */

export function nativeCityWallFreezeMs(): number {
  return NATIVE_CITY_COMBAT.knockback.launch.wallHitStopMs * NATIVE_CITY_COMBAT.hitStopScale;
}

export type NativeCityFightSlowMoBeat = DuelSlowMoBeat;


export type NativeCityFightClock = DuelClock;

/** A push along the strike axis (plan `direction`, `units` in all), caught up on the fight clock (`stepNativeCityKnock`). */
export type NativeCityFightKnock = NativeCityKnock;

/**
 * The hit lock's lengths (fight ms): the reaction starts at `startMs` (the drawn clip's contact step — the freeze holds the snapped
 * head; 0 for the placeholder), locks walking and swinging for `stunMs` from there and is drawn until `totalMs`.
 */
export interface NativeCityFightHitTiming { readonly startMs: number; readonly stunMs: number; readonly totalMs: number }

export interface NativeCityFightHit extends NativeCityFightHitTiming { readonly elapsedMs: number }

/** Spinning dizzy from KUMA's dash (기절, `player.stun`): fight ms left / in all / so far; `from`: where his spin starts in the spin order. */
export interface NativeCityFightStun { readonly leftMs: number; readonly totalMs: number; readonly ageMs: number; readonly from: number }

/**
 * A knock-out's beats (fight ms from the blow): the body meets the ground at `impactMs` (the drawn fall's dust and thud), lies from
 * `lieAtMs`, gets up from `riseAtMs` and stands at `totalMs`. `art`: the drawn fall (else the procedural tilt over `player.ko.downMs`).
 */
export interface NativeCityFightKoTiming { readonly art: boolean; readonly impactMs: number; readonly lieAtMs: number; readonly riseAtMs: number;
  readonly totalMs: number }
/** A knock-out's clock: `landed` once the drawn body has met the ground. */
export interface NativeCityFightKoClock { readonly timing: NativeCityFightKoTiming; readonly elapsedMs: number; readonly landed: boolean }

export interface NativeCityFightKo extends NativeCityFightKoClock { readonly by: string; readonly defeatCard: boolean; readonly downed?: boolean }


export interface NativeCityFightGrab { readonly by: string; readonly ms: number; readonly maxMs: number }

export interface NativeCityFightState {
  readonly clock: NativeCityFightClock;

  readonly victim: NativeCityMeleeVictim;

  readonly enemyVictims: Readonly<Record<string, NativeCityMeleeVictim>>;
  readonly knock: NativeCityFightKnock | null;
  readonly hit: NativeCityFightHit | null;
  readonly stun: NativeCityFightStun | null;
  readonly ko: NativeCityFightKo | null;
  /** Held by a grab (`NativeCityFightGrab`), or null. */
  readonly grab: NativeCityFightGrab | null;
}


export type NativeCityFightSound = "struck" | "struckHeavy" | "down";

export type NativeCityFightEvent =

  | { readonly kind: "impact"; readonly tier: NativeCityImpactTier; readonly by: "enemy"; readonly freezeMs: number; readonly skidUnits: number }
  | { readonly kind: "sound"; readonly cue: NativeCityFightSound; readonly tier: NativeCityImpactTier }
  /**
   * The spin ended: `recovered` — it ran out (he is invulnerable `player.stun.recoverMs`; the controller turns him to the nearest
   * enemy), else a knock-out took it over.
   */
  | { readonly kind: "stunEnded"; readonly recovered: boolean }
  /** The drawn KO's body met the ground (once): the dust ring and the camera thump. */
  | { readonly kind: "koLanded" }
  /** He stood up from the KO (`ko`: the one that ended, as it ended): HP refills. */
  | { readonly kind: "stood"; readonly ko: NativeCityFightKo }
  /** A hold whose throw never came ran out (`NativeCityFightGrab.maxMs`): he is dropped where he stands. */
  | { readonly kind: "grabDropped" };

export interface NativeCityFightStepInput {
  /** Screen ms of this frame (0 while the fight holds — dialogue, a hidden window). */
  readonly dtMs: number;
  /**
   * The running slow-mo's speed at its age before this step (`combatSlowMoScaleAt(clock.slowMo.beat, clock.slowMo.ageMs)` — the curve is
   * the presentation's easing); 1 without one.
   */
  readonly slowMoScale: number;
  /** One stride in plan units now (the knockback curve). */
  readonly stepUnits: number;
  /** The fight's playback speed (`tempo.playbackRate` while engaged — `stepDuelClock`); absent: 1. */
  readonly baseRate?: number;
}

export interface NativeCityFightStep {
  readonly state: NativeCityFightState;
  /** Fight ms of this frame (both fighters' clocks advance by it). */
  readonly fightDt: number;
  /** `fightDt / dtMs` (0 frozen, a fraction on the frame a freeze ends, the slow-mo scale; 1 on an empty frame). */
  readonly fightScale: number;
  /** Screen ms of this frame outside the freeze (the fight zoom releases on it). */
  readonly free: number;
  /** This frame's knockback travel (plan), or null when no push moved him. */
  readonly knock: CityPoint | null;
  readonly events: readonly NativeCityFightEvent[];
}

const sanitized = (dtMs: number): number => Number.isFinite(dtMs) ? Math.max(0, dtMs) : 0;
const fightState = (state: NativeCityFightState): NativeCityFightState => Object.freeze(state);

export function createNativeCityFight(): NativeCityFightState {
  return fightState({ clock: createDuelClock(), victim: NATIVE_CITY_MELEE_VICTIM,
    enemyVictims: Object.freeze({}), knock: null, hit: null, stun: null, ko: null, grab: null });
}

/**
 * One frame of the fight: the shared freeze (both fighters hold while it lasts; one that runs out inside this frame lets the rest of it
 * run), the snap out, the slow-mo, then — on the fight ms that leaves — the melee states' invulnerability, the knock-out (its landing,
 * his standing up), the hit lock, the spin (its end and the invulnerability after it) and the knockback's travel.
 */
export function stepNativeCityFight(state: NativeCityFightState, input: NativeCityFightStepInput): NativeCityFightStep {
  const { crisp, releaseRamp } = NATIVE_CITY_COMBAT.tempo;
  const advanced = stepDuelClock(state.clock, { dtMs: input.dtMs, slowMoScale: input.slowMoScale,
    releaseRamp: crisp.enabled ? DUEL_NO_RELEASE_RAMP : releaseRamp, baseRate: input.baseRate });
  const { fightDt, fightScale, free } = advanced;
  const events: NativeCityFightEvent[] = [];
  let victim = stepNativeCityMeleeVictim(state.victim, fightDt), enemyVictims = state.enemyVictims;
  for (const id of Object.keys(enemyVictims)) {
    const before = enemyVictims[id]!, after = stepNativeCityMeleeVictim(before, fightDt);
    if (after !== before) enemyVictims = { ...enemyVictims, [id]: after };
  }
  let ko = state.ko;
  if (ko) {
    const step = stepNativeCityFightKo(ko, fightDt);
    if (step.landed) events.push({ kind: "koLanded" });
    // He stands when the KO's own length has run (the drawn get-up's end; the procedural fall's `player.ko.downMs`).
    if (step.done) { events.push({ kind: "stood", ko: step.ko }); ko = null; } else ko = step.ko;
  }
  let hit = state.hit ? stepNativeCityFightHit(state.hit, fightDt) : null;
  let stun = state.stun;
  if (stun) {
    const leftMs = stun.leftMs - fightDt;
    if (leftMs <= 0) {
      // The spin ran out: invulnerable for `stun.recoverMs` with full control (the controller turns him toward the nearest enemy).
      stun = null;
      victim = { ...victim, invulnerableMs: Math.max(victim.invulnerableMs, NATIVE_CITY_COMBAT.player.stun.recoverMs) };
      events.push({ kind: "stunEnded", recovered: true });
    } else stun = Object.freeze({ ...stun, ageMs: stun.ageMs + fightDt, leftMs });
  }
  // Spinning: a blow's reaction shows only while it holds him (the launch / the push); then the spin is drawn again, untrembled.
  if (stun && hit && !nativeCityFightHitLocks(hit)) hit = null;
  let grab = state.grab;
  if (grab) {
    const ms = grab.ms + fightDt;
    // The throw never came (the holder stopped fighting): dropped where he stands.
    if (ms >= grab.maxMs) { grab = null; events.push({ kind: "grabDropped" }); } else grab = Object.freeze({ ...grab, ms });
  }
  let knock = state.knock, travel: CityPoint | null = null;
  if (knock && fightDt > 0) {
    const pushed = stepNativeCityKnock(knock, fightDt, input.stepUnits);
    travel = [knock.direction[0] * pushed.travel, knock.direction[1] * pushed.travel];
    knock = pushed.knock;
  }
  const next = fightState({ clock: advanced.clock, victim,
    enemyVictims: enemyVictims === state.enemyVictims ? enemyVictims : Object.freeze(enemyVictims), knock, hit, stun, ko, grab });
  return { state: next, fightDt, fightScale, free, knock: travel, events };
}

/** The shared freeze of a connecting beat (both fighters hold, from this frame — the rest of this frame is frozen too); the longer wins. */

export function freezeNativeCityFight(state: NativeCityFightState, ms: number, ease = false): NativeCityFightState {
  return fightState({ ...state, clock: freezeDuelClock(state.clock, ms, ease) });
}

/** A slow-mo beat from now (after the freeze it rides on: its clock runs only outside the freeze). */
export function slowNativeCityFight(state: NativeCityFightState, beat: NativeCityFightSlowMoBeat): NativeCityFightState {
  return fightState({ ...state, clock: slowDuelClock(state.clock, beat) });
}

const SCREEN_FRAME_MS = 1000 / 60;

/**
 * The screen ms a slow-mo beat adds over its curve — ∫ (1 − rate) d(screen ms), `scaleAt` the curve the clock would read
 * (`combatSlowMoScaleAt`) — rounded to whole 60 Hz frames: the crisp clock's hold for it (`tempo.crisp`).
 */
export function nativeCityCrispHoldMs(beat: NativeCityFightSlowMoBeat, scaleAt: (beat: NativeCityFightSlowMoBeat, ageMs: number) => number): number {
  let added = 0;
  for (let age = 0.5; age < beat.holdMs + beat.releaseMs; age += 1) added += 1 - scaleAt(beat, age);
  return Math.max(0, Math.round(added / SCREEN_FRAME_MS)) * SCREEN_FRAME_MS;
}

/**
 * A read beat — the chance, the counter accent, a full charge's flight, the poise break: slow motion on the eased clock; on the crisp
 * clock (`tempo.crisp`, 2026-10-21) a hard hold of the screen time the slow motion would add, after the freeze it rides on.
 */
export function readBeatNativeCityFight(state: NativeCityFightState, beat: NativeCityFightSlowMoBeat,
  scaleAt: (beat: NativeCityFightSlowMoBeat, ageMs: number) => number): NativeCityFightState {
  if (!NATIVE_CITY_COMBAT.tempo.crisp.enabled) return slowNativeCityFight(state, beat);
  return fightState({ ...state, clock: holdDuelClock(state.clock, nativeCityCrispHoldMs(beat, scaleAt)) });
}

/** The running slow motion ends now (the counter's heel connected: the hit's own freeze takes the beat, the body flies at full speed). */
export function endSlowNativeCityFight(state: NativeCityFightState): NativeCityFightState {
  return state.clock.slowMo ? fightState({ ...state, clock: Object.freeze({ ...state.clock, slowMo: null }) }) : state;
}

/** A slow motion cut short into a freeze of `ms`: its release burst then snaps the fight on (the vault's apex glint). */
export function snapNativeCityFight(state: NativeCityFightState, ms: number): NativeCityFightState {
  return fightState({ ...state, clock: freezeDuelClock(Object.freeze({ ...state.clock, slowMo: null }), ms) });
}


export function nativeCityFightEnemyVictim(state: NativeCityFightState, id: string): NativeCityMeleeVictim {
  return Object.hasOwn(state.enemyVictims, id) ? state.enemyVictims[id]! : NATIVE_CITY_MELEE_VICTIM;
}


export function strikeNativeCityEnemy(state: NativeCityFightState, strike: NativeCityMeleeStrike, target: NativeCityMeleeBody,
  options: NativeCityMeleeOptions): { readonly state: NativeCityFightState; readonly result: NativeCityMeleeResult } {
  const result = resolveNativeCityMelee(strike, target, nativeCityFightEnemyVictim(state, target.id), options);
  if (!result.hit) return { state, result };
  return { state: fightState({ ...state, enemyVictims: Object.freeze({ ...state.enemyVictims, [target.id]: result.victim }) }), result };
}

/** No enemy blow reaches him now: knocked out, held by a grab, or still invulnerable after a blow or the spin. */
export function nativeCityFightUntouchable(state: NativeCityFightState): boolean {
  return state.ko !== null || state.grab !== null || state.victim.invulnerableMs > 0;
}

/**
 * An enemy's grab caught him (`kuma.grab`): held from now (no hit lock, push or spin — the hold is all of it) for at most `maxMs` (the
 * hold's length + its failsafe); `victim`: his melee state after the catch (the contact counted).
 */
export function grabNativeCityFight(state: NativeCityFightState, grab: { readonly by: string; readonly maxMs: number; readonly victim: NativeCityMeleeVictim })
  : NativeCityFightState {
  return fightState({ ...state, victim: grab.victim, hit: null, knock: null, stun: null,
    grab: Object.freeze({ by: grab.by, ms: 0, maxMs: Math.max(1, grab.maxMs) }) });
}

/** The grab let go of him (its throw): no longer held. */
export function releaseNativeCityFightGrab(state: NativeCityFightState): NativeCityFightState {
  return state.grab ? fightState({ ...state, grab: null }) : state;
}

/**
 * The hit lock's lengths: a drawn reaction (`drawn` — its clip's length and contact step) locks `stunMs` (this blow's own — Otto's
 * `playerHit`, KUMA's slam — else `player.hitStunMs`) and plays on to its end; without the art the procedural placeholder locks and
 * lasts `stunMs`, else `player.hitStaggerMs`.
 */
export function nativeCityFightHitTiming(drawn: { readonly totalMs: number; readonly startMs: number } | null,
  stunMs?: number): NativeCityFightHitTiming {
  const { hitStunMs, hitStaggerMs } = NATIVE_CITY_COMBAT.player;
  if (drawn) return { totalMs: drawn.totalMs, stunMs: stunMs ?? hitStunMs, startMs: drawn.startMs };
  const lock = stunMs ?? hitStaggerMs;
  return { totalMs: lock, stunMs: lock, startMs: 0 };
}

/** A hit lock from now: its clock starts at the reaction's start step. */
export function nativeCityFightHitClock(timing: NativeCityFightHitTiming): NativeCityFightHit {
  return Object.freeze({ startMs: timing.startMs, stunMs: timing.stunMs, totalMs: timing.totalMs, elapsedMs: timing.startMs });
}

/** Walking and swinging are locked: within `stunMs` of the reaction's start step. */
export function nativeCityFightHitLocks(hit: NativeCityFightHit | null): boolean {
  return hit !== null && hit.elapsedMs - hit.startMs < hit.stunMs;
}

/** The lock's clock `dtMs` (fight ms) on; null once the reaction is over (its drawn length and its lock both). */
export function stepNativeCityFightHit(hit: NativeCityFightHit, dtMs: number): NativeCityFightHit | null {
  const elapsedMs = hit.elapsedMs + sanitized(dtMs);
  return elapsedMs >= Math.max(hit.totalMs, hit.startMs + hit.stunMs) ? null : Object.freeze({ ...hit, elapsedMs });
}

/**
 * The hit lock `hit` goes on through a later contact of the same attack (one flinch per move): the drawn reaction's clock runs on, the
 * lock lasts at least `timing.stunMs` from now and the drawing at least the new reaction's length after its start step.
 */
export function continueNativeCityFightHit(state: NativeCityFightState, hit: NativeCityFightHit, timing: NativeCityFightHitTiming): NativeCityFightState {
  const into = hit.elapsedMs - hit.startMs;
  return fightState({ ...state, hit: Object.freeze({ ...hit, stunMs: Math.max(hit.stunMs, into + timing.stunMs),
    totalMs: Math.max(hit.totalMs, hit.elapsedMs + Math.max(0, timing.totalMs - timing.startMs)) }) });
}

/** A new hit lock (each blow starts it over — the guard break's long stagger too, `guard.breakStunMs`). */
export function startNativeCityFightHit(state: NativeCityFightState, timing: NativeCityFightHitTiming): NativeCityFightState {
  return fightState({ ...state, hit: nativeCityFightHitClock(timing) });
}

/** A walk or a swing after the lock cuts the rest of the drawn reaction; inside the lock nothing happens. */
export function cutNativeCityFightHit(state: NativeCityFightState): NativeCityFightState {
  return state.hit && !nativeCityFightHitLocks(state.hit) ? fightState({ ...state, hit: null }) : state;
}

/** Spinning dizzy for `ms` from spin-order step `from` (the stars and the daze ring are the controller's); it cuts a hit reaction. */
export function startNativeCityFightStun(state: NativeCityFightState, ms: number, from: number): NativeCityFightState {
  return fightState({ ...state, stun: Object.freeze({ leftMs: ms, totalMs: ms, ageMs: 0, from }), hit: null });
}

/**
 * The spin a dash blow started (`takeNativeCityBlow` → "spin") lasts until the enemy's restarted attack lands — `restartMs`, fight ms from
 * now, which KUMA can only tell after he took his hit-lag (`kuma.strikeLanded`, then `kuma.dashConnected`) — + `player.stun.afterImpactMs`,
 * and at least `player.stun.ms`. Call right after that blow.
 */
export function holdNativeCitySpin(state: NativeCityFightState, restartMs: number | null): NativeCityFightState {
  const stun = state.stun, spec = NATIVE_CITY_COMBAT.player.stun;
  if (!stun) return state;
  return startNativeCityFightStun(state, Math.max(spec.ms, restartMs === null ? 0 : restartMs + spec.afterImpactMs), stun.from);
}

/** The procedural knock-out's beats (no drawn fall): it tilts over `player.ko.fallMs` and rises over the last `riseMs` of `downMs`. */
export function nativeCityPlaceholderKoTiming(): NativeCityFightKoTiming {
  const tuning = NATIVE_CITY_COMBAT.player.ko;
  return { art: false, impactMs: tuning.fallMs, lieAtMs: tuning.fallMs, riseAtMs: Math.max(tuning.fallMs, tuning.downMs - tuning.riseMs),
    totalMs: tuning.downMs };
}

/** A knock-out's clock from the blow (only the beats of `timing` are kept). */
export function nativeCityFightKoClock(timing: NativeCityFightKoTiming): NativeCityFightKoClock {
  return Object.freeze({ timing: Object.freeze({ art: timing.art, impactMs: timing.impactMs, lieAtMs: timing.lieAtMs, riseAtMs: timing.riseAtMs,
    totalMs: timing.totalMs }), elapsedMs: 0, landed: false });
}

/**
 * The KO's clock `dtMs` (fight ms) on: `landed` — the drawn body met the ground on this step (once); `done` — he stands. The clock is
 * kept (whoever holds it ends it).
 */
export function stepNativeCityFightKo<T extends NativeCityFightKoClock>(ko: T, dtMs: number):
  { readonly ko: T; readonly landed: boolean; readonly done: boolean } {
  const elapsedMs = ko.elapsedMs + sanitized(dtMs);
  const landed = ko.timing.art && !ko.landed && elapsedMs >= ko.timing.impactMs;
  return { ko: Object.freeze({ ...ko, elapsedMs, landed: ko.landed || landed }), landed, done: elapsedMs >= ko.timing.totalMs };
}

/**
 * "돌아가기" on the defeat card: his KO skips the rest of its lie to the get-up (the ground impact it passes on the way is spent
 * silently); HP refills when he stands (the KO's own end).
 */
export function skipNativeCityKoLie(state: NativeCityFightState): NativeCityFightState {
  const ko = state.ko;
  if (!ko || ko.elapsedMs >= ko.timing.riseAtMs) return state;
  return fightState({ ...state, ko: stepNativeCityFightKo(ko, ko.timing.riseAtMs - ko.elapsedMs).ko });
}

/** "다시" on the defeat card: back on his feet — no KO, no hit lock, no push, no hold, a fresh melee state (the clock and the spin run on). */
export function rematchNativeCityFight(state: NativeCityFightState): NativeCityFightState {
  return fightState({ ...state, ko: null, hit: null, knock: null, grab: null, victim: NATIVE_CITY_MELEE_VICTIM });
}

/**
 * His guard met a blow — no damage: his melee state after it (`victim` — the contact counted, its invulnerability), the shared freeze
 * (`freezeMs`: the exchange's jabGuard / clash) and the slide back along the strike axis (`guard.pushStrides[kind]` strides). `catchMs`: the
 * attacker's catch before the slide (fight ms — a dash's `dash.contact.catchMs`, its own tuning's); absent: none.
 */
export function blockNativeCityFight(state: NativeCityFightState, block: { readonly victim: NativeCityMeleeVictim; readonly push: CityPoint;
  readonly kind: NativeCityBlockKind; readonly stepUnits: number; readonly freezeMs: number; readonly catchMs?: number }): NativeCityFightState {
  const frozen = freezeNativeCityFight(state, block.freezeMs);
  return fightState({ ...frozen, victim: block.victim,
    knock: Object.freeze({ direction: block.push, units: NATIVE_CITY_COMBAT.guard.pushStrides[block.kind] * block.stepUnits, elapsedMs: 0,
      ...(block.catchMs !== undefined ? { holdMs: block.catchMs } : {}) }) });
}


export function recoilNativeCityFight(state: NativeCityFightState, direction: CityPoint, units: number): NativeCityFightState {
  if (!(units > 0)) return state;
  return fightState({ ...state, knock: Object.freeze({ direction, units, elapsedMs: 0 }) });
}


export interface NativeCityBlow {
  /** His HP after its damage (the app's `SharedPlayerHealth.damage` took it — HP is not the fight's). */
  readonly hpAfter: number;
  /** Who struck: its id, and whether its knock-out brings the defeat card. */
  readonly by: { readonly id: string; readonly defeatCard: boolean };
  /** The tier of the blow when it does not knock him out (the freeze, the shake, the sound). */
  readonly impact: NativeCityImpactTier;
  /** That tier's freeze (ms — the presentation's tier ladder, `nativeCityHitStopMs`). */
  readonly freezeMs: number;
  readonly knockbackStrides: number;
  /** His melee state after the blow: the contact counted, the protection it leaves (Otto's `playerHit.invulnerableMs`, KUMA's strike's). */
  readonly victim: NativeCityMeleeVictim;
  /** The strike axis in plan (unit): the push runs along it. */
  readonly push: CityPoint;
  readonly stepUnits: number;
  /** This blow's own hit lock (fight ms — Otto's `playerHit.stunMs`, KUMA's slam); without it the default (`nativeCityFightHitTiming`). */
  readonly stunMs?: number;
  /**
   * The attacker's catch: the push holds this long first (fight ms — a dash's `dash.contact.catchMs`, its own tuning's); never on a
   * knock-out. Absent: none.
   */
  readonly catchMs?: number;
  /** The blow can set him spinning (KUMA's dash); `from`: where in the spin order the spin starts (the facing it leaves him at). */
  readonly spin?: { readonly from: number } | null;
  /** The drawn hit reaction's lengths at the facing he takes; without it the placeholder lock. */
  readonly hit?: NativeCityFightHitTiming;
  /**
   * A later contact of the attack whose hit lock he is in (one flinch per move, 2026-10-18): the lock goes on — its clock runs on and
   * it lasts at least this blow's own lock from now (`continueNativeCityFightHit`) — instead of starting over.
   */
  readonly continues?: boolean;
  /** The drawn knock-out's beats at the facing he falls; without it the procedural fall. */
  readonly ko?: NativeCityFightKoTiming;
  /** The blow knocks him down even with HP left (a shockwave slam): the KO's fall and get-up, `downed`. */
  readonly knockdown?: boolean;
  /**
   * The push flies on the launch curve (`knockback.launch` — the grab's throw): a knockdown keeps it (the drawn landing — `ko.impactMs` — is
   * timed to the curve's stop) instead of the ground slam's flight to the fall's back contact.
   */
  readonly launch?: boolean;
  /** Extra ground travel after a knockdown's authored impact, slowing to rest. */
  readonly landingSlide?: { readonly strides: number; readonly ms: number };
}

export type NativeCityBlowKind = "ko" | "spin" | "hit";

export interface NativeCityBlowOutcome {
  readonly kind: NativeCityBlowKind;
  /** The tier it struck at ("ko" when it knocked him out). */
  readonly impact: NativeCityImpactTier;
  readonly freezeMs: number;
  /** The push's length (plan units). */
  readonly knockUnits: number;
  /** The hit lock went on (`NativeCityBlow.continues`): the drawn reaction does not start over. */
  readonly continued?: boolean;
}

/**
 * What an undefended blow does to him: at HP 0 the knock-out; a blow that can spin him (`spins`) spins him when he survives it and is
 * not spinning already (KUMA's restart lands on the spinning body as a plain hit); else the hit lock. The controller reads it first to
 * pick the drawn timing the outcome needs.
 */
export function nativeCityBlowKind(state: NativeCityFightState, hpAfter: number, spins: boolean, knocksDown = false): NativeCityBlowKind {
  return hpAfter <= 0 || knocksDown && state.ko === null ? "ko" : spins && state.stun === null ? "spin" : "hit";
}


export function takeNativeCityBlow(state: NativeCityFightState, blow: NativeCityBlow):
  { readonly state: NativeCityFightState; readonly outcome: NativeCityBlowOutcome; readonly events: readonly NativeCityFightEvent[] } {
  const kind = nativeCityBlowKind(state, blow.hpAfter, blow.spin != null, blow.knockdown === true), tuning = NATIVE_CITY_COMBAT.player.ko;
  const downed = kind === "ko" && blow.hpAfter > 0;
  const impact: NativeCityImpactTier = kind === "ko" && !downed ? "ko" : blow.impact;
  // The blow that knocks him out sends him flying at least `player.ko.launchStrides` (2026-10-20, the Rivals reference) — a launching blow
  // (a summon, the throw) its own length: its drawn landing is timed for it (2026-10-20 review) — and a knockdown pushes him at least
  // `minKnockbackStrides` (he falls along it, never crumples in place); the KO freezes short with no slow-mo (`player.ko.hitStopMs`): his
  // fall should snap, not drag.
  const floor = downed ? tuning.minKnockbackStrides : blow.launch ? 0 : tuning.launchStrides;
  const strides = kind === "ko" ? Math.max(blow.knockbackStrides, floor) : blow.knockbackStrides;
  const freezeMs = kind === "ko" && !downed ? tuning.hitStopMs * NATIVE_CITY_COMBAT.hitStopScale : blow.freezeMs;
  const knockUnits = strides * blow.stepUnits;
  const events: NativeCityFightEvent[] = [{ kind: "impact", tier: impact, by: "enemy", freezeMs, skidUnits: knockUnits },
    { kind: "sound", cue: impact === "light" ? "struck" : "struckHeavy", tier: impact }];
  let victim = blow.victim;
  let next = fightState({ ...freezeNativeCityFight(state, freezeMs), victim,
    knock: Object.freeze({ direction: blow.push, units: knockUnits, elapsedMs: 0, ...(blow.launch ? { launch: true } : {}),
      ...(blow.catchMs !== undefined && kind !== "ko" ? { holdMs: blow.catchMs } : {}) }) });
  if (kind === "ko") {
    if (state.stun) events.push({ kind: "stunEnded", recovered: false });
    const timing = blow.ko ?? nativeCityPlaceholderKoTiming();
    // A knockdown protects him through the get-up and a beat after it (no second slam on a body that just stood).
    if (downed) victim = { ...victim, invulnerableMs: Math.max(victim.invulnerableMs, timing.totalMs + NATIVE_CITY_COMBAT.player.stun.recoverMs) };
    next = fightState({ ...next, victim, stun: null, hit: null,
      // A surviving ground-slam victim flies until the authored back contact, then stays planted.
      // The shared freeze holds both the first recoil pose and the displacement at zero.
      ...(downed && !blow.launch && next.knock && timing.impactMs > 0 ? { knock: Object.freeze({ ...next.knock, flightMs: timing.impactMs }) } : {}),
      ...(blow.landingSlide && next.knock ? { knock: Object.freeze({ ...next.knock,
        slide: { afterMs: timing.impactMs, units: blow.landingSlide.strides * blow.stepUnits, ms: blow.landingSlide.ms } }) } : {}),
      // The KO's flight (`player.ko.launchStrides`, 2026-10-20) lands with his drawn fall (the procedural fall: its `fallMs`), any landing
      // slide after it.
      ...(!downed && !blow.launch && next.knock ? { knock: Object.freeze({ ...next.knock,
        flightMs: timing.impactMs > 0 ? timing.impactMs : tuning.fallMs, flightEase: NATIVE_CITY_COMBAT.knockback.ko.flightEase,
        ...(blow.landingSlide ? { slide: { afterMs: timing.impactMs, units: blow.landingSlide.strides * blow.stepUnits, ms: blow.landingSlide.ms } } : {}) }) } : {}),
      ko: Object.freeze({ ...nativeCityFightKoClock(timing), by: blow.by.id, defeatCard: blow.by.defeatCard && !downed, ...(downed ? { downed: true } : {}) }) });
    // Without the drawn fall his body falls on the blow (the drawn one sounds on its ground-impact step — the controller times it).
    if (!timing.art) events.push({ kind: "sound", cue: "down", tier: impact });
  } else if (kind === "spin") {
    // Launched SPINNING (2026-10-09): the spin starts on the hit, no hit pose first.
    next = startNativeCityFightStun(next, NATIVE_CITY_COMBAT.player.stun.ms, blow.spin!.from);
  } else {
    // (On the spinning body — KUMA's restart — too: the push is drawn in the hit reaction; the spin's clock goes on and shows again when
    // the reaction's lock ends.)
    const timing = blow.hit ?? nativeCityFightHitTiming(null, blow.stunMs);
    next = blow.continues === true && state.hit ? continueNativeCityFightHit(next, state.hit, timing) : startNativeCityFightHit(next, timing);
  }
  return { state: next, outcome: { kind, impact, freezeMs, knockUnits, ...(kind === "hit" && blow.continues === true && state.hit ? { continued: true } : {}) },
    events };
}
