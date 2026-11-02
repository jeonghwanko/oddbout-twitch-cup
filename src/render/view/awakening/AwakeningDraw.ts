import type Phaser from "phaser";
import { clamp01 } from "../../../sim/geom";
import type { CityFightFollowUpBeatKind } from "../../../sim/cityFight/CityFightAwakening";
import type { CityFightAwakeningMark, CityFightAwakeningShot } from "../CityFightAwakeningMotifView";

/**
 * 각성기 모티프들이 함께 쓰는 순수 도형·시간 도우미(2026-10-23). 모양의 뜻(곰 발톱, 마법진…)은 모티프가, 여기는 그리기 문법만 갖는다:
 * 정해진 난수, 시간 곡선, 별·쐐기·리본·충격선, 박자 찾기.
 */

/** A deterministic 0..1 per piece (`i`) and use (`salt`) — a sine hash, so neighbouring pieces do not line up. */
export const jitter = (i: number, salt: number): number => {
  const v = Math.sin(i * 12.9898 + salt * 78.233 + i * salt * 0.0137) * 43758.5453;
  return v - Math.floor(v);
};

/** 0 → 1 → 0 over k in 0..1 (a sine bell). */
export const bell = (k: number): number => Math.sin(Math.PI * clamp01(k));

/** k in 0..1 of `ms` over `span` (clamped). */
export const over = (ms: number, span: number): number => clamp01(ms / Math.max(1, span));

/** A life curve: in over `inMs`, held, out over `outMs` before `lifeMs` ends (0 outside). */
export function life(ms: number, lifeMs: number, inMs: number, outMs: number): number {
  if (ms < 0 || ms > lifeMs) return 0;
  return Math.min(inMs > 0 ? clamp01(ms / inMs) : 1, outMs > 0 ? clamp01((lifeMs - ms) / outMs) : 1);
}

/** The marks of one kind (in order). */
export function marksOf(shot: CityFightAwakeningShot, kind: CityFightFollowUpBeatKind): readonly CityFightAwakeningMark[] {
  return shot.marks.filter(mark => mark.kind === kind);
}

/** The first mark of `kind`, or null. */
export function markOf(shot: CityFightAwakeningShot, kind: CityFightFollowUpBeatKind, nth = 0): CityFightAwakeningMark | null {
  return shot.marks.find(mark => mark.kind === kind && mark.nth === nth) ?? null;
}

/** The latest mark (any kind), or null. */
export function lastMark(shot: CityFightAwakeningShot): CityFightAwakeningMark | null {
  return shot.marks[shot.marks.length - 1] ?? null;
}

/** The points of a star polygon (`points` tips) round (x, y): `outer` / `inner` radii, turned `rotation`, squashed `squash` in y. */
export function starPoints(x: number, y: number, points: number, outer: number, inner: number, rotation = 0, squash = 1): Phaser.Types.Math.Vector2Like[] {
  const out: Phaser.Types.Math.Vector2Like[] = [];
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner, a = rotation - Math.PI / 2 + i * Math.PI / points;
    out.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r * squash });
  }
  return out;
}

/** A tapered wedge from `r0` to `r1` out of (x, y) along `angle`: `w0` wide at its root, `w1` at its tip. */
export function wedge(g: Phaser.GameObjects.Graphics, x: number, y: number, angle: number, r0: number, r1: number, w0: number, w1: number,
  color: number, alpha: number): void {
  if (!(alpha > 0.003) || r1 <= r0) return;
  const c = Math.cos(angle), s = Math.sin(angle), nx = -s, ny = c;
  g.fillStyle(color, Math.min(1, alpha)).fillPoints([
    { x: x + c * r0 + nx * w0 / 2, y: y + s * r0 + ny * w0 / 2 }, { x: x + c * r1 + nx * w1 / 2, y: y + s * r1 + ny * w1 / 2 },
    { x: x + c * r1 - nx * w1 / 2, y: y + s * r1 - ny * w1 / 2 }, { x: x + c * r0 - nx * w0 / 2, y: y + s * r0 - ny * w0 / 2 },
  ], true);
}

