import { PALETTE } from "../art/palette";
import { cometPoints, crescentPoints } from "./CombatFxShapes";
import type { FxPrim } from "./FxPrim";

/** Contact art only. The caller supplies a confirmed hit, projected direction and the real freeze. */
export interface DuelComicContact {
  readonly x: number; readonly y: number; readonly angle: number; readonly bodyPx: number;
  readonly scale: number; readonly ageMs: number; readonly freezeMs: number;
  readonly reduced: boolean; readonly seed?: number;
  readonly directional?: boolean;
}

/** Screen milliseconds: ink can hold with the bodies; emission always clears first. */
export const DUEL_COMIC_IMPACT = Object.freeze({
  strike: { radius: .14, holdMs: 28, fadeMs: 64, lightMs: 32, debrisMs: 116 },
  heavy: { radius: .20, holdMs: 48, fadeMs: 90, lightMs: 36, debrisMs: 220 },
  crash: { radius: .25, holdMs: 48, fadeMs: 100, lightMs: 40, debrisMs: 260 },
  finisher: { radius: .29, holdMs: 64, fadeMs: 120, lightMs: 40, debrisMs: 320 },
});

/** Uneven painted silhouette, black cuts, a fine flare, then separated ballistic chips. No engine state. */
export function duelComicImpactPrims(kind: keyof typeof DUEL_COMIC_IMPACT, p: DuelComicContact): FxPrim[] {
  const t = DUEL_COMIC_IMPACT[kind], out: FxPrim[] = [], crash = kind !== "strike";
  if (!Number.isFinite(p.ageMs) || p.ageMs < 0 || p.bodyPx <= 0) return out;
  // Jabs must clear before the next contact. Only a crash holds its contour through the freeze.
  const hold = crash ? Math.max(t.holdMs, p.freezeMs) : t.holdMs;
  const release = Math.max(0, p.ageMs - hold), fade = Math.max(0, 1 - release / t.fadeMs);
  const debrisAge = crash ? Math.max(0, p.ageMs - p.freezeMs) : p.ageMs;
  if (fade === 0 && (p.reduced || debrisAge >= t.debrisMs)) return out;
  const r = p.bodyPx * t.radius * Math.sqrt(Math.max(.2, p.scale));
  const c = Math.cos(p.angle), s = Math.sin(p.angle), side = c < 0 ? -1 : 1;
  const ink = PALETTE.webtoonInk, yellow = PALETTE.combatNeonYellow, orange = PALETTE.combatNeonOrange;
  const hot = PALETTE.hotGold;
  const transform = (points: number[]) => points.map((v, i) => i % 2 === 0
    ? p.x + v * c - points[i + 1]! * s * side
    : p.y + points[i - 1]! * s + v * c * side);
  const poly = (points: number[], color: number, alpha = fade) => {
    if (alpha > .004) out.push({ kind: "poly", points: transform(points), color, alpha, additive: false });
  };
  const rand = (i: number) => {
    const v = Math.sin(i * 127.1 + (p.seed ?? 7) * 31.7) * 43758.5453;
    return v - Math.floor(v);
  };
  const burst = (size: number, color: number) => {
    const points: number[] = [], count = crash ? 11 : 7;
    for (let i = 0; i < count * 4; i++) {
      const tooth = Math.floor(i / 4), phase = i % 4, a = i / (count * 4) * Math.PI * 2;
      const tip = .8 + rand(tooth) * .5;
      const length = phase === 1 ? tip : phase === 2 ? .50 : phase === 3 ? .34 : .43;
      points.push(Math.cos(a) * r * length * size * 1.2, Math.sin(a) * r * length * size);
    }
    poly(points, color);
  };

  // Offset broken orange pressure arcs keep a transparent centre around the receiver.
  if (crash && !p.reduced && debrisAge < t.debrisMs) {
    const u = debrisAge / t.debrisMs, radius = r * (1.15 + .75 * (1 - (1 - u) ** 3));
    for (const [from, to] of [[-.95, .75], [1.3, 2.1], [2.8, 3.85]]) {
      poly(crescentPoints(0, 0, radius * .76, radius, from!, to!, r * .13 * (1 - u), 24, .35), ink, .85 * (1 - u));
      poly(crescentPoints(0, 0, radius * .74, radius * .98, from!, to!, r * .07 * (1 - u), 24, .35), orange, 1 - u);
    }
  }
  if (fade > 0) {
    // A single direction-bearing flare, with a much shorter back ray. No full-screen white panel.
    if (!p.reduced && p.directional !== false) {
      for (const [length, width, color] of [[3.6, .105, ink], [3.5, .048, hot]] as const) {
        poly(cometPoints(-r * .65, r * .06, Math.PI, r * length, r * width), color);
      }
    }
    burst(1.08, ink);
    burst(.94, orange);
    burst(.79, yellow);
    burst(.42, kind === "finisher" && p.ageMs < t.lightMs ? PALETTE.combatNeonCore : hot);
    // Black brush wedges live INSIDE the bright face, rather than only around its perimeter.
    const cut = (x: number, y: number, length: number, width: number, a: number) =>
      poly(cometPoints(x * r, y * r, a, length * r, width * r), ink);
    cut(.43, -.36, .82, .085, -.66);
    cut(-.14, .38, .59, .064, 2.48);
    if (crash) cut(.62, .27, .66, .055, .20);
    // Reduced motion keeps a still, readable silhouette and omits emission and flying debris.
    const light = 1 - p.ageMs / t.lightMs;
    if (!p.reduced && light > 0) out.push({ kind: "light", x: p.x, y: p.y,
      radius: r * 1.12, squash: .72, color: hot, alpha: .30 * light * light });
  }
  if (p.reduced || debrisAge >= t.debrisMs) return out;
  const u = debrisAge / t.debrisMs, count = kind === "finisher" ? 12 : kind === "crash" ? 8 : kind === "heavy" ? 6 : 4;
  for (let i = 0; i < count; i++) {
    const a = p.directional === false ? i / count * Math.PI * 2 : -.95 + i / (count - 1) * 1.9;
    const speed = .8 + rand(i + 20) * .6;
    const distance = r * (.65 + u * (crash ? 3.4 : 2.8) * speed);
    const x = Math.cos(a) * distance, y = Math.sin(a) * distance + (crash ? r * u * u * 1.5 : 0);
    const alpha = (1 - u) ** 1.5, size = r * (crash ? .14 : .075) * (1 - u * .55);
    // Alternating pointed sparks and bevelled chips; each lane keeps its identity as others fade.
    if (i % 2 === 0) {
      poly(cometPoints(x, y, a, r * (.55 + .4 * u), size * .65), ink, alpha);
      poly(cometPoints(x, y, a, r * (.51 + .4 * u), size * .27), hot, alpha);
    } else {
      const chip = (k: number, color: number) => {
        const points: number[] = [], spin = a + u * (i % 3 - 1) * 2;
        for (const [px, py] of [[-1, -.25], [-.7, -.6], [.5, -.44], [1, -.1], [.55, .5], [-.5, .7], [-.8, .4], [-1, .1]]) {
          points.push(x + (px! * Math.cos(spin) - py! * Math.sin(spin)) * size * k,
            y + (px! * Math.sin(spin) + py! * Math.cos(spin)) * size * k);
        }
        poly(points, color, alpha);
      };
      chip(1.3, ink); chip(.83, orange);
    }
  }
  return out;
}
