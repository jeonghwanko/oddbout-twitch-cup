import type { CityPoint } from "../../world/NativeCityDefinition";
import { forgetDuelAttacker } from "../duel/DuelContact";
import type { VillageFacing } from "../VillageFacing";
import { nativeCityKumaFighterBackpedal } from "./NativeCityFightBackpedal";
import type { NativeCityFightSimContext, NativeCityFightSimEvent, NativeCityFightSimResult, NativeCityFightSimState,
  NativeCityOttoFoe } from "./NativeCityFightFrame";
import { answerNativeCityEnemyStrike, answerNativeCityKumaStrikes, createNativeCityFightSim } from "./NativeCityFightSim";
import { createNativeCityKumaFighter, nativeCityKumaFightDt, nativeCityKumaFighterRematch, stepNativeCityKumaFighter, type NativeCityKumaFighterEvent,
  type NativeCityKumaFighterInput, type NativeCityKumaFighterState } from "./NativeCityKumaFighter";
import type { KumaPatrolPlan } from "./NativeCityKumaPatrol";
import type { KumaControl } from "./NativeCityKumaCombatState";
import { createOttoBarrier, createOttoState, NATIVE_CITY_OTTO_ID, ottoBodyRadius, ottoConfirmHook, ottoFalling, stepOtto, stepOttoBarrier, stepOttoDown,
  type OttoBarrierState, type OttoEvent, type OttoInput, type OttoState } from "./NativeCityOttoEncounter";
import { createOttoPickpocket, ottoCapture, ottoRelease, settleOttoPass, type OttoCaptureInput, type OttoPassGround, type OttoPickpocketState,
  type OttoReleaseInput, type OttoReleaseResult } from "./NativeCityOttoPickpocket";
import { cityFightSummonLiveByKind, EMPTY_CITY_FIGHT_SUMMONS, endCityFightSummons, type CityFightSummonField } from "./CityFightSummons";
import { NATIVE_CITY_PLAYER_ID } from "./NativeCityFactions";


export interface CityFightSession {

  readonly player: NativeCityFightSimState;
  /** Every village fighter by actor id, in roster order (KUMA first): his patrol and his fight. */
  readonly fighters: Readonly<Record<string, NativeCityKumaFighterState>>;
  /** Otto, the boss of the clockshop seizure. */
  readonly otto: CityFightOtto;
  /**
   * The summoned objects out on the stage (2026-10-20, `CityFightSummons` — a summoner's crane, his car): they live here, not on their caster,
   * and the frame's back half spawns, steps and answers them on the opponent's fight clock (`finishCityFightFrame`).
   */
  readonly summons: CityFightSummonField;
}

/** Otto's side of the session: an attempt against him on or not, his body, the barrier and the skill pickpocket's pocket. */
export interface CityFightOtto {

  readonly fighting: boolean;
  /** His body (`NativeCityOttoEncounter`) — at home between attempts, down after his defeat. */
  readonly state: OttoState;
  readonly barrier: OttoBarrierState;
  readonly pocket: OttoPickpocketState;
}

/**
 * A fighter the session starts with: his actor id, his post and his HP (his tuning's) — standing at his post's first point, or `state`
 * (a fighter already somewhere: a rule test's stand-in, a fight already on).
 */
export interface CityFightFighterSeed {
  readonly id: string;
  readonly plan: KumaPatrolPlan;
  readonly hp: number;
  readonly state?: NativeCityKumaFighterState;
}

function ottoAtHome(fighting: boolean): CityFightOtto {
  return Object.freeze({ fighting, state: createOttoState(), barrier: createOttoBarrier(), pocket: createOttoPickpocket() });
}

export function createCityFightSession(fighters: readonly CityFightFighterSeed[]): CityFightSession {
  const states: Record<string, NativeCityKumaFighterState> = {};
  for (const seed of fighters) {
    if (states[seed.id]) throw new Error(`city fight: fighter "${seed.id}" seeded twice`);
    states[seed.id] = seed.state ?? createNativeCityKumaFighter(seed.plan, seed.hp);
  }
  return Object.freeze({ player: createNativeCityFightSim(), fighters: Object.freeze(states), otto: ottoAtHome(false), summons: EMPTY_CITY_FIGHT_SUMMONS });
}

