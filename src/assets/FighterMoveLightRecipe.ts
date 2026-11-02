/**
 * 파이터 동작 빛 레시피의 자료 꼴(2026-11-02, docs/kaito-web/fighter-move-fx.md "빛 레시피"): `fighter-move-fx.json`의 `lights`가 이 꼴이다.
 * 그리기는 `render/effects/FighterMoveLight.ts`가 소유한다 — 여기는 카탈로그(`FighterMoveFxArtCatalog`)가 읽는 정의만 둔다.
 */

type V2 = readonly [number, number];

/** Over the bodies or behind both. */
export type FighterMoveLightLayer = "front" | "behind";

/** What every element has: its time (fight ms after the cue started), place, layer and strength. */
export interface FighterMoveLightElementBase {
  /** Fight ms after the cue started that it shows (0). */
  readonly from?: number;
  /** How long it shows (fight ms). */
  readonly ms: number;
  /** [forward, up] body heights from the cue's anchor ([0, 0]). */
  readonly at?: V2;
  /** Over the bodies (the cue's layer) or behind both. */
  readonly layer?: FighterMoveLightLayer;
  /** Its peak opacity (1). */
  readonly alpha?: number;
  /** Kept under reduced motion: its peak as a still, briefly. */
  readonly still?: boolean;
}

/**
 * The line an arc or a sparkle string runs along: the cue's `path` (body heights from his feet; `offset` shifts it, `scale` shrinks it toward
 * its end — the limb's tip), or its own `points` (body heights from the element's place — a claw set, a cut), bowed `bend` body heights to
 * the left of its run (a forward run bows up); or a `circle` round the element's place — radius `r` (growing to `r1` over its time), from
 * `a0` to `a1` degrees (0 forward, 90 up; the head at `a1`), turning `turn` degrees a second (a flip's trail), its height `squash` of its
 * width (a ring lying on the floor; over 1: standing).
 */
export interface FighterMoveLightGeometry {
  readonly circle?: { readonly r: number; readonly r1?: number; readonly a0: number; readonly a1: number; readonly squash?: number;
    readonly turn?: number };
  readonly points?: readonly V2[];
  readonly bend?: number;
  readonly offset?: V2;
  readonly scale?: number;
}

/**
 * A band of light along a line — the crescent of a lash, a claw's streak, a ribbon, a razor cut: thickest `width` at `peak` of its length,
 * thin at both ends. Its head runs out from its tail over `sweepMs` (at most `span` of it lit as it runs), then it shows whole and its tail
 * is cut away toward its head over the last `cutMs`, thinning. `tint` its body and halo, `core` its hot middle line, `rim` a thin line on
 * its outer side (a gold edge); `thin`: halo and core only (a hairline). `copies`: that many side by side, `gap` body heights apart (claws).
 */
export interface FighterMoveLightArc extends FighterMoveLightElementBase, FighterMoveLightGeometry {
  readonly type: "arc";
  readonly width: number;
  readonly peak?: number;
  readonly sweepMs?: number;
  readonly span?: number;
  readonly cutMs: number;
  readonly tint: string;
  readonly core?: string;
  readonly rim?: string;
  readonly thin?: boolean;
  readonly segments?: number;
  readonly copies?: { readonly n: number; readonly gap: number };
}

/**
 * A four-point star `size` body heights across, turned `rot` degrees (spinning `spin` degrees a second), its white heart at `heart` of its
 * strength (0.9 — the kit's; a big one keeps its colour with less); full after `inMs`, then shrinking.
 */
export interface FighterMoveLightFlare extends FighterMoveLightElementBase {
  readonly type: "flare";
  readonly size: number;
  readonly tint: string;
  readonly rot?: number;
  readonly spin?: number;
  readonly inMs?: number;
  readonly heart?: number;
}

/** The contact's white heart, `size` across: only the first `frames` screen frames (1 — the 0th and 1st) after the cue started. */
export interface FighterMoveLightCore extends FighterMoveLightElementBase {
  readonly type: "core";
  readonly size: number;
  readonly frames?: number;
  readonly tint?: string;
}

/**
 * A ring of light from `r0` to `r1` body heights (`squash`: its height's share — lying on the floor; `rot` degrees: a tilted one), rising
 * `rise` body heights, thinning out as it spreads.
 */
export interface FighterMoveLightRing extends FighterMoveLightElementBase {
  readonly type: "ring";
  readonly r0: number;
  readonly r1: number;
  readonly tint: string;
  readonly squash?: number;
  readonly rot?: number;
  readonly rise?: number;
  readonly core?: string;
}

