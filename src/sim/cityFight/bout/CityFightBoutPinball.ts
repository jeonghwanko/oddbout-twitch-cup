import { kumaScreenDelta, kumaScreenFacing, kumaWalkPhase } from "../NativeCityKumaGeometry";
import type { NativeCityKumaFighterState } from "../NativeCityKumaFighter";
import { along, CITY_FIGHT_EXCHANGES, cityFightExchangeShare, cityFightExchangeWeight, pointAt, withPose, type CityFightExchangeBlow,
  type CityFightExchangeSide, type CityFightExchangeStage } from "./CityFightBoutExchange";

/**
 * 로프 핀볼(2026-10-25 교전 패턴 2 — `CityFightBoutExchange`; numbers `world/city-fight-exchanges.json` pinball): a clean heavy blow throws the other
 * into the rope behind him; the rope throws him back and the striker meets him with the next blow of his string — into the rope again. Two or
 * three rope hits, the striker a step nearer the rope each time (`meetStrides` — the beat quickens); the blow after the last is the slam: a
 * knockdown into the rope. Every blow lands at contact (the cross's lesson: a blow a beat away read as a fall for no reason).
 */

/** A pinball in flight (`CityFightExchangeRun`). */
export interface CityFightPinballRun {
  readonly kind: "pinball";
  /** This bout's exchange number (0 the first) — its picks' key. */
  readonly seq: number;
  readonly ms: number;
  readonly striker: 0 | 1;
  /** The way from the striker to the rope the struck one is thrown at (+1 toward the line's `max` end). */
  readonly dir: 1 | -1;
  /** Rope hits in all, and so far. */
  readonly legs: number;
  readonly leg: number;
  /** The struck one: thrown into the rope (`out`), on it (`rope`), thrown back at the striker (`back`), his own rules' (`done`). */
  readonly flight: "out" | "rope" | "back" | "done";
  readonly flightMs: number;
  /** This flight's start and end along the line (plan units — its arc's span). */
  readonly from: number;
  readonly to: number;
  /** The striker: stepping up to his mark, ready there, holding his slam (`hold`), let go (`out`). */
  readonly strikerPhase: "step" | "ready" | "hold" | "out";
  /** Fight ms the slam landed (he holds it `finalHoldMs` past it), else null. */
  readonly finalAtMs: number | null;
}

/** The rope's place along the line the struck one is thrown at (his feet against it — `ropeMarginStrides` off its end). */
function ropeAlong(stage: CityFightExchangeStage, dir: 1 | -1): number {
  const margin = CITY_FIGHT_EXCHANGES.pinball.ropeMarginStrides * stage.stepUnits;
  return dir === 1 ? stage.line.max - margin : stage.line.min + margin;
}

/** The striker's mark before rope hit `leg` (its `meetStrides` off the rope, never back past where he stands). */
function markAlong(stage: CityFightExchangeStage, dir: 1 | -1, leg: number): number {
  const meets = CITY_FIGHT_EXCHANGES.pinball.meetStrides;
  return ropeAlong(stage, dir) - dir * (meets[Math.min(leg, meets.length - 1)] ?? 0) * stage.stepUnits;
}

/**
 * A pinball may start off `striker`'s clean heavy blow (the bout reads that), its seeded pick saying it does: the struck one with the rope
 * `ropeMinStrides`..`ropeMaxStrides` behind him (the way `dir` the blow threw him), on `chance` × the striker's weight. Returns the run, or null.
 * `key`: the blow's own (the striker's contacts so far — one pick a blow).
 */
export function cityFightPinballStart(stage: CityFightExchangeStage, sides: readonly [CityFightExchangeSide, CityFightExchangeSide],
  striker: 0 | 1, dir: 1 | -1, salts: readonly [number, number], seq: number, key: number): CityFightPinballRun | null {
  const spec = CITY_FIGHT_EXCHANGES.pinball, struck = sides[1 - striker]!, { line, stepUnits } = stage;
  const at = along(line, struck.state.combat.point), room = (ropeAlong(stage, dir) - at) * dir / stepUnits;
  if (room < spec.ropeMinStrides || room > spec.ropeMaxStrides) return null;
  if (cityFightExchangeShare(key * 7 + seq * 97 + 23, salts) >= spec.chance * cityFightExchangeWeight(sides[striker], "pinball")) return null;
  const [min, max] = spec.legs as readonly [number, number];
  const legs = min + Math.min(max - min, Math.floor(cityFightExchangeShare(seq * 97 + key * 5 + 3, salts) * (max - min + 1)));
  return Object.freeze({ kind: "pinball", seq, ms: 0, striker, dir, legs, leg: 0, flight: "out", flightMs: 0, from: at, to: ropeAlong(stage, dir),
    strikerPhase: "ready", finalAtMs: null });
}

/**
 * One step of a pinball: the struck one flies (into the rope at `outStridesPerSec`, held on it `ropeMs`, thrown back at `backStridesPerSec`,
 * his drawn arc `outLiftBodies` / `backLiftBodies` high), the striker steps up to his mark. At `contactStrides` the struck one coming back
 * meets the striker's blow: a chip and into the rope again, or — after the last rope hit — the slam (the bout lands the blow; the struck one
 * is his own rules' from there). `rope`: he hit the rope this step (what a visible bout springs). `run` is null once both are let go.
 */
