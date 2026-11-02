import { clamp01 } from '../../sim/geom';
import { PALETTE } from '../art/palette';
import { WIRE_NET_CEL_ANCHORS, type WireNetCel } from '../../assets/WireNetArtCatalog';
import { ribbonPoints, sampleSpine, sparklePoints } from './CombatFxShapes';
import type { FxPrim } from './FxPrim';


export interface NativeCityWireNetFrame {
  /** The glove the cord runs from (the drawn step's hand, `keys.wireNet.emitters`). */
  readonly from: readonly [number, number];
  /** Where the net flies and wraps: the netted body's middle; on a miss, the swing's reach. */
  readonly to: readonly [number, number];

  readonly bodyPx: number;

  readonly netPx: number;
  /** +1: thrown toward image-right; −1: toward image-left (the cels are mirrored). */
  readonly side: 1 | -1;
  readonly timeMs: number;
  /** The cast leaves his hand (`keys.wireNet.throwMs`): the bundle flies from here to the first contact. */
  readonly throwMs: number;
  readonly hitsMs: readonly number[];
  readonly endMs: number;
  /** A judged contact landed on a body this swing; false — a miss: the net opens at reach and drops. */
  readonly caught: boolean;
  /** The fight ms the netted body slipped out (jumped or dashed away): the net tears there. */
  readonly slippedMs?: number;
  /**
   * Screen ms since the first contact landed (caught only). The contact's freeze holds `timeMs` on the contact; the burst and the opening
   * run on whichever clock is further along, so the net bursts open ON the hit and holds open through the freeze (2026-10-17, user:
   * "타격을 했고, 이펙트가 터지고, 인과 관계가 잘 보여야" — it used to wait out the freeze bundled and open 0.28 s after the hit).
   */
  readonly contactScreenMs?: number;
  readonly reducedMotion: boolean;
}

/** The drawn cel this frame (the sprite's centre on the net's, `WIRE_NET_CEL_ANCHORS`) and the code-drawn cord and glints over it. */
export interface NativeCityWireNetDraw {
  readonly cel: { readonly name: WireNetCel; readonly x: number; readonly y: number; readonly width: number; readonly flipX: boolean;
    readonly alpha: number } | null;
  readonly prims: FxPrim[];
}

/**
 * The beats (fight ms). 2026-10-17 (user: "거미줄 공격은 초등학생 게임 같다"; vfx-artist / game-animator review of the realtime film): the
 * old net was a black line funnel sprayed from his palm, unrolled in two frames, held still and gone in 15 ms, under a blade's crescent.
 * Now a cast net: the bundle flies (`throwMs` → first contact), bursts, opens, wraps the body, cinches on each later contact (a squeeze
 * and glints), tears `tearAfterMs` after the last contact and its fragments fall — or, on a miss, opens at reach and drops.
 */
export const WIRE_NET_FX = Object.freeze({
  /** The cel's width, in the net's body heights (the open net spans about 0.8 of it, the wrap about 0.65). */
  celWidth: 1.0,
  burstMs: 33, openMs: 57,
  /** Each later contact squeezes the wrap to `cinchScale` for `cinchMs`; it then holds `heldStep` smaller per cinch done. */
  cinchScale: .86, cinchMs: 40, heldStep: .05,
  tearAfterMs: 60, tearMs: 50, fallMs: 60, fallBodies: .25,
  /** A miss: the open net sinks this many body heights and fades over `missMs`. */
  missMs: 140, missSinkBodies: .35,

  cordInk: .014, cordCore: .006, slackSag: .06, reelMs: 70,
  glint: { count: 3, size: .05, lifeMs: 33, light: .15, lightAlpha: .35 },
});

const T = WIRE_NET_FX;
const ANCHOR = WIRE_NET_CEL_ANCHORS;

