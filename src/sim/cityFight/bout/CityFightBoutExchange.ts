import EXCHANGES_JSON from "../../../world/city-fight-exchanges.json";
import type { CityPoint, NativeCityDefinition } from "../../../world/NativeCityDefinition";
import type { CityFightStageLine } from "../CityFightStageLine";
import { NATIVE_CITY_FIGHTER_MEASURE } from "../../../world/NativeCityFighterMeasure";
import { NATIVE_CITY_STEP_BODY_RATIO } from "../../../world/NativeCityTalkSpot";
import { NATIVE_CITY_FOOTPRINT_STRIDES, type NativeCityFootprintKind } from "../../NativeCityActorCollision";
import type { KumaCombatState, KumaExchangePose, KumaTuning } from "../NativeCityKumaCombatState";
import { kumaAuthoredReachStrides } from "../NativeCityKumaSwing";
import { CITY_FIGHT_EXCHANGE_KINDS, type CityFightExchangeKind } from "./CityFightExchangeKinds";
import type { CityFightPinballRun } from "./CityFightBoutPinball";
import type { CityFightRushRun } from "./CityFightBoutRush";
import type { NativeCityJsonShape } from "../NativeCityCombatTuning";
import { kumaScreenDelta, kumaScreenFacing, kumaWalkPhase } from "../NativeCityKumaGeometry";
import type { NativeCityKumaFighterState } from "../NativeCityKumaFighter";

/**
 * 교전 패턴(2026-10-25 — 사용자: "전투 패턴을 더 다양하게… 카테고리를 나눠서 관통하면서 좌우로 싸우던가, 이런 패턴을 3~4가지";
 * docs/Plan/2026-10-25-oddbout-exchange-patterns): a fighter-against-fighter bout's scripted set piece of both bodies. While it runs the bout
 * owns both bodies — their AI waits, the set piece moves them — and its blows go through each one's own rules (`receiveHit`), as an
 * awakening's follow-up's do. Then the fight goes on. Numbers and each fighter's weights: `world/city-fight-exchanges.json`.
 *
 * - `cross` 교차 돌파: both free and apart, they crouch, run at each other and through each other (no body blocks), turn round and run
 *   again — two or three passes, sides swapping on each. Each pass a seeded winner strikes in passing — the blow lands where they meet — and
 *   the last pass knocks the loser down.
 * - `pinball` 로프 핀볼 (`CityFightBoutPinball`): a heavy blow throws the other into the rope; each time it throws him back the striker meets him
 *   with the next blow of his string — two or three rope hits, the striker a step nearer each time — and the last is a slam into the rope.
 * - `rush` 러시 맞대결 (`CityFightBoutRush`): two swings meeting break into string against string where they stand, until the seeded winner
 *   breaks through with his slam.
 *
 * Deterministic: every pick is a seeded share of the two corners' salts (`cityFightExchangeShare`) — never the bout's rng, whose draws would
 * shift everything after them.
 */

export { CITY_FIGHT_EXCHANGE_KINDS, type CityFightExchangeKind } from "./CityFightExchangeKinds";

