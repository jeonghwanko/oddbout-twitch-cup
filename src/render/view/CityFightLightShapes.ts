import { clamp01 } from "../../sim/geom";

/**
 * The light kit's shapes without Phaser (2026-11-02 — taken out of `CityFightLightKit` so the move-light review sheets bake the very same
 * textures in node, `tools/fx/fighter-move-light-sheet.mjs`): each kind's size and the alpha of its pixels. The kit bakes them into canvas
 * textures once per scene (white, alpha only — tinted where drawn).
 */
export type CityFightLightKind = "ray" | "streak" | "flare" | "puff" | "ring" | "cone";

/** Each kind's texture size (px). */
export const CITY_FIGHT_LIGHT_SIZE: Readonly<Record<CityFightLightKind, readonly [number, number]>> = Object.freeze({
  ray: [256, 32], streak: [256, 32], flare: [128, 128], puff: [128, 128], ring: [256, 256], cone: [256, 128],
});

/** One arm of the flare: bright at the middle, thin, fading along its length. */
function arm(along: number, across: number, reach: number): number {
  const t = Math.min(1, Math.abs(along) / reach);
  return (1 - t) ** 2.4 * Math.exp(-((across / (0.02 + 0.045 * (1 - t))) ** 2));
}

/** The alpha (0..1) of pixel (`x`, `y`) of the `kind` texture (`CITY_FIGHT_LIGHT_SIZE`). */
export function cityFightLightAlpha(kind: CityFightLightKind, x: number, y: number): number {
  const [w, h] = CITY_FIGHT_LIGHT_SIZE[kind];
  const u = (x + 0.5) / w * 2 - 1, v = (y + 0.5) / h * 2 - 1;
  let a: number;
  if (kind === "flare") {
    const du = (u + v) / Math.SQRT2, dv = (u - v) / Math.SQRT2;
    a = arm(u, v, 1) + arm(v, u, 1) + 0.4 * (arm(du, dv, 0.55) + arm(dv, du, 0.55)) + Math.exp(-(u * u + v * v) / 0.01);
  } else if (kind === "puff") {
    const r = Math.hypot(u, v);
    a = r >= 1 ? 0 : r < 0.45 ? 1 - 0.25 * r / 0.45 : 0.75 * (1 - (r - 0.45) / 0.55);
  } else if (kind === "ring") {
    // A thin bright band at 0.86 of the radius, a soft halo either side, a faint fill inside.
    const r = Math.hypot(u, v), band = Math.exp(-(((r - 0.86) / 0.035) ** 2)), halo = 0.35 * Math.exp(-(((r - 0.84) / 0.11) ** 2));
    a = r > 1 ? 0 : band + halo + 0.05 * clamp01(r / 0.86) ** 3;
  } else if (kind === "cone") {
    // Narrow and bright at its root, widening along, fading out toward its far end; its edges soft.
    const t = (x + 0.5) / w, spread = 0.06 + 0.94 * t;
    a = (1 - t) ** 0.7 * Math.exp(-((v / spread) ** 2) * 2.2) * (0.35 + 0.65 * Math.min(1, t * 6));
  } else {
    const t = (x + 0.5) / w;
    const along = kind === "ray" ? (1 - t) ** 1.3 : Math.sin(Math.PI * t) ** 1.4, thick = kind === "ray" ? 0.6 - 0.45 * t : 0.55;
    a = along * Math.exp(-((v / thick) ** 2) * 2.5);
  }
  return clamp01(a);
}