/** A fighter's rule state. An id the session was not seeded with is a wiring error. */
export function cityFightFighter(session: CityFightSession, id: string): NativeCityKumaFighterState {
  const state = session.fighters[id];
  if (!state) throw new Error(`city fight: no fighter "${id}"`);
  return state;
}

export function withCityFightFighter(session: CityFightSession, id: string, state: NativeCityKumaFighterState): CityFightSession {
  if (cityFightFighter(session, id) === state) return session;
  return Object.freeze({ ...session, fighters: Object.freeze({ ...session.fighters, [id]: state }) });
}

export function withCityFightPlayer(session: CityFightSession, player: NativeCityFightSimState): CityFightSession {
  return player === session.player ? session : Object.freeze({ ...session, player });
}

export function withCityFightSummons(session: CityFightSession, summons: CityFightSummonField): CityFightSession {
  return summons === session.summons ? session : Object.freeze({ ...session, summons });
}

function withOtto(session: CityFightSession, otto: Partial<CityFightOtto>): CityFightSession {
  return Object.freeze({ ...session, otto: Object.freeze({ ...session.otto, ...otto }) });
}

/** A fresh attack serial must not collide with this attacker's previous encounter. Protection still runs on fight time. */
function forgetPreviousEncounter(session: CityFightSession, attackerId: string): CityFightSession {
  const fight = session.player.fight, victim = forgetDuelAttacker(fight.victim, attackerId);
  if (victim === fight.victim) return session;
  return withCityFightPlayer(session, Object.freeze({ ...session.player, fight: Object.freeze({ ...fight, victim }) }));
}


export function adoptCityFightResult(session: CityFightSession, opponentId: string,
  result: NativeCityFightSimResult<NativeCityKumaFighterState>): CityFightSession {
  const next = withCityFightFighter(withCityFightPlayer(session, result.state), opponentId, result.kuma);
  return result.otto === null || result.otto === next.otto.state ? next : withOtto(next, { state: result.otto });
}


export function cityFightOttoFoe(session: CityFightSession, here: boolean, stride: number): NativeCityOttoFoe | null {
  return session.otto.fighting && here ? { state: session.otto.state, radius: ottoBodyRadius(stride) } : null;
}

/** "맞서기": a fresh attempt — Otto at home at full HP, the barrier shut, the pocket empty. */
export function startCityFightOtto(session: CityFightSession): CityFightSession {
  return Object.freeze({ ...forgetPreviousEncounter(session, NATIVE_CITY_OTTO_ID), otto: ottoAtHome(true) });
}


export function endCityFightOtto(session: CityFightSession): CityFightSession {
  return Object.freeze({ ...session, otto: ottoAtHome(false) });
}

/** Otto's HP hit 0 (`ottoTook` defeated): the attempt is over — he stays down where he fell; the pocket emptied. */
export function settleCityFightOttoDefeat(session: CityFightSession): CityFightSession {
  return withOtto(session, { fighting: false, pocket: createOttoPickpocket() });
}

/** One frame of Otto's attempt: his inputs besides the clock, the barrier and the pickpocket's pass (the session's). */
export interface CityFightOttoFrame {

  readonly dtMs: number;
  /** Dialogue, a hidden window, portal travel, a fight overlay: his clock holds. */
  readonly frozen: boolean;

  readonly cranking: boolean;

  readonly acted: boolean;
  readonly input: Omit<OttoInput, "dtMs" | "barrierOpen" | "pass">;
}