interface ExchangesJson {
  readonly note: string;
  readonly common: { readonly startAfterMs: number; readonly cooldownMs: number; readonly maxPerBout: number; readonly everyMs: number;
    readonly chance: number; readonly comebackGap: number; readonly comebackBonus: number; readonly maxMs: number };
  readonly cross: { readonly minGapStrides: number; readonly maxGapStrides: number; readonly passGapStrides: number;
    readonly wallMarginStrides: number; readonly setMs: number; readonly runStridesPerSec: number; readonly accelMs: number;
    readonly accelFrom: number; readonly passSpeedUp: number; readonly turnMs: number; readonly turnBrakeMs: number;
    readonly turnBrakeStrides: number; readonly finalTurnMs: number; readonly passes: readonly number[]; readonly tieShare: number;
    readonly slashLeadStrides: number; readonly slashSlowShare: number; readonly contactStrides: number;
    readonly chipShare: number; readonly finalShare: number; readonly finalKnockStrides: number;
    readonly skidMs: number; readonly skidStrides: number; readonly finalHoldMs: number;
    readonly slashMs: number; readonly struckMs: number };
  readonly pinball: { readonly chance: number; readonly ropeMinStrides: number; readonly ropeMaxStrides: number;
    readonly ropeMarginStrides: number; readonly outStridesPerSec: number; readonly backStridesPerSec: number; readonly outLiftBodies: number;
    readonly backLiftBodies: number; readonly ropeMs: number; readonly legs: readonly number[]; readonly meetStrides: readonly number[];
    readonly stepStridesPerSec: number; readonly contactStrides: number; readonly chipShare: number; readonly finalShare: number;
    readonly finalKnockStrides: number; readonly finalHoldMs: number; readonly slashMs: number; readonly struckMs: number };
  readonly rush: { readonly chance: number; readonly togetherMs: number; readonly maxGapStrides: number; readonly ms: readonly number[];
    readonly strikeMs: number; readonly struggleShare: number; readonly wobbleStrides: number; readonly wobbleMs: number;
    readonly driftStrides: number; readonly fistStrides: readonly number[]; readonly meetOverlapStrides: number;
    readonly guardDepthStrides: number; readonly settleStridesPerSec: number;
    readonly chipShare: number; readonly finalShare: number; readonly finalKnockStrides: number; readonly finalHoldMs: number;
    readonly slashMs: number; readonly struckMs: number };
  readonly defaults: Readonly<Record<CityFightExchangeKind, number>>;
  readonly fighters: Readonly<Record<string, Readonly<Partial<Record<CityFightExchangeKind, number>>>>>;
}

const JSON_DATA = EXCHANGES_JSON satisfies NativeCityJsonShape<ExchangesJson> as unknown as ExchangesJson;

export type CityFightExchangeCommon = ExchangesJson["common"];
export type CityFightCrossTuning = ExchangesJson["cross"];
export type CityFightPinballTuning = ExchangesJson["pinball"];
export type CityFightRushTuning = ExchangesJson["rush"];

/** The exchanges' numbers, checked (an invalid one throws — a wiring error). */
export const CITY_FIGHT_EXCHANGES: { readonly common: CityFightExchangeCommon; readonly cross: CityFightCrossTuning;
  readonly pinball: CityFightPinballTuning; readonly rush: CityFightRushTuning } = (() => {
  const fail = (why: string): never => { throw new Error(`city fight exchanges: ${why}`); };
  const { common, cross, pinball, rush } = JSON_DATA;
  if (!(common.everyMs > 0) || !(common.chance >= 0) || !(common.maxPerBout >= 0) || !(common.maxMs > 0)) fail("common");
  if (!(cross.minGapStrides > 0) || !(cross.maxGapStrides >= cross.minGapStrides) || !(cross.runStridesPerSec > 0) || !(cross.passGapStrides > 0))
    fail("cross gaps and run");
  const [min, max] = cross.passes;
  if (!Number.isInteger(min) || !Number.isInteger(max) || min! < 1 || max! < min!) fail("cross passes");
  if (!(cross.tieShare >= 0 && cross.tieShare < 1)) fail("cross shares");
  if (!(cross.contactStrides >= 0 && cross.contactStrides < cross.slashLeadStrides)) fail("cross contact inside the strike's lead");
  const [legsMin, legsMax] = pinball.legs;
  if (!Number.isInteger(legsMin) || !Number.isInteger(legsMax) || legsMin! < 1 || legsMax! < legsMin!) fail("pinball legs");
  if (pinball.meetStrides.length < legsMax! || !pinball.meetStrides.every(m => m > pinball.contactStrides)) fail("pinball meets past contact, one a leg");
  if (!(pinball.ropeMinStrides > 0) || !(pinball.ropeMaxStrides >= pinball.ropeMinStrides) || !(pinball.outStridesPerSec > 0)
    || !(pinball.backStridesPerSec > 0)) fail("pinball flights");
  const [rushMin, rushMax] = rush.ms;
  if (!(rushMin! > 0) || !(rushMax! >= rushMin!) || !(rush.strikeMs > 0) || !(rush.wobbleMs > 0) || !(rush.struggleShare > 0 && rush.struggleShare < 1))
    fail("rush clock");
  const [fistMin, fistMax] = rush.fistStrides;
  if (!(fistMin! > rush.meetOverlapStrides / 2) || !(fistMax! >= fistMin!) || !(rush.guardDepthStrides >= 0) || !(rush.settleStridesPerSec > 0))
    fail("rush gaps");
  for (const [id, weights] of Object.entries(JSON_DATA.fighters)) {
    for (const [kind, weight] of Object.entries(weights)) {
      if (!CITY_FIGHT_EXCHANGE_KINDS.includes(kind as CityFightExchangeKind) || !(weight >= 0)) fail(`${id}: ${kind}`);
    }
  }
  return Object.freeze({ common: Object.freeze({ ...common }), cross: Object.freeze({ ...cross }), pinball: Object.freeze({ ...pinball }),
    rush: Object.freeze({ ...rush }) });
})();

