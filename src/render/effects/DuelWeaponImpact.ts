import { PALETTE } from "../art/palette";
import type { DuelWeaponKind } from "../../sim/duel/DuelImpact";
import { cometPoints, ellipsePoints } from "./CombatFxShapes";
import { ROPE_FX_RAMPS } from "./RopeTraversalFx";
import type { FxPrim } from "./FxPrim";
import { duelComicImpactPrims } from "./DuelComicImpact";
import { comicKindOfRank } from "./CombatImpactRecipe";

/** Attack material determines the contact shape, independently of scene and receiver. */
export type DuelWeaponImpactKind = DuelWeaponKind;

export interface DuelWeaponContact {
  readonly x: number; readonly y: number; readonly angle: number; readonly bodyPx: number; readonly scale: number;
  readonly ageMs: number; readonly freezeMs: number; readonly rank: number;
  readonly armored: boolean; readonly guarded: boolean; readonly reduced: boolean;
}

/** Blunt: compressed round core, thick pressure arcs, short round fragments. Sharp: a narrow cutting streak and splinters. */
export function duelWeaponContactPrims(kind: Exclude<DuelWeaponImpactKind, "fist">,
  p: DuelWeaponContact): FxPrim[] {
  if (kind === "blunt" && !p.armored && !p.guarded) return duelComicImpactPrims(comicKindOfRank(p.rank), p);
  const out: FxPrim[] = [], warm = ROPE_FX_RAMPS.warm;
  const tailMs = kind === "blunt" ? 145 : 90, release = Math.max(kind === "blunt" ? 60 : 32, p.freezeMs);
  const u = Math.max(0, p.ageMs - release) / tailMs;
  if (u >= 1) return out;
  const alpha = (1 - u) ** 1.5, snap = 0.86 + 0.14 * Math.min(1, p.ageMs / 20);
  const r = p.bodyPx * (kind === "blunt" ? 0.2 : 0.17) * Math.sqrt(Math.max(0.2, p.scale)) * snap;
  const edge = p.armored ? PALETTE.manorIronEdge : p.guarded ? PALETTE.throwSteel : warm[3]!;
  const hot = p.armored ? PALETTE.throwSteel : p.guarded ? PALETTE.villagePavingPaper : warm[0]!;
  const ink = PALETTE.webtoonInk;
  const transform = (points: number[], angle = p.angle): number[] => {
    const c = Math.cos(angle), s = Math.sin(angle);
    return points.map((v, i) => i % 2 === 0 ? p.x + v * c - points[i + 1]! * s : p.y + points[i - 1]! * s + v * c);
  };
  const poly = (points: number[], color: number, opacity = alpha, angle = p.angle) => {
    if (opacity > 0.004) out.push({ kind: "poly", additive: false, points: transform(points, angle), color, alpha: opacity });
  };
  const oval = (x: number, y: number, rx: number, ry: number, color: number, opacity = alpha) =>
    poly(ellipsePoints(x, y, rx, ry, 24), color, opacity);
  const arc = (rx: number, ry: number, from: number, to: number, width: number, color: number, opacity = alpha) => {
    const points: number[] = [], n = 24;
    for (let i = 0; i <= n; i++) { const a = from + (to - from) * i / n; points.push(Math.cos(a) * rx, Math.sin(a) * ry); }
    for (let i = n; i >= 0; i--) { const a = from + (to - from) * i / n; points.push(Math.cos(a) * (rx - width), Math.sin(a) * (ry - width)); }
    poly(points, color, opacity);
  };
  if (kind === "blunt") {
    // Rounded silhouettes even in the first/frozen frame; no needle star or slash on an iron-ball hit.
    const growth = p.reduced ? 1 : 1 + 0.45 * u;
    for (const [from, to] of [[-1.18, 1.05], [1.9, 2.48], [-2.65, -1.96]]) {
      arc(r * 0.94 * growth, r * 1.22 * growth, from!, to!, r * 0.17, ink, alpha * 0.9);
      arc(r * 0.90 * growth, r * 1.18 * growth, from!, to!, r * 0.09, edge);
    }
    // Uneven rounded lobes read as a compressed burst, rather than a target or a shield icon.
    const crush = (scale: number, color: number) => {
      const points: number[] = [];
      for (let i = 0; i < 64; i++) {
        const a = i * Math.PI / 32, lobe = 1 + 0.15 * Math.cos(7 * a + 0.4) + 0.09 * Math.sin(3 * a);
        points.push(Math.cos(a) * r * 0.62 * lobe * scale, Math.sin(a) * r * 0.82 * lobe * scale);
      }
      poly(points, color);
    };
    if (!p.guarded) {
      crush(1, ink);
      crush(0.87, edge);
      crush(0.69, hot);
    } else {
      // A block reads as two short contact bars, leaving the actual guarding arms visible inside the arcs.
      for (const y of [-.28, .28]) {
        poly(cometPoints(r * .24, r * y, 0, r * .62, r * .11), ink);
        poly(cometPoints(r * .22, r * y, 0, r * .56, r * .05), hot);
      }
    }
    if (!p.reduced) for (let i = 0; i < 3 + Math.min(p.rank, 2); i++) {
      const a = -1.2 + i * 2.4 / (2 + Math.min(p.rank, 2)), travel = r * (1.28 + 1.5 * u);
      const x = Math.cos(a) * travel, y = Math.sin(a) * travel, size = r * (0.13 - 0.055 * u);
      oval(x, y, size * 1.25, size, ink, alpha * 0.8);
      oval(x - size * 0.12, y - size * 0.18, size * 0.82, size * 0.58, edge, alpha * 0.9);
    }
  } else {
    const cutAngle = p.angle - 0.58;
    poly(cometPoints(-r * 0.8, 0, Math.PI, r * (3.6 + u), r * 0.32), ink, alpha, cutAngle);
    poly(cometPoints(-r * 0.75, 0, Math.PI, r * (3.5 + u), r * 0.18), hot, alpha, cutAngle);
    if (!p.reduced) for (let i = 0; i < 3; i++) {
      const a = p.angle + (i - 1) * 0.32, x = r * (0.9 + u * 2), y = (i - 1) * r * 0.3;
      poly(cometPoints(x, y, Math.PI, r * 0.9, r * 0.07), edge, alpha * 0.85, a);
    }
  }
  return out;
}
