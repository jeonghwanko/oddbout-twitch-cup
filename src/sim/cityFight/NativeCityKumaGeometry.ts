import { villagePathFacing } from "../VillagePathFacing";
import { NATIVE_CITY_COMBAT } from "./NativeCityCombatTuning";
import type { VillageFacing } from "../VillageFacing";
import { cityScreenToPlan, type CityPoint, type NativeCityDefinition } from "../../world/NativeCityDefinition";
import type { KumaArtFacing, KumaCombatInput, KumaCombatState, KumaDrawnClip } from "./NativeCityKumaCombatState";

/** KUMA형 파이터의 화면·평면 기하(2026-10-13, `NativeCityKumaPatrol`에서 나눔): 투영, 여덟 방향, 그린 방향, 보폭, 걸음 한 칸. */

/** 평면 변위의 화면 변위(원점 제외). */
export function kumaScreenDelta(projection: NativeCityDefinition["projection"], delta: CityPoint): CityPoint {
  const { x, y } = projection;
  return [x[0] * delta[0] + y[0] * delta[1], x[1] * delta[0] + y[1] * delta[1]];
}

/** 평면 방향을 화면 8방향으로. 길이가 0 이면 null. */
export function kumaScreenFacing(projection: NativeCityDefinition["projection"], delta: CityPoint): VillageFacing | null {
  const [dx, dy] = kumaScreenDelta(projection, delta);
  return Math.hypot(dx, dy) < 1e-6 ? null : villagePathFacing(dx, dy);
}

/** 화면에서 움직인 거리만큼 걷기 위상을 민다(제자리에서는 멈춘다). `backward`: 뒷걸음 — 같은 걷기를 거꾸로 돌린다. */
export function kumaWalkPhase(phase: number, movedPx: number, stridePx: number, backward = false): number {
  if (!(movedPx > 0) || !(stridePx > 0)) return phase;
  const next = (phase + (backward ? -1 : 1) * movedPx / stridePx) % 1;
  return next < 0 ? next + 1 : next;
}

/**
 * The heading an action along plan `delta` is drawn at — and so the one its timing, hit cone and contact point use. With
 * `art` (his pack) the exact 8-way heading when that clip exists there; otherwise, and without art, the front-biased screen
 * diagonal (the four-diagonal rule, `nativeCityFrontBiasedDiagonal`). Null for a zero vector.
 */
export function kumaActionFacing(projection: NativeCityDefinition["projection"], delta: CityPoint, clip: KumaDrawnClip,
  art?: KumaArtFacing): VillageFacing | null {
  const [dx, dy] = kumaScreenDelta(projection, delta);
  if (Math.hypot(dx, dy) < 1e-6) return null;
  const diagonal = nativeCityFrontBiasedDiagonal(dx, dy);
  return art ? art(clip, villagePathFacing(dx, dy), diagonal) : diagonal;
}

/** Screen unit vector of each heading (y down). */
const HEADING_SCREEN: Readonly<Record<VillageFacing, CityPoint>> = {
  right: [1, 0], left: [-1, 0], down: [0, 1], up: [0, -1],
  "down-right": [Math.SQRT1_2, Math.SQRT1_2], "down-left": [-Math.SQRT1_2, Math.SQRT1_2],
  "up-right": [Math.SQRT1_2, -Math.SQRT1_2], "up-left": [-Math.SQRT1_2, -Math.SQRT1_2],
};

/**
 * The plan direction a swing's hit cone and contact point use: his aim, turned (on screen) to within 45° of the heading he is
 * drawn at. An exact 8-way heading always holds the aim (its sector is ±26.6°); only the front-biased diagonal of an aim
 * just above the horizontal — the fist drawn below it — pulls the cone down onto the horizontal.
 */
export function kumaStrikeDirection(projection: NativeCityDefinition["projection"], aim: CityPoint, facing: VillageFacing): CityPoint {
  const [sx, sy] = kumaScreenDelta(projection, aim), length = Math.hypot(sx, sy);
  if (length < 1e-9) return aim;
  const [fx, fy] = HEADING_SCREEN[facing];
  const cos = (sx * fx + sy * fy) / length;
  if (cos >= Math.SQRT1_2 - 1e-9) return aim;
  // Rotate the facing vector 45° toward the aim's side.
  const cross = fx * sy - fy * sx, turn = (cross >= 0 ? 1 : -1) * Math.PI / 4;
  const tx = fx * Math.cos(turn) - fy * Math.sin(turn), ty = fx * Math.sin(turn) + fy * Math.cos(turn);
  const plan = cityScreenToPlan(projection, [tx, ty], 1e-12);
  if (plan === null) return aim;
  const [px, py] = plan, planLength = Math.hypot(px, py);
  return planLength < 1e-12 ? aim : [px / planLength, py / planLength];
}