/** A corner's weight for `kind`: his own (a registered fighter's style), his fighter id's, else the default. */
export function cityFightExchangeWeight(side: Pick<CityFightExchangeSide, "id" | "weights">, kind: CityFightExchangeKind): number {
  return side.weights?.[kind] ?? JSON_DATA.fighters[side.id]?.[kind] ?? JSON_DATA.defaults[kind] ?? 0;
}

/** A seeded share in [0, 1) for pick `key`, salted by both corners' salts (`KumaTuning.windupSalt` — drawn at the bout's start). */
export function cityFightExchangeShare(key: number, salts: readonly [number, number]): number {
  let h = Math.imul((Math.floor(key) + salts[0] * 977 + salts[1] * 7919 + 2654435) | 0, 0x2545f491);
  h = Math.imul(h ^ (h >>> 15), 0x4d73b5c9);
  h ^= h >>> 13;
  return (h >>> 0) / 0x100000000;
}

/** One corner's part in a cross: its phase, ms in it, and the way it runs along the line (+1 toward the line's `max` end). */
export interface CityFightCrossCorner {
  readonly phase: KumaExchangePose["phase"] | "out";
  readonly phaseMs: number;
  readonly dir: 1 | -1;
}

/** A blow the set piece lands this step (the bout takes it through the struck corner's rules). */
export interface CityFightExchangeBlow {
  readonly winner: 0 | 1;
  readonly pass: number;
  /** The last pass: the knockdown; else a chip in passing. */
  readonly final: boolean;
  /** The way along the line it throws him (+1 toward the line's `max` end). */
  readonly dir: 1 | -1;
}

/** An exchange in flight (the bout's, `CityFightFighterBout`): a cross, a pinball or a rush. */
export type CityFightExchangeRun = CityFightCrossRun | CityFightPinballRun | CityFightRushRun;

/** A cross in flight. */
export interface CityFightCrossRun {
  readonly kind: "cross";
  /** This bout's exchange number (0 the first) — its picks' key. */
  readonly seq: number;
  readonly ms: number;
  readonly passes: number;
  readonly passed: number;
  /** The sign of corner 0's place minus corner 1's along the line now (a pass flips it). */
  readonly order: 1 | -1;
  readonly corners: readonly [CityFightCrossCorner, CityFightCrossCorner];
  /** The last pass whose blow has landed (−1: none yet) — one blow a pass, at contact. */
  readonly landed: number;
  /** The coming pass's pick, made `slashLeadStrides` before they meet (his strike starts there): its pass and winner (null: a tie). */
  readonly lead: { readonly pass: number; readonly winner: 0 | 1 | null } | null;
  /** Fight ms the last pass's blow landed (the winner holds his strike `finalHoldMs` past it), else null. */
  readonly finalAtMs: number | null;
}

/** What the set piece needs of the stage. */
export interface CityFightExchangeStage {
  readonly line: CityFightStageLine;
  readonly projection: NativeCityDefinition["projection"];
  readonly stepUnits: number;
  readonly dtMs: number;
  readonly snap: (point: CityPoint) => CityPoint;
}

/** A corner as the set piece reads it. */
export interface CityFightExchangeSide {
  readonly state: NativeCityKumaFighterState;
  /** His whole HP (the shares' base). */
  readonly hp: number;
  readonly id: string;
  /** His run's stride on screen (the view's run cycle — `NativeCityKumaArtBridge.runStridePx`). */
  readonly runStridePx: number;
  /** His string's blow's reach from his feet as drawn (strides — `cityFightExchangeFist`). */
  readonly fistStrides: number;
  /** His own weights (a registered fighter's style — `CityFightBoutCorner.exchangeWeights`); absent: his id's. */
  readonly weights?: Readonly<Partial<Record<CityFightExchangeKind, number>>>;
}