/** Impact lines: `count` thin wedges round (x, y) from `r0` to `r1`, `width` at their root, turned by `salt` (each a little different). */
export function burst(g: Phaser.GameObjects.Graphics, x: number, y: number, count: number, r0: number, r1: number, width: number, color: number,
  alpha: number, salt = 0, squash = 1): void {
  if (!(alpha > 0.003)) return;
  for (let i = 0; i < count; i++) {
    const a = (i + jitter(i, salt) * 0.6) / count * Math.PI * 2, reach = r0 + (r1 - r0) * (0.6 + 0.4 * jitter(i, salt + 1));
    const c = Math.cos(a), s = Math.sin(a) * squash;
    const len = Math.hypot(c, s), ux = c / len, uy = s / len;
    wedge(g, x + ux * r0 * len, y + uy * r0 * len, Math.atan2(uy, ux), 0, (reach - r0) * len, width, 0, color, alpha);
  }
}

/** A ribbon along `points` (world px), `width(t)` wide at t in 0..1 along it, one colour. */
export function ribbon(g: Phaser.GameObjects.Graphics, points: readonly Phaser.Types.Math.Vector2Like[], width: (t: number) => number,
  color: number, alpha: number): void {
  if (points.length < 2 || !(alpha > 0.003)) return;
  const left: Phaser.Types.Math.Vector2Like[] = [], right: Phaser.Types.Math.Vector2Like[] = [];
  points.forEach((p, i) => {
    const a = points[Math.max(0, i - 1)]!, b = points[Math.min(points.length - 1, i + 1)]!;
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1, w = width(i / (points.length - 1)) / 2;
    left.push({ x: p.x - dy / len * w, y: p.y + dx / len * w });
    right.push({ x: p.x + dy / len * w, y: p.y - dx / len * w });
  });
  g.fillStyle(color, Math.min(1, alpha)).fillPoints([...left, ...right.reverse()], true);
}

/** An ellipse outline `width` thick (several strokes — Phaser strokes one line). */
export function ellipseRing(g: Phaser.GameObjects.Graphics, x: number, y: number, rx: number, ry: number, width: number, color: number, alpha: number): void {
  if (!(alpha > 0.003) || rx <= 0 || ry <= 0) return;
  g.lineStyle(width, color, Math.min(1, alpha)).strokeEllipse(x, y, rx * 2, ry * 2);
}

/** A petal (a teardrop) `length` long and `width` wide from its base (x, y) along `angle`. */
export function petalPoints(x: number, y: number, length: number, width: number, angle: number): Phaser.Types.Math.Vector2Like[] {
  const c = Math.cos(angle), s = Math.sin(angle), out: Phaser.Types.Math.Vector2Like[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10, along = t * length, across = Math.sin(Math.PI * t) ** 0.8 * (1 - 0.35 * t) * width / 2;
    out.push({ x: x + c * along - s * across, y: y + s * along + c * across });
  }
  for (let i = 9; i >= 1; i--) {
    const t = i / 10, along = t * length, across = -(Math.sin(Math.PI * t) ** 0.8) * (1 - 0.35 * t) * width / 2;
    out.push({ x: x + c * along - s * across, y: y + s * along + c * across });
  }
  return out;
}

/** Points along a quadratic curve from a through control b to c, `k` of the way. */
export function curve(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, k = 1, steps = 16): Phaser.Types.Math.Vector2Like[] {
  const out: Phaser.Types.Math.Vector2Like[] = [], n = Math.max(2, Math.round(steps * clamp01(k)));
  for (let i = 0; i <= n; i++) {
    const t = i / n * clamp01(k), u = 1 - t;
    out.push({ x: u * u * ax + 2 * u * t * bx + t * t * cx, y: u * u * ay + 2 * u * t * by + t * t * cy });
  }
  return out;
}

/** A jagged bolt from (ax, ay) to (bx, by): `segments` kinks `jag` wide, re-cut every `salt`. */
export function bolt(ax: number, ay: number, bx: number, by: number, segments: number, jag: number, salt: number): Phaser.Types.Math.Vector2Like[] {
  const out: Phaser.Types.Math.Vector2Like[] = [{ x: ax, y: ay }], dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
  for (let i = 1; i < segments; i++) {
    const t = i / segments, off = (jitter(i, salt) - 0.5) * 2 * jag;
    out.push({ x: ax + dx * t + nx * off, y: ay + dy * t + ny * off });
  }
  out.push({ x: bx, y: by });
  return out;
}