/** The cel, its place and its cord this frame; none before the cast and after the last fragment. */
export function nativeCityWireNetDraw(f: NativeCityWireNetFrame | null): NativeCityWireNetDraw {
  if (!f || f.timeMs < f.throwMs || f.timeMs >= f.endMs) return { cel: null, prims: [] };
  const t = f.timeMs, first = f.hitsMs[0] ?? f.throwMs + 85, last = f.hitsMs.at(-1) ?? first;
  const W = f.netPx * T.celWidth, prims: FxPrim[] = [];
  // A glint at the glove as the cast leaves it.
  if (!f.reducedMotion && t < f.throwMs + T.glint.lifeMs) glint(prims, f.from[0], f.from[1], f.bodyPx * T.glint.size, 0);
  if (t < first) {
    // The bundle flies, decelerating, its cord paying out behind it (reduced motion: nothing until it lands).
    if (f.reducedMotion) return { cel: null, prims: [] };
    const u = clamp01((t - f.throwMs) / Math.max(1, first - f.throwMs)), e = 1 - (1 - u) ** 2;
    const x = f.from[0] + (f.to[0] - f.from[0]) * e, y = f.from[1] + (f.to[1] - f.from[1]) * e;
    const cel = place("bundle", x, y, W, f.side, 1);
    cord(prims, f, attach(cel, f.side), T.slackSag * .5);
    return { cel, prims };
  }
  if (!f.caught) {
    // A miss: it opens at reach, then sinks and fades; the cord goes slack and reels in.
    const u = clamp01((t - first - T.burstMs) / T.missMs);
    if (t >= first + T.burstMs + T.missMs) return { cel: null, prims: [] };
    const name: WireNetCel = t < first + T.burstMs ? "burst" : "open", scale = 1 - .15 * u;
    const cel = place(name, f.to[0], f.to[1] + f.netPx * T.missSinkBodies * u * u, W * scale, f.side, u < .6 ? 1 : 1 - (u - .6) / .4);
    reel(prims, f, attach(cel, f.side), clamp01((t - first - T.burstMs) / T.reelMs), T.slackSag * 2);
    return { cel, prims };
  }
  const tearAt = Math.min(last + T.tearAfterMs, f.slippedMs ?? Number.POSITIVE_INFINITY);
  if (t >= tearAt) {
    // The tear, then the fragments falling; the torn cord reels back into the glove.
    const into = t - tearAt;
    if (into >= T.tearMs + T.fallMs) return { cel: null, prims: [] };
    const falling = into >= T.tearMs, u = falling ? (into - T.tearMs) / T.fallMs : 0;
    const cel = place(falling ? "fragments" : "tear", f.to[0], f.to[1] + f.netPx * T.fallBodies * u * u, W * (1 - T.heldStep), f.side,
      falling && u > .5 ? 1 - (u - .5) / .5 : 1);
    if (into < T.reelMs) reel(prims, f, attachFor("tear", f.to[0], f.to[1], W * (1 - T.heldStep), f.side), into / T.reelMs, T.slackSag);
    return { cel, prims };
  }
  if (f.reducedMotion) {
    // Reduced motion: the wrap stands still from the first contact to the tear; the cord straight.
    const cel = place("wrapped", f.to[0], f.to[1], W, f.side, 1);
    cord(prims, f, attach(cel, f.side), 0);
    return { cel, prims };
  }
  const since = Math.max(t - first, f.contactScreenMs ?? 0);
  if (since < T.burstMs + T.openMs && t < first + T.burstMs + T.openMs) {
    const name: WireNetCel = since < T.burstMs ? "burst" : "open";
    const cel = place(name, f.to[0], f.to[1], W * (name === "burst" ? 1.08 : 1), f.side, 1);
    cord(prims, f, attach(cel, f.side), 0);
    if (since < T.glint.lifeMs) cinchGlints(prims, f, W, 0);
    return { cel, prims };
  }
  // The wrap: each later contact squeezes it, then it holds a little tighter; the cord is taut at a contact and slack between.
  const later = f.hitsMs.slice(1), done = later.filter(h => t >= h).length, recent = later.find(h => t >= h && t < h + T.cinchMs);
  const scale = recent !== undefined ? T.cinchScale : 1 - T.heldStep * done;
  const cel = place("wrapped", f.to[0], f.to[1], W * scale, f.side, 1);
  const taut = recent !== undefined || later.some(h => t < h && h - t < 30);
  cord(prims, f, attach(cel, f.side), taut ? 0 : T.slackSag);
  const cinch = later.findIndex(h => t >= h && t < h + T.glint.lifeMs);
  if (cinch >= 0) cinchGlints(prims, f, W * scale, cinch + 1);
  return { cel, prims };
}

