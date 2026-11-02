import { kumaScreenDelta, kumaScreenFacing } from "../NativeCityKumaGeometry";
import type { NativeCityKumaFighterState } from "../NativeCityKumaFighter";
import { along, CITY_FIGHT_EXCHANGES, cityFightExchangeShare, cityFightExchangeWeight, hpShare, pointAt, withPose, type CityFightExchangeBlow,
  type CityFightExchangeSide, type CityFightExchangeStage } from "./CityFightBoutExchange";

/**
 * 러시 맞대결(2026-10-25 교전 패턴 3 — `CityFightBoutExchange`; numbers `world/city-fight-exchanges.json` rush): two swings meeting (the bout's
 * clash) break into string against string where they stand — both throw their combo's blows in turn, sparks between them, the pair carried
 * toward the one losing — until the seeded winner breaks through with his slam: a knockdown, landed at contact.
 */

/** A rush in flight (`CityFightExchangeRun`). */
export interface CityFightRushRun {
  readonly kind: "rush";
  /** This bout's exchange number (0 the first) — its picks' key. */
  readonly seq: number;
  readonly ms: number;
  /** Its length (fight ms) before the break, the winner, and the way from him to the loser along the line (+1 toward its `max` end). */
  readonly totalMs: number;
  readonly winner: 0 | 1;
  readonly dir: 1 | -1;
  /** Blows met so far (one a `strikeMs` — what a visible bout sparks on). */
  readonly beats: number;
  /** The pair carried so far toward the loser (plan units). */
  readonly drifted: number;
  /** Each corner's blow's reach from his feet as drawn (strides — `CityFightExchangeSide.fistStrides`): where the two stand, where it sparks. */
  readonly fists: readonly [number, number];
  /** Fight ms the break landed (the winner holds his slam `finalHoldMs` past it), else null. */
  readonly finalAtMs: number | null;
}

/**
 * A rush may break out of a clash between these two (the bout reads that), its seeded pick saying it does: `chance` × the pair's mean weight
 * on the clash's own key (`key` — the bout's step). Its winner leans to the one far behind (the comeback's), its length is seeded in `ms`.
 */
export function cityFightRushStart(stage: CityFightExchangeStage, sides: readonly [CityFightExchangeSide, CityFightExchangeSide],
  salts: readonly [number, number], seq: number, key: number): CityFightRushRun | null {
  const spec = CITY_FIGHT_EXCHANGES.rush, common = CITY_FIGHT_EXCHANGES.common;
  const weight = (cityFightExchangeWeight(sides[0], "rush") + cityFightExchangeWeight(sides[1], "rush")) / 2;
  if (cityFightExchangeShare(key * 3 + 29, salts) >= spec.chance * weight) return null;
  const shares = [hpShare(sides[0]), hpShare(sides[1])] as const;
  const behind = shares[0] + common.comebackGap < shares[1] ? 1 : shares[1] + common.comebackGap < shares[0] ? -1 : 0;
  const winner: 0 | 1 = cityFightExchangeShare(seq * 97 + key + 41, salts) < 0.5 + behind * common.comebackBonus ? 0 : 1;
  const [min, max] = spec.ms as readonly [number, number];
  const totalMs = min + (max - min) * cityFightExchangeShare(seq * 97 + 43, salts);
  const { line } = stage, a = along(line, sides[winner].state.combat.point), b = along(line, sides[1 - winner]!.state.combat.point);
  return Object.freeze({ kind: "rush", seq, ms: 0, totalMs, winner, dir: b >= a ? 1 : -1, beats: 0, drifted: 0,
    fists: Object.freeze([sides[0].fistStrides, sides[1].fistStrides] as const), finalAtMs: null });
}

/**
 * One step of a rush — a power struggle (2026-10-26, user: blow for blow read as nothing): first (`struggleShare` of it) both throw their
 * string's first two blows together, fist against fist (their pose's `slashPass` counts them, one each `strikeMs`), the pair rocking
 * `wobbleStrides` back and forth; then the loser falls back onto his guard (his pose's `struckMs` — ms he has been pushed) and both are
 * carried `driftStrides` toward his side, the winner on him. They stand by their drawn reach (`fists`): struggling, the two fists less
 * `meetOverlapStrides` apart (fist against fist in the middle); pushed, the winner's fist plus `guardDepthStrides` (his blows on the guard).
 * At the end the winner's slam lands (the bout lands
 * the blow — the loser is his own rules' from there); he holds it `finalHoldMs`. `run` is null once both are let go.
 */
