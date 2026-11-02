import type { CityPoint } from "../../world/NativeCityDefinition";

/**
 * The side-scroll fight stage's line (plan, 2026-10-11 — one definition for every fight: a challenged fighter's, Otto's fixed arena line,
 * the opening backpedal's): through `origin` along unit `direction`, between `min` and `max` (plan units along it). Both fighters are held
 * on it; its ends are walls. The camera turns so it runs horizontally on screen (`NativeCityFightStageController`).
 */
export interface CityFightStageLine {
  readonly origin: CityPoint;
  readonly direction: CityPoint;
  readonly min: number;
  readonly max: number;
}

/**
 * The stage line from `origin` toward `toward`, clipped to walkable ground (marching `stepUnits` at a time while the point and the segment
 * to it stay walkable) and to `halfUnits` each way. Null when the two points coincide.
 */
export function cityFightStageLine(origin: CityPoint, toward: CityPoint, halfUnits: number, walkable: (point: CityPoint) => boolean,
  segmentWalkable: (from: CityPoint, to: CityPoint) => boolean, stepUnits = 0.5): CityFightStageLine | null {
  const dx = toward[0] - origin[0], dy = toward[1] - origin[1], length = Math.hypot(dx, dy);
  if (!(length > 1e-6)) return null;
  const direction: CityPoint = [dx / length, dy / length], step = Math.max(0.05, stepUnits), limit = Math.max(0, halfUnits);
  const reach = (sign: 1 | -1): number => {
    let t = 0;
    while (t + step <= limit) {
      const from: CityPoint = [origin[0] + direction[0] * t * sign, origin[1] + direction[1] * t * sign];
      const to: CityPoint = [origin[0] + direction[0] * (t + step) * sign, origin[1] + direction[1] * (t + step) * sign];
      if (!walkable(to) || !segmentWalkable(from, to)) break;
      t += step;
    }
    return t;
  };
  return { origin: [origin[0], origin[1]], direction, min: -reach(-1), max: reach(1) };
}

/** `point` snapped onto the stage line, inside its ends. */
export function cityFightStageSnap(line: CityFightStageLine, point: CityPoint): CityPoint {
  const { origin, direction } = line;
  const t = Math.max(line.min, Math.min(line.max, (point[0] - origin[0]) * direction[0] + (point[1] - origin[1]) * direction[1]));
  return [origin[0] + direction[0] * t, origin[1] + direction[1] * t];
}

/**
 * The stage line clipped where a body would not be seen (2026-10-15, 쿠마전 3단계 — a fight pushed to Rosaline's shop front went behind its
 * window and door): from the span the fighters stand on (`keep`, plan units along the line — never cut) out to each end in `stepUnits`
 * steps, it stops before the first point where `visible` fails. Each end stays where it was when all is seen.
 */
export function cityFightStageClip(line: CityFightStageLine, keep: readonly [number, number], visible: (point: CityPoint) => boolean,
  stepUnits = 1): CityFightStageLine {
  const step = Math.max(0.05, stepUnits), at = (t: number): CityPoint => [line.origin[0] + line.direction[0] * t, line.origin[1] + line.direction[1] * t];
  const lo = Math.max(line.min, Math.min(keep[0], keep[1])), hi = Math.min(line.max, Math.max(keep[0], keep[1]));
  const reach = (from: number, end: number, sign: 1 | -1): number => {
    let t = from;
    while (sign * (end - t) > 1e-9) {
      const next = sign > 0 ? Math.min(end, t + step) : Math.max(end, t - step);
      if (!visible(at(next))) break;
      t = next;
    }
    return t;
  };
  return { ...line, min: reach(lo, line.min, -1), max: reach(hi, line.max, 1) };
}

/** The projection's linear part (screen px per plan unit along plan x and y) — all a stage's screen sides need. */
type StageProjection = { readonly x: readonly number[]; readonly y: readonly number[] };

/** The stage line's direction for a left / right press (`dx` −1 / 1): whichever way the line runs on screen under `projection`. */
export function cityFightStageDirection(line: CityFightStageLine, projection: StageProjection, dx: number): CityPoint {
  const [d0, d1] = line.direction;
  const sign = Math.sign(dx) * (projection.x[0]! * d0 + projection.y[0]! * d1 < 0 ? -1 : 1);
  return [d0 * sign, d1 * sign];
}


export function cityFightStageFoeHeading(line: CityFightStageLine, foe: CityPoint | null, point: CityPoint): CityPoint | null {
  if (!foe) return null;
  const [d0, d1] = line.direction, along = (foe[0] - point[0]) * d0 + (foe[1] - point[1]) * d1;
  if (Math.abs(along) < 1e-6) return null;
  const sign = Math.sign(along);
  return [d0 * sign, d1 * sign];
}

/** Which screen side the opponent stands on from `point` (−1 left, 1 right), or null: the double tap's toward (→→) and away (←←). */
export function cityFightStageFoeSide(line: CityFightStageLine, projection: StageProjection, foe: CityPoint | null,
  point: CityPoint): -1 | 1 | null {
  const toward = cityFightStageFoeHeading(line, foe, point);
  if (!toward) return null;
  return projection.x[0]! * toward[0] + projection.y[0]! * toward[1] < 0 ? -1 : 1;
}

/** A step from `point` along `direction` goes away from the opponent on the stage: he backs up facing him (`player.backWalk`). */
export function cityFightStageBackward(line: CityFightStageLine, foe: CityPoint | null, point: CityPoint, direction: CityPoint): boolean {
  const toward = cityFightStageFoeHeading(line, foe, point);
  return toward !== null && toward[0] * direction[0] + toward[1] * direction[1] < -1e-9;
}