export function stepCityFightOtto(session: CityFightSession, frame: CityFightOttoFrame)
  : { readonly session: CityFightSession; readonly events: readonly OttoEvent[]; readonly cranking: boolean } {
  const clock = session.player.fight.clock;
  const fightDt = nativeCityKumaFightDt({ dtMs: frame.dtMs, frozen: frame.frozen, hitStopped: clock.hitStopMs > 0, timeScale: clock.scale });
  if (fightDt <= 0) return { session, events: [], cranking: frame.cranking };
  if (!session.otto.fighting) {
    // Down: only the decisive blow's flight and landing beat run on (`stepOttoDown`), on the same clock.
    if (!ottoFalling(session.otto.state)) return { session, events: [], cranking: frame.cranking };
    const fell = stepOttoDown(session.otto.state, { ...frame.input, dtMs: fightDt, barrierOpen: session.otto.barrier.open, pass: session.otto.pocket.pass });
    return { session: withOtto(session, { state: fell.state }), events: fell.events, cranking: false };
  }
  const barrier = stepOttoBarrier(session.otto.barrier, { dtMs: fightDt, holding: frame.cranking, interrupted: frame.acted });
  const stepped = stepOtto(session.otto.state, { ...frame.input, dtMs: fightDt, barrierOpen: barrier.open, pass: session.otto.pocket.pass });
  return { session: withOtto(session, { state: stepped.state, barrier }), events: stepped.events,
    cranking: frame.cranking && !frame.acted && !barrier.open };
}

export interface CityFightOttoAnswer {
  readonly session: CityFightSession;

  readonly events: readonly NativeCityFightSimEvent[];

  readonly strikes: readonly ("dodge" | "block" | "hit" | "ko" | "none")[];

  readonly cranking: boolean;
}


export function answerCityFightOttoStrikes(session: CityFightSession, events: readonly OttoEvent[], strike: {
  readonly damage: number; readonly stride: number; readonly cranking: boolean }, player: {
  readonly opponentId: string;
  readonly context: Omit<NativeCityFightSimContext<NativeCityKumaFighterState>, "kuma" | "otto">;
}): CityFightOttoAnswer {
  let next = session, cranking = strike.cranking;
  const fightEvents: NativeCityFightSimEvent[] = [], strikes: ("dodge" | "block" | "hit" | "ko" | "none")[] = [];
  for (const event of events) {
    if (event.kind !== "strike" || !next.otto.fighting || event.execution !== next.otto.state.execution
      || (event.contact ?? 0) !== (next.otto.state.comboBeat ?? 0)
      || (next.otto.state.phase !== "active" && next.otto.state.phase !== "recovery")) continue;
    const foe = { state: next.otto.state, radius: ottoBodyRadius(strike.stride) };
    const answer = answerNativeCityEnemyStrike(next.player, { ...player.context, kuma: cityFightFighter(next, player.opponentId), otto: foe },
      { enemyId: NATIVE_CITY_OTTO_ID, direction: event.direction, from: next.otto.state.point, damage: strike.damage });
    next = adoptCityFightResult(next, player.opponentId, answer);
    if (answer.outcome === "hit" || answer.outcome === "ko") {
      next = withOtto(next, { state: Object.freeze({ ...next.otto.state, comboHits: (next.otto.state.comboHits ?? 0) + 1 }) });
    }
    if ((event.contact ?? 0) === 0) next = withOtto(next, { state: ottoConfirmHook(next.otto.state, event.execution, answer.outcome) });
    fightEvents.push(...answer.events);
    strikes.push(answer.outcome);
    if (answer.outcome === "hit" || answer.outcome === "ko") {
      cranking = false;
      next = withOtto(next, { barrier: stepOttoBarrier(next.otto.barrier, { dtMs: 0, holding: false, interrupted: true }) });
    }
    if (answer.events.some(fight => fight.kind === "playerDown")) next = endCityFightOtto(next);
  }
  return { session: next, events: fightEvents, strikes, cranking };
}

/** The guard press steals his drive in its capture window (`ottoCapture`): true when it did (that press is not a guard). */
export function captureCityFightOtto(session: CityFightSession, input: OttoCaptureInput)
  : { readonly session: CityFightSession; readonly captured: boolean } {
  if (!session.otto.fighting) return { session, captured: false };
  const taken = ottoCapture(session.otto.pocket, session.otto.state, input);
  return { session: taken.captured ? withOtto(session, { pocket: taken.pocket }) : session, captured: taken.captured };
}

/** The release key throws the stored drive back (`ottoRelease`); `result.accepted` when it did. */
export function releaseCityFightOtto(session: CityFightSession, input: OttoReleaseInput)
  : { readonly session: CityFightSession; readonly result: OttoReleaseResult } {
  const result = ottoRelease(session.otto.pocket, session.otto.state, input);
  return { session: result.accepted ? withOtto(session, { pocket: result.pocket, state: result.otto }) : session, result };
}