export function cityFightExchangeFist(id: string, tuning: KumaTuning, footprint: NativeCityFootprintKind): number {
  const measure = NATIVE_CITY_FIGHTER_MEASURE[id], front = measure?.front.combo;
  const drawn = measure && typeof front === "number" ? front * measure.bodyScale / NATIVE_CITY_STEP_BODY_RATIO
    : kumaAuthoredReachStrides("combo", tuning) + NATIVE_CITY_FOOTPRINT_STRIDES[footprint] + NATIVE_CITY_FOOTPRINT_STRIDES.player;
  const [min, max] = CITY_FIGHT_EXCHANGES.rush.fistStrides as readonly [number, number];
  return Math.max(min, Math.min(max, drawn));
}

/** `point`'s place along the stage line (plan units from its origin). */
export const along = (line: CityFightStageLine, point: CityPoint) =>
  (point[0] - line.origin[0]) * line.direction[0] + (point[1] - line.origin[1]) * line.direction[1];

/** The stage line's point `t` plan units from its origin. */
export function pointAt(line: CityFightStageLine, t: number): CityPoint {
  return [line.origin[0] + line.direction[0] * t, line.origin[1] + line.direction[1] * t];
}

/**
 * He may start a set piece now: up, on the ground, in his chase or his stand — not mid-swing, not reeling, not vaulting. (`committed` is the
 * last swing's and stays set through the stand and chase after it — not a read of now.)
 */
export function cityFightExchangeFree(c: KumaCombatState): boolean {
  return c.hp > 0 && (c.mode === "chase" || c.mode === "cooldown") && !c.air && !c.vault && !c.exchange;
}

/**
 * A cross may start between these two now (their places on the stage), and its seeded pick says it does: both free, `minGapStrides`..
 * `maxGapStrides` apart with room either side of their middle for a run's `passGapStrides`; on this slot's seeded share (`slot`: the
 * `everyMs` period it falls in) under `chance` × the pair's mean weight. Returns the run, or null.
 */
export function cityFightCrossStart(stage: CityFightExchangeStage, sides: readonly [CityFightExchangeSide, CityFightExchangeSide],
  salts: readonly [number, number], seq: number, slot: number): CityFightCrossRun | null {
  const spec = CITY_FIGHT_EXCHANGES.cross, { line, stepUnits } = stage;
  const a = along(line, sides[0].state.combat.point), b = along(line, sides[1].state.combat.point);
  const gap = Math.abs(a - b) / stepUnits;
  if (gap < spec.minGapStrides || gap > spec.maxGapStrides) return null;
  const middle = (a + b) / 2, reach = (spec.passGapStrides / 2 + spec.turnBrakeStrides + spec.wallMarginStrides) * stepUnits;
  if (middle - reach < line.min || middle + reach > line.max) return null;
  const weight = (cityFightExchangeWeight(sides[0], "cross") + cityFightExchangeWeight(sides[1], "cross")) / 2;
  if (cityFightExchangeShare(slot * 31 + 11, salts) >= CITY_FIGHT_EXCHANGES.common.chance * weight) return null;
  const [min, max] = spec.passes as readonly [number, number];
  const passes = min + Math.min(max - min, Math.floor(cityFightExchangeShare(seq * 97 + 1, salts) * (max - min + 1)));
  const order: 1 | -1 = a >= b ? 1 : -1;
  return Object.freeze({ kind: "cross", seq, ms: 0, passes, passed: 0, order, landed: -1, lead: null, finalAtMs: null,
    corners: [Object.freeze({ phase: "set", phaseMs: 0, dir: order === 1 ? -1 : 1 }), Object.freeze({ phase: "set", phaseMs: 0, dir: order === 1 ? 1 : -1 })] as const });
}

/**
 * His state as the set piece takes him (`KumaCombatState.exchange`, mode `dash` — committed, not open), in `phase` facing the way `dir` runs
 * along the line: his swing, his flight and his AI's reads dropped.
 */