export function stepCityFightRush(run: CityFightRushRun, stage: CityFightExchangeStage,
  sides: readonly [CityFightExchangeSide, CityFightExchangeSide]):
  { readonly run: CityFightRushRun | null; readonly states: readonly [NativeCityKumaFighterState, NativeCityKumaFighterState];
    readonly blow: CityFightExchangeBlow | null } {
  const spec = CITY_FIGHT_EXCHANGES.rush, { line, projection, stepUnits, dtMs, snap } = stage;
  const states = [sides[0].state, sides[1].state] as [NativeCityKumaFighterState, NativeCityKumaFighterState];
  const ms = run.ms + dtMs, w = run.winner, l = (1 - w) as 0 | 1, dir = run.dir;
  const pushAt = run.totalMs * spec.struggleShare, t = Math.min(ms, run.totalMs), pushing = t >= pushAt;
  let blow: CityFightExchangeBlow | null = null, finalAtMs = run.finalAtMs, drifted = run.drifted;
  if (finalAtMs === null) {
    // The struggle rocks the pair back and forth (easing out as the push takes over); the push carries it toward the loser on a smoothstep.
    const k = pushing ? Math.min(1, (t - pushAt) / Math.max(1, run.totalMs - pushAt)) : 0;
    const want = (spec.wobbleStrides * Math.sin(2 * Math.PI * t / spec.wobbleMs) * (1 - k) + spec.driftStrides * k * k * (3 - 2 * k)) * stepUnits;
    const step = want - drifted;
    drifted = want;
    const places = [along(line, states[0].combat.point), along(line, states[1].combat.point)];
    const middle = (places[0]! + places[1]!) / 2 + dir * step, settle = spec.settleStridesPerSec * stepUnits * dtMs / 1000;
    for (const i of [0, 1] as const) {
      const gap = pushing ? run.fists[w] + spec.guardDepthStrides : run.fists[0] + run.fists[1] - spec.meetOverlapStrides;
      const target = middle + (i === w ? -dir : dir) * gap * stepUnits / 2, at = places[i]! + dir * step;
      const combat = states[i].combat, to = snap(pointAt(line, at + Math.max(-settle, Math.min(settle, target - at))));
      const movedPx = Math.hypot(...kumaScreenDelta(projection, [to[0] - combat.point[0], to[1] - combat.point[1]]));
      states[i] = { ...states[i], combat: { ...combat, point: to, movedPx } };
    }
    if (ms >= run.totalMs) {
      blow = { winner: w, pass: run.beats, final: true, dir };
      finalAtMs = ms;
      states[w] = withPose(states[w], { slashMs: 0, slashAction: "slam", slashPass: 0, finalSlash: true });
    }
  }
  const beats = finalAtMs === null ? Math.floor(t / spec.strikeMs) : run.beats;
  // The poses: both facing each other, striking together; the loser on his guard once pushed; the winner's slam held after the break.
  for (const i of [0, 1] as const) {
    if (finalAtMs !== null && i === l) continue;
    const combat = states[i].combat, pose = combat.exchange;
    if (!pose) continue;
    const face = (i === w ? dir : -dir) as 1 | -1;
    const facing = kumaScreenFacing(projection, [line.direction[0] * face, line.direction[1] * face]) ?? combat.facing;
    const strike = pose.finalSlash ? { slashMs: (pose.slashMs ?? 0) + (blow ? 0 : dtMs) }
      : { slashPass: Math.floor(t / spec.strikeMs), slashMs: t % spec.strikeMs, struckMs: i === l && pushing ? t - pushAt : null };
    states[i] = { ...states[i], combat: { ...combat, facing, modeMs: combat.modeMs + dtMs, exchange: Object.freeze({ ...pose, phase: "flurry" as const,
      phaseMs: pose.phaseMs + dtMs, pass: beats, ...strike }) } };
  }
  const done = finalAtMs !== null && ms >= finalAtMs + spec.finalHoldMs;
  const next: CityFightRushRun = { ...run, ms, beats, drifted, finalAtMs };
  return { run: done ? null : Object.freeze(next), states: [Object.freeze(states[0]), Object.freeze(states[1])], blow };
}

/** The rush is in its push now (the loser on his guard, carried back): what a visible bout sparks on the winner's fist, at the guard, for. */
export function cityFightRushPushing(run: Pick<CityFightRushRun, "ms" | "totalMs">): boolean {
  return Math.min(run.ms, run.totalMs) >= run.totalMs * CITY_FIGHT_EXCHANGES.rush.struggleShare;
}

/** The corner a rush still owns: both until the break, then the winner until his hold ends. */
export function cityFightRushOwns(run: CityFightRushRun, corner: 0 | 1): boolean {
  return run.finalAtMs === null || corner === run.winner;
}