export function settleCityFightOttoPass(session: CityFightSession, ground: OttoPassGround)
  : { readonly session: CityFightSession; readonly place: CityPoint | null } {
  if (!session.otto.fighting) return { session, place: null };
  const settled = settleOttoPass(session.otto.pocket, session.otto.state, ground);
  return { session: settled.pocket === session.otto.pocket ? session : withOtto(session, { pocket: settled.pocket }), place: settled.place };
}

/** A fresh fight for fighter `id` (a challenge of a calm fighter): full `hp` and poise where he stands, nothing in flight. */
export function freshCityFightFighter(session: CityFightSession, id: string, hp: number): CityFightSession {
  const fresh = withCityFightSummons(session,
    endCityFightSummons(endCityFightSummons(session.summons, id, "reset"), NATIVE_CITY_PLAYER_ID, "reset"));
  return withCityFightFighter(forgetPreviousEncounter(fresh, id), id, nativeCityKumaFighterRematch(cityFightFighter(session, id), hp));
}


export function cityFightFighterClock(session: CityFightSession, id: string, opponentId: string)
  : { readonly hitStopped: boolean; readonly timeScale: number; readonly knockTimeScale?: number } {
  if (id !== opponentId) return { hitStopped: false, timeScale: 1 };
  const clock = session.player.fight.clock;
  return { hitStopped: clock.hitStopMs > 0, timeScale: clock.scale, knockTimeScale: clock.knockScale };
}

/** A fighter who stands: no walk, no guard, no press. */
const STAND: KumaControl = Object.freeze({ walk: 0, guard: false, press: null });

/** What the session does with one fighter this frame. */
export type CityFightFighterFrame =
  /** He is not drawn yet (his art is not in): his rules wait. */
  | { readonly kind: "wait" }

  | { readonly kind: "staged"; readonly point: CityPoint; readonly facing: VillageFacing }
  /** His rules step (`stepNativeCityKumaFighter`) on his fight clock (`cityFightFighterClock` — the session fills it in). */
  | { readonly kind: "step"; readonly input: Omit<NativeCityKumaFighterInput, "hitStopped" | "timeScale"> };


export function stepCityFightFighter(session: CityFightSession, id: string, frame: CityFightFighterFrame | undefined, opponentId: string,
  summons = false)
  : { readonly session: CityFightSession; readonly events: readonly NativeCityKumaFighterEvent[] } {
  const state = cityFightFighter(session, id);
  if (!frame || frame.kind === "wait") return { session, events: [] };
  if (frame.kind === "staged") return { session: withCityFightFighter(session, id, nativeCityKumaFighterBackpedal(state, frame.point, frame.facing)),
    events: [] };
  const guard = id === opponentId ? { playerGuardMs: session.player.guardUp ? session.player.defense.guardUpMs : 0 } : {};
  // A summoner opponent on a stage may cast: how many of his are out now (`KumaCombatInput.summons`).
  const slots = frame.input.tuning.summons ?? [];
  const cast = summons && id === opponentId && slots.length > 0
    ? { summons: { live: cityFightSummonLiveByKind(session.summons, id, slots.map(slot => slot.kind)) } } : {};
  const stand = id === opponentId && session.player.foeFollowUp !== null ? { control: STAND } : {};
  const step = stepNativeCityKumaFighter(state, { ...frame.input, ...cityFightFighterClock(session, id, opponentId), ...guard, ...cast, ...stand });
  return { session: withCityFightFighter(session, id, step.state), events: step.events };
}


export function answerCityFightOpponent(session: CityFightSession, opponentId: string, events: readonly NativeCityKumaFighterEvent[],
  context: Omit<NativeCityFightSimContext<NativeCityKumaFighterState>, "kuma">)
  : { readonly session: CityFightSession; readonly events: readonly NativeCityFightSimEvent[] } {
  const answer = answerNativeCityKumaStrikes(session.player, { ...context, kuma: cityFightFighter(session, opponentId) }, events);
  return { session: adoptCityFightResult(session, opponentId, answer), events: answer.events };
}