export function cityFightExchangeTaken(state: NativeCityKumaFighterState, kind: CityFightExchangeKind, phase: KumaExchangePose["phase"],
  dir: 1 | -1, projection: NativeCityDefinition["projection"], line: CityFightStageLine): NativeCityKumaFighterState {
  const c = state.combat;
  const facing = kumaScreenFacing(projection, [line.direction[0] * dir, line.direction[1] * dir]) ?? c.facing;
  const pose: KumaExchangePose = { kind, phase, phaseMs: 0, pass: 0, turnMs: CITY_FIGHT_EXCHANGES.cross.turnMs, slashPass: 0, slashAction: "combo",
    slashMs: null, struckMs: null, finalSlash: false, liftBodies: 0 };
  return Object.freeze({ ...state, knockback: null, combat: { ...c, mode: "dash" as const, modeMs: 0, dash: null, action: null, attackId: c.attackId + 1,
    hitsFired: 0, attackHits: 0, committed: false, running: false, neutral: null, backstep: 0, aiGuard: null, pressOn: false, leap: null,
    special: null, air: null, hurtMs: 0, stringHits: 0, retaliate: false, facing, movedPx: 0, exchange: Object.freeze(pose) } });
}

/** His state let go by the set piece: his stand (`cooldown`), turned to `toward`. */
export function cityFightExchangeReleased(state: NativeCityKumaFighterState, toward: CityPoint,
  projection: NativeCityDefinition["projection"]): NativeCityKumaFighterState {
  const c = state.combat;
  if (!c.exchange) return state;
  const facing = kumaScreenFacing(projection, [toward[0] - c.point[0], toward[1] - c.point[1]]) ?? c.facing;
  return Object.freeze({ ...state, combat: { ...c, mode: "cooldown" as const, modeMs: 0, exchange: null, dash: null, action: null, movedPx: 0, facing,
    backedUnits: 0, running: false } });
}

/** Seeded: the pass's winner (corner 0 / 1), or null — a tie (only the sparks), never on the last pass. The one far behind wins more often. */
export function cityFightCrossWinner(run: Pick<CityFightCrossRun, "seq" | "passes">, pass: number, hpShares: readonly [number, number],
  salts: readonly [number, number]): 0 | 1 | null {
  const spec = CITY_FIGHT_EXCHANGES.cross, common = CITY_FIGHT_EXCHANGES.common, final = pass >= run.passes - 1;
  if (!final && cityFightExchangeShare(run.seq * 97 + pass * 13 + 5, salts) < spec.tieShare) return null;
  const behind = hpShares[0] + common.comebackGap < hpShares[1] ? 1 : hpShares[1] + common.comebackGap < hpShares[0] ? -1 : 0;
  return cityFightExchangeShare(run.seq * 97 + pass * 13 + 7, salts) < 0.5 + behind * common.comebackBonus ? 0 : 1;
}

/**
 * One step of a cross (2026-10-25, then the game-animator review the same day): both bodies move by their phase — the crouch; the run
 * through each other at `runStridesPerSec` (from `accelFrom` of it over `accelMs`); the turn (a brake of `turnBrakeStrides` over
 * `turnBrakeMs`, then round); the last pass's winner's skid. `slashLeadStrides` before they meet the pass's seeded winner is picked and his
 * strike starts; his blow lands at contact — `contactStrides` apart, or at the pass (their order along the line flipping) at the latest —
 * and the last pass's winner skids on from there (2026-10-25, user: a blow a beat after the pass read as a fall for no reason). Both turn
 * once `passGapStrides` apart (or one `wallMarginStrides` off an end) with passes to go. The blow is returned for the bout to land; `run` is
 * null once both are out. The last pass's winner is out once his skid is over and `finalHoldMs` past his blow; a corner out (the struck
 * loser) is not moved.
 */