type Cel = NonNullable<NativeCityWireNetDraw["cel"]>;

/** A cel with its net centre on (x, y), `width` wide, mirrored for a throw to the left. */
function place(name: WireNetCel, x: number, y: number, width: number, side: 1 | -1, alpha: number): Cel {
  return { name, x, y, width, flipX: side < 0, alpha: clamp01(alpha) };
}

/** Where the cel's leash leaves its edge facing the glove (world px). */
function attach(cel: Cel, side: 1 | -1): readonly [number, number] { return attachFor(cel.name, cel.x, cel.y, cel.width, side); }
function attachFor(name: WireNetCel, x: number, y: number, width: number, side: 1 | -1): readonly [number, number] {
  const a = ANCHOR[name], leash = a.leash ?? a.centre[1];
  return [x - side * a.centre[0] * width, y + (leash - a.centre[1]) * width];
}

/** The cord from the glove to `end`: navy ink under a cream core, sagging `sag` body heights in the middle. */
function cord(out: FxPrim[], f: NativeCityWireNetFrame, end: readonly [number, number], sag: number): void {
  const [x0, y0] = f.from, [x1, y1] = end, drop = sag * f.bodyPx;
  const spine = sampleSpine(14, s => [x0 + (x1 - x0) * s, y0 + (y1 - y0) * s + 4 * drop * s * (1 - s)]);
  out.push({ kind: "poly", additive: false, points: ribbonPoints(spine, () => f.bodyPx * T.cordInk), color: PALETTE.navyInk, alpha: .95 });
  out.push({ kind: "poly", additive: false, points: ribbonPoints(spine, () => f.bodyPx * T.cordCore), color: PALETTE.fxWarmCream, alpha: 1 });
}

/** The cord reeling back: its far end runs from `end` to the glove as `u` goes 0 → 1, going limp. */
function reel(out: FxPrim[], f: NativeCityWireNetFrame, end: readonly [number, number], u: number, sag: number): void {
  if (u >= 1) return;
  const e = u * u, tip: [number, number] = [end[0] + (f.from[0] - end[0]) * e, end[1] + (f.from[1] - end[1]) * e];
  cord(out, f, tip, sag * (1 - e));
}

/** The cinch: a short gold light at the net's middle and glints on its rim (`seed`: which cinch — they land in different places). */
function cinchGlints(out: FxPrim[], f: NativeCityWireNetFrame, width: number, seed: number): void {
  const g = T.glint, [x, y] = f.to;
  out.push({ kind: "light", x, y, radius: f.netPx * g.light, color: PALETTE.fxWarmGold, alpha: g.lightAlpha });
  for (let i = 0; i < g.count; i++) {
    const a = seed * 1.7 + i * 2.1, gx = x + Math.cos(a) * width * .3, gy = y + Math.sin(a) * width * .28;
    glint(out, gx, gy, f.netPx * g.size, a);
  }
}

/** A four-pointed glint: a navy rim under a cream star. */
function glint(out: FxPrim[], x: number, y: number, size: number, angle: number): void {
  out.push({ kind: "poly", additive: false, points: sparklePoints(x, y, size * 1.3, size * 1.3, .2, angle), color: PALETTE.navyInk, alpha: 1 });
  out.push({ kind: "poly", additive: false, points: sparklePoints(x, y, size, size, .2, angle), color: PALETTE.fxWarmCream, alpha: 1 });
}