export function stepCityFightPinball(run: CityFightPinballRun, stage: CityFightExchangeStage,
  sides: readonly [CityFightExchangeSide, CityFightExchangeSide]):
  { readonly run: CityFightPinballRun | null; readonly states: readonly [NativeCityKumaFighterState, NativeCityKumaFighterState];
    readonly blow: CityFightExchangeBlow | null; readonly rope: boolean } {
  const spec = CITY_FIGHT_EXCHANGES.pinball, { line, projection, stepUnits, dtMs, snap } = stage;
  const s = run.striker, t = (1 - s) as 0 | 1, dir = run.dir;
  const states = [sides[0].state, sides[1].state] as [NativeCityKumaFighterState, NativeCityKumaFighterState];
  const ms = run.ms + dtMs;
  let { leg, flight, flightMs, from, to, strikerPhase, finalAtMs } = run;
  flightMs += dtMs;
  const place = (i: 0 | 1, at: number) => {
    const to2 = snap(pointAt(line, at)), combat = states[i].combat;
    const movedPx = Math.hypot(...kumaScreenDelta(projection, [to2[0] - combat.point[0], to2[1] - combat.point[1]]));
    states[i] = { ...states[i], combat: { ...combat, point: to2, movedPx, phase: kumaWalkPhase(combat.phase, movedPx, sides[i].runStridePx) } };
    return along(line, to2);
  };
  let strikerAt = along(line, states[s].combat.point), struckAt = along(line, states[t].combat.point);
  // The striker steps up to his mark for the coming rope hit (never back).
  if (strikerPhase === "step" || strikerPhase === "ready") {
    const mark = markAlong(stage, dir, leg), left = (mark - strikerAt) * dir;
    if (left > 1e-6) {
      strikerAt = place(s, strikerAt + dir * Math.min(left, spec.stepStridesPerSec * stepUnits * dtMs / 1000));
      strikerPhase = "step";
    } else strikerPhase = "ready";
  }
  let rope = false, blow: CityFightExchangeBlow | null = null;
  const slashed = [false, false], struck = [false, false];
  if (flight === "out") {
    const end = ropeAlong(stage, dir), next = struckAt + dir * spec.outStridesPerSec * stepUnits * dtMs / 1000;
    if ((end - next) * dir <= 0) {
      struckAt = place(t, end);
      flight = "rope"; flightMs = 0; leg += 1; rope = true;
    } else struckAt = place(t, next);
  } else if (flight === "rope") {
    if (flightMs >= spec.ropeMs) { flight = "back"; flightMs = 0; from = struckAt; to = markAlong(stage, dir, leg) + dir * spec.contactStrides * stepUnits; }
  } else if (flight === "back") {
    struckAt = place(t, struckAt - dir * spec.backStridesPerSec * stepUnits * dtMs / 1000);
    // He meets the striker's blow: back into the rope, or after the last rope hit the slam.
    if ((struckAt - strikerAt) * dir <= spec.contactStrides * stepUnits) {
      const final = leg >= run.legs;
      blow = { winner: s, pass: leg - 1, final, dir };
      states[s] = withPose(states[s], { slashMs: 0, slashPass: leg - 1, slashAction: final ? "slam" : "combo", finalSlash: final });
      slashed[s] = true;
      if (final) { flight = "done"; strikerPhase = "hold"; finalAtMs = ms; }
      else {
        states[t] = withPose(states[t], { struckMs: 0 });
        struck[t] = true;
        flight = "out"; flightMs = 0; from = struckAt; to = ropeAlong(stage, dir);
      }
    }
  }
  if (strikerPhase === "hold" && finalAtMs !== null && ms >= finalAtMs + spec.finalHoldMs) strikerPhase = "out";
  // The poses the view draws: the striker facing the rope, the struck one facing him; the thrown body's arc over its flight.
  const arc = flight === "out" || flight === "back" ? Math.sin(Math.PI * Math.min(1, Math.max(0, (struckAt - from) / ((to - from) || 1))))
    * (flight === "out" ? spec.outLiftBodies : spec.backLiftBodies) : 0;
  const tick = (at: number | null, fresh: boolean) => at === null ? null : fresh ? 0 : at + dtMs;
  const pose = (i: 0 | 1, phase: "out" | "rope" | "back" | "step" | "ready" | "hold", face: 1 | -1, lift: number) => {
    const combat = states[i].combat, current = combat.exchange;
    if (!current) return;
    const facing = kumaScreenFacing(projection, [line.direction[0] * face, line.direction[1] * face]) ?? combat.facing;
    states[i] = { ...states[i], combat: { ...combat, facing, modeMs: combat.modeMs + dtMs, exchange: Object.freeze({ ...current,
      phase: phase === "hold" ? "ready" : phase, phaseMs: phase === current.phase ? current.phaseMs + dtMs : 0, pass: leg, liftBodies: lift,
      slashMs: tick(current.slashMs, slashed[i] === true), struckMs: tick(current.struckMs, struck[i] === true) }) } };
  };
  if (strikerPhase !== "out") pose(s, strikerPhase, dir, 0);
  if (flight !== "done") pose(t, flight, (-dir) as 1 | -1, arc);
  const next: CityFightPinballRun = { ...run, ms, leg, flight, flightMs, from, to, strikerPhase, finalAtMs };
  const done = flight === "done" && strikerPhase === "out";
  return { run: done ? null : Object.freeze(next), states: [Object.freeze(states[0]), Object.freeze(states[1])], blow, rope };
}

/** The corner a pinball still owns (`CityFightFighterBout` lets the others go): the struck one until the slam, the striker until his hold ends. */
export function cityFightPinballOwns(run: CityFightPinballRun, corner: 0 | 1): boolean {
  return corner === run.striker ? run.strikerPhase !== "out" : run.flight !== "done";
}