/** The heading pointing the other way along the same axis (the victim of a blow faces its attacker back along the strike axis). */
export const NATIVE_CITY_OPPOSITE_FACING: Readonly<Record<VillageFacing, VillageFacing>> = Object.freeze({
  right: "left", left: "right", down: "up", up: "down",
  "down-right": "up-left", "up-left": "down-right", "up-right": "down-left", "down-left": "up-right",
});

/**
 * The plan unit vector a drawn heading points along on screen (its 8-way screen direction, inverted through the projection): a
 * blow's strike axis as a push (json note "SAME AXIS"). Null for a degenerate projection.
 */
export function nativeCityFacingPlan(projection: NativeCityDefinition["projection"], facing: VillageFacing): CityPoint | null {
  const plan = cityScreenToPlan(projection, HEADING_SCREEN[facing], 1e-12);
  if (plan === null) return null;
  const [px, py] = plan, length = Math.hypot(px, py);
  return length < 1e-12 ? null : [px / length, py / length];
}

/**
 * The heading a victim is drawn at for a blow along `axis` (the attacker's drawn heading): facing back along it, at that exact
 * heading when his pack draws `clip` there (`art`), else its fallback (the front-biased diagonal of the same screen vector).
 */
export function nativeCityVictimFacing(axis: VillageFacing, clip: KumaDrawnClip, art?: KumaArtFacing): VillageFacing {
  const exact = NATIVE_CITY_OPPOSITE_FACING[axis], [hx, hy] = HEADING_SCREEN[exact];
  const diagonal = nativeCityFrontBiasedDiagonal(hx, hy);
  return art ? art(clip, exact, diagonal) : diagonal;
}

/** 평면 방향의 화면 사분면 대각(앞쪽 치우침). 8방향 원화가 없는 동작의 방향(`kumaActionFacing`). */
export function kumaScreenDiagonal(projection: NativeCityDefinition["projection"], delta: CityPoint): VillageFacing | null {
  const [dx, dy] = kumaScreenDelta(projection, delta);
  if (Math.hypot(dx, dy) < 1e-6) return null;
  return nativeCityFrontBiasedDiagonal(dx, dy);
}

/**
 * Screen quadrant diagonal, front-biased: a direction within |dy| < `exchange.frontBiasSlope`·|dx| of the horizontal draws the
 * FRONT diagonal (down-left / down-right) — a fight along the screen's horizontal must not flip into the back art on a
 * one-pixel lean (2026-10-08 animator review).
 */
export function nativeCityFrontBiasedDiagonal(dx: number, dy: number, slope = NATIVE_CITY_COMBAT.exchange.frontBiasSlope): VillageFacing {
  const front = dy >= 0 || Math.abs(dy) < slope * Math.abs(dx);
  return front ? (dx >= 0 ? "down-right" : "down-left") : (dx >= 0 ? "up-right" : "up-left");
}

/** Screen px of one stride (`stepUnits` measured on the screen horizontal, like `nativeCityStepUnits`). */
export function kumaStepPx(input: Pick<KumaCombatInput, "projection" | "stepUnits">): number {
  return input.stepUnits * Math.hypot(input.projection.x[0], input.projection.y[0]);
}

export const unit = (delta: CityPoint): CityPoint | null => {
  const length = Math.hypot(delta[0], delta[1]);
  return length < 1e-9 ? null : [delta[0] / length, delta[1] / length];
};

/** 화면 속도 `pacePxPerSec` 로 `goal` 쪽 한 걸음(최대 `maxUnits`). */
export function walkToward(state: KumaCombatState, goal: CityPoint, input: KumaCombatInput, pacePxPerSec: number, maxUnits: number, dtMs: number)
  : { readonly point: CityPoint; readonly movedPx: number; readonly facing: VillageFacing; readonly arrived: boolean } {
  const delta: CityPoint = [goal[0] - state.point[0], goal[1] - state.point[1]];
  const direction = unit(delta);
  if (!direction) return { point: state.point, movedPx: 0, facing: state.facing, arrived: true };
  const pxPerUnit = Math.hypot(...kumaScreenDelta(input.projection, direction));
  const want = Math.min(Math.hypot(delta[0], delta[1]), Math.max(0, maxUnits));
  const units = pxPerUnit > 1e-9 ? Math.min(want, Math.max(0, pacePxPerSec) * dtMs / 1000 / pxPerUnit) : 0;
  const next = units > 0 ? input.move(state.point, [state.point[0] + direction[0] * units, state.point[1] + direction[1] * units]) : state.point;
  const moved = kumaScreenDelta(input.projection, [next[0] - state.point[0], next[1] - state.point[1]]);
  return { point: next, movedPx: Math.hypot(moved[0], moved[1]),
    facing: kumaScreenFacing(input.projection, direction) ?? state.facing, arrived: units >= want - 1e-9 };
}


export function kumaGap(state: KumaCombatState, player: CityPoint, input: Pick<KumaCombatInput, "contactUnits">): number {
  return Math.hypot(player[0] - state.point[0], player[1] - state.point[1]) - input.contactUnits;
}