/**
 * `n` rays `length` body heights long round `dir` degrees over `spread` (360: all round), from `inner` out; `inward`: pointing at the place,
 * gathering into it from `inner` (moonlight drawn in). Grown over `inMs`, then they shrink to their roots.
 */
export interface FighterMoveLightRays extends FighterMoveLightElementBase {
  readonly type: "rays";
  readonly n: number;
  readonly length: number;
  readonly width: number;
  readonly tint: string;
  readonly core?: string;
  readonly dir?: number;
  readonly spread?: number;
  readonly inner?: number;
  readonly inward?: boolean;
  readonly inMs?: number;
}

/** `n` small stars flung out `dist` body heights round `dir` over `spread`, each a little later (`stagger` ms), falling `fall`, shrinking away. */
export interface FighterMoveLightGlints extends FighterMoveLightElementBase {
  readonly type: "glints";
  readonly n: number;
  readonly size: number;
  readonly dist: number;
  readonly tint: string;
  readonly accent?: string;
  readonly dir?: number;
  readonly spread?: number;
  readonly fall?: number;
  readonly stagger?: number;
}

/**
 * Small stars along a line (an arc's `Geometry`), popping one after another `stagger` ms apart as the cut runs, each `life` ms: up fast, then
 * shrinking (glints popping along a razor arc).
 */
export interface FighterMoveLightSparkle extends FighterMoveLightElementBase, FighterMoveLightGeometry {
  readonly type: "sparkle";
  readonly n: number;
  readonly size: number;
  readonly tint: string;
  readonly accent?: string;
  readonly stagger: number;
  readonly life: number;
}

/**
 * `n` motes of light round the place within `radius` (its height `squash`), each living `life` ms (`loop`: born again — a held glow), rising
 * `rise` body heights a second and swaying, swirling `swirl` turns a second round it; up and then shrinking. `accent` every third.
 */
export interface FighterMoveLightMotes extends FighterMoveLightElementBase {
  readonly type: "motes";
  readonly n: number;
  readonly size: number;
  readonly radius: number;
  readonly squash?: number;
  readonly rise: number;
  readonly swirl?: number;
  readonly life: number;
  readonly loop?: boolean;
  readonly tint: string;
  readonly accent?: string;
}

/** A soft round glow `size` across (`squash`: flattened), up over `inMs`, then shrinking. */
export interface FighterMoveLightBloom extends FighterMoveLightElementBase {
  readonly type: "bloom";
  readonly size: number;
  readonly tint: string;
  readonly squash?: number;
  readonly inMs?: number;
}

/** `n` low soft puffs rolling out along the floor `spread` body heights (`sides`), growing to `size`, lifting `rise`, thinning away. */
export interface FighterMoveLightMist extends FighterMoveLightElementBase {
  readonly type: "mist";
  readonly n: number;
  readonly size: number;
  readonly spread: number;
  readonly tint: string;
  readonly sides?: "both" | "forward" | "back";
  readonly rise?: number;
}

/** A column of light up from the place, `height` body heights, `width` wide, shooting up fast and thinning away. */
export interface FighterMoveLightColumn extends FighterMoveLightElementBase {
  readonly type: "column";
  readonly height: number;
  readonly width: number;
  readonly tint: string;
  readonly core?: string;
}

/**
 * `n` speed lines `length` long along `dir` degrees (180: behind him), within `band` body heights up or down, sliding `travel` and shrinking;
 * `flicker`: each line's length breathing by that share (a held stream).
 */
export interface FighterMoveLightStreaks extends FighterMoveLightElementBase {
  readonly type: "streaks";
  readonly n: number;
  readonly length: number;
  readonly width: number;
  readonly tint: string;
  readonly core?: string;
  readonly dir?: number;
  readonly band?: number;
  readonly travel?: number;
  readonly flicker?: number;
}

export type FighterMoveLightElement = FighterMoveLightArc | FighterMoveLightFlare | FighterMoveLightCore | FighterMoveLightRing
  | FighterMoveLightRays | FighterMoveLightGlints | FighterMoveLightSparkle | FighterMoveLightMotes | FighterMoveLightBloom
  | FighterMoveLightMist | FighterMoveLightColumn | FighterMoveLightStreaks;

export const FIGHTER_MOVE_LIGHT_TYPES: readonly FighterMoveLightElement["type"][] = Object.freeze(["arc", "flare", "core", "ring", "rays",
  "glints", "sparkle", "motes", "bloom", "mist", "column", "streaks"]);

/** A light recipe: its elements, drawn together. */
export interface FighterMoveLightRecipe {
  readonly elements: readonly FighterMoveLightElement[];
}
