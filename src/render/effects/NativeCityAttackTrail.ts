import { PALETTE } from "../art/palette";
import { cometPoints, ribbonPoints } from "./CombatFxShapes";
import type { FxPrim } from "./FxPrim";
import type { NativeCityWeaponImpactKind } from "./NativeCityWeaponImpact";

type Tip = readonly [number, number];
export interface NativeCityTrailStroke {
  readonly releaseMs: number;
  readonly hitMs: number;
  /** Authored weapon-tip path in body heights: +x faces the blow, y is relative to the feet. */
  readonly path: readonly Tip[];
  readonly kind: NativeCityWeaponImpactKind;
  readonly width?: number;
  /** A drawn ribbon stays thin even when its physical contact counts as blunt. */
  readonly ribbon?: boolean;
}
export interface NativeCityAttackTrailFrame {
  /** Logical feet anchor; persistent release tails reproject this as the fight camera moves. */
  readonly ground?: readonly [number, number];
  readonly actorId?: string;
  readonly attackId?: number;
  readonly technique?: string;
  readonly x: number;
  readonly y: number;
  readonly bodyPx: number;
  readonly side: -1 | 1;
  readonly timeMs: number;
  readonly strokes: readonly NativeCityTrailStroke[];
}

/** Catmull-Rom through authored tip landmarks. The ribbon head ends exactly on the contact landmark. */
export function nativeCityTrailTipAt(path: readonly Tip[], u: number): Tip {
  if (path.length < 2) return path[0] ?? [0, 0];
  const t = Math.max(0, Math.min(1, u)) * (path.length - 1), i = Math.min(path.length - 2, Math.floor(t)), f = t - i;
  const a = path[Math.max(0, i - 1)]!, b = path[i]!, c = path[i + 1]!, d = path[Math.min(path.length - 1, i + 2)]!;
  const at = (j: 0 | 1) => .5 * ((2 * b[j]) + (-a[j] + c[j]) * f
    + (2 * a[j] - 5 * b[j] + 4 * c[j] - d[j]) * f * f + (-a[j] + 3 * b[j] - 3 * c[j] + d[j]) * f ** 3);
  return [at(0), at(1)];
}


export const nativeCityTrailLifeMs = (_s: NativeCityTrailStroke): number => 33;

/** The ribbon head accelerates into the contact: its path share is the stroke's time share to this power (the drawn swing leads slowly). */
export const NATIVE_CITY_TRAIL_HEAD_EASE = 2.2;

/** A swept ribbon, not a flash: accelerates into contact, holds on the shared clock, then erases from the tail. */
export function nativeCityAttackTrailPrims(frame: NativeCityAttackTrailFrame | null): FxPrim[] {
  if (!frame) return [];
  const out: FxPrim[] = [];
  for (const s of frame.strokes) {
    const since = frame.timeMs - s.releaseMs, after = frame.timeMs - s.hitMs;
    const life = nativeCityTrailLifeMs(s);
    if (since <= 0 || after >= life || s.path.length < 2) continue;
    const head = Math.min(1, since / Math.max(1, s.hitMs - s.releaseMs)) ** NATIVE_CITY_TRAIL_HEAD_EASE;
    const tail = Math.max(0, after - 18) / (life - 18), fade = (1 - Math.max(0, after) / life) ** .7;
    const spine: number[] = [];
    for (let n = 0; n <= 24; n++) {
      const [x, y] = nativeCityTrailTipAt(s.path, tail + (head - tail) * n / 24);
      spine.push(frame.x + frame.side * x * frame.bodyPx, frame.y + y * frame.bodyPx);
    }
    const width = frame.bodyPx * (s.width ?? (s.ribbon ? .045 : s.kind === "blunt" ? .115 : s.kind === "sharp" ? .038 : .06));
    const edge = s.kind === "sharp" ? PALETTE.pearl : PALETTE.combatNeonOrange;
    // Strong colour planes survive the pale ground; the narrow core never replaces the ink silhouette.
    for (const [scale, color, alpha] of [[1.22, PALETTE.webtoonInk, .85], [1, edge, .96], [.52, PALETTE.combatNeonYellow, 1], [.14, PALETTE.combatNeonCore, .95]] as const) {
      out.push({ kind: "poly", additive: false, points: ribbonPoints(spine, u => width * scale * Math.sin(Math.PI * u) ** .8 * fade), color, alpha: alpha * fade });
    }
    // A few detached, curved chips carry the tail. Their spacing leaves the body silhouette clear.
    for (let i = 0; i < 3; i++) {
      const u = .22 + i * .26;
      if (u > head || u < tail) continue;
      const [px, py] = nativeCityTrailTipAt(s.path, u), drift = Math.max(0, after) / life;
      const [nx, ny] = nativeCityTrailTipAt(s.path, Math.min(1, u + .04));
      const a = Math.atan2(ny - py, frame.side * (nx - px));
      const x = frame.x + frame.side * px * frame.bodyPx;
      const y = frame.y + (py + (i % 2 ? 1 : -1) * (.028 + drift * .08)) * frame.bodyPx;
      const length = frame.bodyPx * .065 * fade, w = frame.bodyPx * .014 * fade;
      out.push({ kind: "poly", additive: false, points: cometPoints(x, y, a, length, w * 1.4), color: PALETTE.webtoonInk, alpha: .75 * fade });
      out.push({ kind: "poly", additive: false, points: cometPoints(x, y, a, length * .87, w), color: PALETTE.combatNeonYellow, alpha: fade });
    }
  }
  return out;
}

/** Side iron-ball atlas landmarks, measured from its (392.625,556.375) root at body 400.
 * Only the pack's named ball moves opt in; a different opponent's fist never inherits this path. */
export function nativeCityIronBallStrokes(move: string, hits: readonly number[]): NativeCityTrailStroke[] {
  const ready: Tip = [-.49, -.96], overhead: Tip = [.414, -1.088], front: Tip = [.854, -.586];
  const stroke = (hitMs: number, path: readonly Tip[], lead = 85): NativeCityTrailStroke => ({ releaseMs: hitMs - lead, hitMs, path, kind: "blunt" });
  if (move === "ballSmash") return hits.map(h => stroke(h, [ready, overhead, [.65, -.67], [.30, -.126]], 70));
  if (move === "rollRise") return hits.map(h => stroke(h, [[.2, -.2], [.68, -.23], front], 60));
  if (move !== "ballSwing" && move !== "ballCombo") return [];
  return hits.flatMap((h, i) => i === 0 ? [stroke(h, [ready, overhead, front])]
    : i === 1 ? [stroke(h, [[.46, -.206], [.92, -.39], [.812, -.661]], 44)]
      : i === 3 ? [stroke(h, [[.8, -.65], [.15, -.3], [-.7, -.58], [-.55, -1.05]], 55)] : []);
}