export function stepCityFightCross(run: CityFightCrossRun, stage: CityFightExchangeStage,
  sides: readonly [CityFightExchangeSide, CityFightExchangeSide], salts: readonly [number, number]):
  { readonly run: CityFightCrossRun | null; readonly states: readonly [NativeCityKumaFighterState, NativeCityKumaFighterState];
    readonly blow: CityFightExchangeBlow | null } {
  const spec = CITY_FIGHT_EXCHANGES.cross, { line, projection, stepUnits, dtMs, snap } = stage;
  const ms = run.ms + dtMs;
  // Each pass runs faster than the last (`passSpeedUp`); the turn before the last pass is the standoff (`finalTurnMs`).
  const speed = spec.runStridesPerSec * (1 + spec.passSpeedUp * Math.min(run.passed, run.passes - 1)) * stepUnits / 1000;
  const turnMs = run.passed >= run.passes - 1 ? spec.finalTurnMs : spec.turnMs;
  type Corner = { phase: CityFightCrossCorner["phase"]; phaseMs: number; dir: 1 | -1 };
  const corners: [Corner, Corner] = [{ ...run.corners[0], phaseMs: run.corners[0].phaseMs + dtMs }, { ...run.corners[1], phaseMs: run.corners[1].phaseMs + dtMs }];
  const states = [sides[0].state, sides[1].state] as [NativeCityKumaFighterState, NativeCityKumaFighterState];
  const places = [along(line, states[0].combat.point), along(line, states[1].combat.point)];
  const slashed: [boolean, boolean] = [false, false], struck: [boolean, boolean] = [false, false];
  const hpShares = [hpShare(sides[0]), hpShare(sides[1])] as const;
  // The crouch and the turn end: run at the other.
  corners.forEach((c, i) => {
    const toward: 1 | -1 = places[1 - i]! >= places[i]! ? 1 : -1;
    if (c.phase === "set" && c.phaseMs >= spec.setMs) Object.assign(c, { phase: "run", phaseMs: c.phaseMs - spec.setMs });
    else if (c.phase === "turn" && c.phaseMs >= turnMs) Object.assign(c, { phase: "run", phaseMs: c.phaseMs - turnMs, dir: toward });
  });
  // Move: the run (its burst off the mark), the turn's brake, the winner's skid — the last two easing out over their way.
  const eased = (from: number, to: number, ms: number, units: number) => {
    const u0 = Math.min(1, Math.max(0, from / ms)), u1 = Math.min(1, Math.max(0, to / ms));
    return units * ((2 * u1 - u1 * u1) - (2 * u0 - u0 * u0));
  };
  corners.forEach((c, i) => {
    let units = 0;
    // A strike in passing slows his run while it shows (`slashSlowShare` — 2026-10-25 review: a winner on the ground skated under it).
    const pose = states[i]!.combat.exchange, striking = pose?.slashMs != null && !pose.finalSlash && pose.slashMs < spec.slashMs;
    if (c.phase === "run") units = speed * dtMs * Math.min(1, spec.accelFrom + (1 - spec.accelFrom) * c.phaseMs / Math.max(1, spec.accelMs))
      * (striking ? spec.slashSlowShare : 1);
    else if (c.phase === "turn") units = eased(c.phaseMs - dtMs, c.phaseMs, spec.turnBrakeMs, spec.turnBrakeStrides * stepUnits);
    else if (c.phase === "skid") units = eased(c.phaseMs - dtMs, c.phaseMs, spec.skidMs, spec.skidStrides * stepUnits);
    if (units <= 0) return;
    const to = snap(pointAt(line, places[i]! + c.dir * units)), combat = states[i]!.combat;
    const movedPx = Math.hypot(...kumaScreenDelta(projection, [to[0] - combat.point[0], to[1] - combat.point[1]]));
    places[i] = along(line, to);
    states[i] = { ...states[i]!, combat: { ...combat, point: to, movedPx, phase: kumaWalkPhase(combat.phase, movedPx, sides[i]!.runStridePx) } };
  });
  let lead = run.lead, landed = run.landed, passed = run.passed, finalAtMs = run.finalAtMs;
  const running = corners[0].phase === "run" && corners[1].phase === "run";
  const pick = (pass: number) => ({ pass, winner: cityFightCrossWinner(run, pass, hpShares, salts) });
  const gapNow = Math.abs(places[0]! - places[1]!);
  // `slashLeadStrides` before they meet: the pass's winner is picked and his strike starts.
  const closing = running && corners.every((c, i) => Math.sign(places[1 - i]! - places[i]!) === c.dir);
  if (closing && passed < run.passes && lead?.pass !== passed && gapNow <= spec.slashLeadStrides * stepUnits) {
    lead = pick(passed);
    if (lead.winner !== null) {
      const last = passed >= run.passes - 1;
      states[lead.winner] = withPose(states[lead.winner], { slashMs: 0, slashPass: passed, slashAction: last ? "slam" : "combo", finalSlash: last });
      slashed[lead.winner] = true;
    }
  }
  // The pass: their order flipped while both ran.
  const order: 1 | -1 = places[0]! >= places[1]! ? 1 : -1, crossed = order !== run.order && running && passed < run.passes;
  if (crossed && lead?.pass !== passed) lead = pick(passed);
  // The blow lands at contact (or at the pass at the latest).
  let blow: CityFightExchangeBlow | null = null;
  if (lead && lead.pass === passed && lead.winner !== null && landed < passed && (crossed || closing && gapNow <= spec.contactStrides * stepUnits)) {
    const winner = lead.winner, loser = (1 - winner) as 0 | 1, final = passed >= run.passes - 1;
    blow = { winner, pass: passed, final, dir: corners[winner].dir };
    landed = passed;
    if (final) {
      // The loser is the bout's now (his own rules take the knockdown); the winner skids on, his strike held `finalHoldMs` past it.
      corners[loser] = { ...corners[loser], phase: "out", phaseMs: 0 };
      corners[winner] = { ...corners[winner], phase: "skid", phaseMs: 0 };
      finalAtMs = ms;
    } else {
      states[loser] = withPose(states[loser], { struckMs: 0 });
      struck[loser] = true;
    }
  }
  if (crossed) passed += 1;
  // Apart (or one off an end) with passes to go: both turn round.
  const gap = Math.abs(places[0]! - places[1]!) / stepUnits;
  const separating = corners.every((c, i) => c.phase === "run" && Math.sign(places[i]! - places[1 - i]!) === c.dir);
  const atEnd = corners.some((c, i) => c.dir === 1 ? line.max - places[i]! <= spec.wallMarginStrides * stepUnits
    : places[i]! - line.min <= spec.wallMarginStrides * stepUnits);
  if (separating && passed < run.passes && passed > 0 && (gap >= spec.passGapStrides || atEnd)) {
    corners.forEach(c => Object.assign(c, { phase: "turn", phaseMs: 0 }));
  }
  // The last pass's winner, his skid over and his strike held past his blow: let go.
  corners.forEach(c => {
    const held = finalAtMs !== null && ms >= finalAtMs + spec.finalHoldMs;
    if (c.phase === "skid" && c.phaseMs >= spec.skidMs && held) Object.assign(c, { phase: "out", phaseMs: 0 });
  });
  // The pose the view draws.
  corners.forEach((c, i) => {
    const combat = states[i]!.combat, pose = combat.exchange;
    if (!pose || c.phase === "out") return;
    const facing = kumaScreenFacing(projection, [line.direction[0] * c.dir, line.direction[1] * c.dir]) ?? combat.facing;
    const tick = (at: number | null, fresh: boolean) => at === null ? null : fresh ? 0 : at + dtMs;
    states[i] = { ...states[i]!, combat: { ...combat, facing, modeMs: combat.modeMs + dtMs, exchange: Object.freeze({ ...pose, phase: c.phase,
      phaseMs: c.phaseMs, pass: passed, turnMs: passed >= run.passes - 1 ? spec.finalTurnMs : spec.turnMs,
      slashMs: tick(pose.slashMs, slashed[i] === true), struckMs: tick(pose.struckMs, struck[i] === true) }) } };
  });
  const next: CityFightCrossRun = { ...run, ms, order, passed, landed, lead, finalAtMs,
    corners: [Object.freeze({ ...corners[0] }), Object.freeze({ ...corners[1] })] };
  const done = corners.every(c => c.phase === "out");
  return { run: done ? null : Object.freeze(next), states: [Object.freeze(states[0]), Object.freeze(states[1])], blow };
}

/** His HP share now (the comeback's read). */
export function hpShare(side: CityFightExchangeSide): number {
  return Math.max(0, side.state.combat.hp) / Math.max(1e-9, side.hp);
}

/** His exchange pose patched (nothing when the set piece no longer has him). */
export function withPose(state: NativeCityKumaFighterState, patch: Partial<KumaExchangePose>): NativeCityKumaFighterState {
  const pose = state.combat.exchange;
  return pose ? { ...state, combat: { ...state.combat, exchange: Object.freeze({ ...pose, ...patch }) } } : state;
}
