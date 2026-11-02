import recipesJson from "./native-city-exchange-fx-recipes.json";
import type { CityPoint } from "../../world/NativeCityDefinition";
import { clamp01, lerp } from "../../sim/geom";
import { easeOutCubic } from "../art/easing";
import { PALETTE } from "../art/palette";
import { cometPoints, crescentPoints, ellipsePoints, ribbonPoints, sampleSpine, sparklePoints } from "./CombatFxShapes";
import { pushFxPoly, type FxPrim } from "./FxPrim";
import type { NativeCityKumaGrade } from "../../sim/cityFight/NativeCityCombatTuning";
import { nativeCityKumaGradeColors } from "./NativeCityKumaGrade";



/** A recipe strip: the size and life of a code-drawn stand-in (first sampled from the old 128 px vfx strips, never loaded in the village). */
interface StripSpec { readonly durMs: number; readonly sizePx: number; readonly alpha?: number; readonly delayMs?: number }

/** The recipes, frozen (deep enough for runtime reads). */
export const NATIVE_CITY_EXCHANGE_FX = Object.freeze(recipesJson);
const R = NATIVE_CITY_EXCHANGE_FX;

/** The exchange palette (gold, pearl, dust) — owned by `PALETTE` (`nativeCityExchange*`), like every other colour. */
export const NATIVE_CITY_EXCHANGE_COLORS = Object.freeze({
  ink: PALETTE.nativeCityExchangeInk,
  ivory: PALETTE.nativeCityExchangeIvory,
  gold: PALETTE.nativeCityExchangeGold,
  goldBright: PALETTE.brightGold,
  hotGold: PALETTE.hotGold,
  pearl: PALETTE.pearl,
  dust: PALETTE.dust,
  white: PALETTE.white,
  /** The strips' dark tint ends (`tintFrom`): dust shade and spark shade. */
  dustShade: PALETTE.nativeCityExchangeDustShade,
  goldShade: PALETTE.nativeCityExchangeGoldShade,
  windShade: PALETTE.nativeCityExchangeWindShade,
  windLight: PALETTE.nativeCityExchangeWindLight,
});
const C = NATIVE_CITY_EXCHANGE_COLORS;

export type NativeCityExchangeFxKind = "guardSpark" | "clashSpark" | "parryRingFlash" | "hitBurst" | "finisherBurst" | "slideDust"
  | "koDustRing" | "whiffWind" | "callingCard" | "windupGlint"
  /**
   * 2026-10-09 rule tells (`feel.tells`): `eyeGlint` — the flash in his eyes right before the dash launches (a long thin flare and a
   * sparkle); `guardGlint` — his guard coming up (a pearl sparkle on the forearms); `guardShatter` — the hook breaking his guard
   * (pearl crescent shards flying out of a split shield arc).
   */
  | "eyeGlint" | "guardGlint" | "guardShatter"

  | "hugSqueeze"

  | "superCrescent" | "superRupture" | "superCrack";

/** Lives (effect ms) of the rule-tell effects (curved shapes, no strip recipe). */
const TELL_FX_MS = Object.freeze({ eyeGlint: 170, guardGlint: 220, guardShatter: 360 });
/**
 * The super's drawn strikes: the crescent's and the burst's cels (effect ms — still through the freeze); the crack on SCREEN time (the KO's
 * slow-mo crawled the fight clock and held it a second, under the victory page) — it holds `crackHoldMs`, then is blown out over
 * `crackBlowMs` (it swells and fades, the shards fly). Its cue lives as long in effect ms (the fight clock never runs faster than the screen).
 */
export const NATIVE_CITY_SUPER_FX = Object.freeze({ crescentMs: 270, ruptureMs: 210, crackHoldMs: 320, crackBlowMs: 260 });

export interface NativeCityExchangeCue {
  readonly kind: NativeCityExchangeFxKind;
  /** Feet (plan) of the body the effect sits on. */
  readonly feet: CityPoint;
  /** Height of the effect above the feet, as a fraction of `bodyPx` (0 = on the ground). */
  readonly height: number;

  readonly bodyPx: number;
  /** World px per recipe px (city body / `exchangeFx.sampleBodyPx`). */
  readonly scale: number;
  /** Plan direction: the blow (contacts), the swipe (whiff), the slide (dust). */
  readonly direction: CityPoint;
  readonly seed: number;
  readonly reducedMotion: boolean;
  /** hitBurst size 0..1 (the recipe's `big`). */
  readonly big?: number;
  /** callingCard: where it sticks (plan feet), its height there (fraction of `bodyPx`) and how long it stays after landing. */
  readonly to?: CityPoint;
  readonly toHeight?: number;
  readonly stayMs?: number;
  /** World px added after projecting `feet` (a lying body's centre is beside its feet). */
  readonly offsetPx?: readonly [number, number];
  /** callingCard: world px added after projecting `to` (his chest as he lies). */
  readonly toOffsetPx?: readonly [number, number];
  /** windupGlint: the coming move's triangle class (its colour, `NativeCityKumaGrade`); absent: gold. */
  readonly grade?: NativeCityKumaGrade | null;
  /**
   * superRupture: its drawn width × this (2026-10-23 arena audit — the arena's ground burst at the feet, b06 #330 / b07 #85: 2.6 bodies wide
   * over the body it hid him); absent: 1.
   */
  readonly drawnScale?: number;
  /** superRupture: drawn on the ground layer behind the bodies (`NativeCitySmashDraw.behind`), not over them. */
  readonly behindBodies?: boolean;

  readonly blow?: CityPoint;
}

export type NativeCityExchangeProject = (point: CityPoint) => readonly [number, number];

export interface NativeCityExchangeLayers {
  readonly ground: FxPrim[];
  readonly burst: FxPrim[];
}

const easeOut = (t: number) => easeOutCubic(clamp01(t));
/** The recipes' deterministic per-index hash (reference/rig.py `spark_rays`). */
const hash = (i: number, seed: number, a = 7919, b = 104729) => ((i * a + seed * b) % 1000 + 1000) % 1000 / 1000;
const particles = (count: number, reduced: boolean) => Math.max(1, Math.round(count * (reduced ? R.rules.reducedMotion.particleCountScale : 1)));

/** When this effect has fully faded (effect-clock ms). */
export function nativeCityExchangeFxLifeMs(cue: NativeCityExchangeCue): number {
  const f = R.fx;
  switch (cue.kind) {
    case "guardSpark": return Math.max(f.guardSpark.core.durMs, f.guardSpark.shieldArc.durMs, f.guardSpark.strip.durMs, f.guardSpark.sparkRays.durMs);
    case "clashSpark": return Math.max(...(f.clashSpark.strips as readonly StripSpec[]).map(s => s.durMs + (s.delayMs ?? 0)), f.clashSpark.sparkRays.durMs);
    case "parryRingFlash": return Math.max(...(f.parryRingFlash.rings as readonly { durMs: number; delayMs?: number }[]).map(r => r.durMs + (r.delayMs ?? 0)),
      f.parryRingFlash.strip.durMs);
    case "hitBurst": return Math.max(f.hitBurst.strip.durMs, f.hitBurst.sparkRays.durMs, f.hitBurst.core.durMs);
    case "finisherBurst": return Math.max(f.finisherBurst.ring.durMs, ...f.finisherBurst.strips.map(s => s.durMs), f.finisherBurst.sparkRays.durMs);
    case "slideDust": return Math.max(f.slideDust.strip.durMs, f.slideDust.dustPuffs.durMs);
    case "koDustRing": return Math.max(f.koDustRing.strip.durMs, f.koDustRing.ring.durMs, ...f.koDustRing.dustPuffs.map(p => p.durMs));
    case "whiffWind": return Math.max(f.whiffWind.strip.durMs, f.whiffWind.dustPuffs.durMs);
    case "callingCard": return f.callingCard.flyMs + Math.max(0, cue.stayMs ?? 0) + CARD_FADE_MS;
    case "windupGlint": return f.windupGlint.durMs;
    case "eyeGlint": return TELL_FX_MS.eyeGlint;
    case "guardGlint": return TELL_FX_MS.guardGlint;
    case "guardShatter": return TELL_FX_MS.guardShatter;
    case "hugSqueeze": return Math.max(...f.hugSqueeze.arcs.map(a => a.durMs + a.delayMs));
    case "superCrescent": return NATIVE_CITY_SUPER_FX.crescentMs;
    case "superRupture": return NATIVE_CITY_SUPER_FX.ruptureMs;
    case "superCrack": return NATIVE_CITY_SUPER_FX.crackHoldMs + NATIVE_CITY_SUPER_FX.crackBlowMs;
  }
}

const CARD_FADE_MS = 200;

function rotate(points: number[], angle: number, cx: number, cy: number): number[] {
  const c = Math.cos(angle), s = Math.sin(angle);
  for (let i = 0; i < points.length; i += 2) {
    const x = points[i]!, y = points[i + 1]!;
    points[i] = cx + x * c - y * s;
    points[i + 1] = cy + x * s + y * c;
  }
  return points;
}

/** A full ring of even width (two closed half bands — a fill cannot hold a hole). `sy` squashes it onto the ground. */
export function nativeCityExchangeRing(cx: number, cy: number, r: number, width: number, sy = 1, steps = 18): number[][] {
  const out: number[][] = [];
  const r0 = r + width / 2, r1 = Math.max(0, r - width / 2);
  for (const from of [0, Math.PI]) {
    const outer: number[] = [], inner: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const a = from + Math.PI * i / steps;
      outer.push(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * sy);
      inner.push(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1 * sy);
    }
    for (let i = inner.length - 2; i >= 0; i -= 2) outer.push(inner[i]!, inner[i + 1]!);
    out.push(outer);
  }
  return out;
}

/** A rounded rectangle (corner arcs), centred on the origin. */
function roundedRect(w: number, h: number, r: number, corner = 4): number[] {
  const points: number[] = [], rr = Math.min(r, w / 2, h / 2);
  const corners: readonly (readonly [number, number, number])[] = [[w / 2 - rr, h / 2 - rr, 0], [-w / 2 + rr, h / 2 - rr, Math.PI / 2],
    [-w / 2 + rr, -h / 2 + rr, Math.PI], [w / 2 - rr, -h / 2 + rr, Math.PI * 1.5]];
  for (const [cx, cy, a0] of corners) {
    for (let i = 0; i <= corner; i++) { const a = a0 + Math.PI / 2 * i / corner; points.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
  }
  return points;
}

/** A five-armed star whose edges bow inward (a dizzy star, not a flat polygon): arms are sampled curves. */
export function nativeCityExchangeStarPoints(cx: number, cy: number, r: number, rotation: number, waist = 0.42, arms = 5, steps = 4): number[] {
  const points: number[] = [];
  for (let arm = 0; arm < arms; arm++) {
    const tip = rotation - Math.PI / 2 + arm * Math.PI * 2 / arms, next = tip + Math.PI * 2 / arms;
    for (let i = 0; i < steps; i++) {
      // tip → valley → next tip along a concave curve (the valley pulled in to `waist`).
      const u = i / steps, a = lerp(tip, next, u);
      const k = Math.sin(Math.PI * u);
      const rr = r * (1 - (1 - waist) * Math.pow(k, 0.7));
      points.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
  }
  return points;
}

/** Tapered rays thrown out from a point (recipes `sparkRays`): comet heads leading outward. */
function sparkRays(out: FxPrim[], age: number, x: number, y: number, spec: { readonly count: number; readonly lengthPx: number; readonly durMs: number;
  readonly widthPx?: number; readonly inkScale?: number; readonly spreadDeg?: number; readonly baseDeg?: number; readonly seed?: number }, color: number, scale: number,
  baseRad: number, reduced: boolean, seedFallback: number): void {
  if (age < 0 || age >= spec.durMs) return;
  const u = age / spec.durMs, n = particles(spec.count, reduced), spread = (spec.spreadDeg ?? 360) * Math.PI / 180;
  const seed = spec.seed ?? seedFallback, width = (spec.widthPx ?? 4) * scale;
  for (let i = 0; i < n; i++) {
    const h = hash(i, seed);
    const a = baseRad - spread / 2 + spread * (i + 0.5 * h) / n;
    const L = spec.lengthPx * scale * (0.55 + 0.45 * h);
    const r0 = L * easeOut(u) * 0.55, r1 = L * (0.25 + 0.95 * easeOut(u));
    if (spec.inkScale) pushFxPoly(out, cometPoints(x + Math.cos(a) * r1, y + Math.sin(a) * r1, a, Math.max(1, r1 - r0),
      width * spec.inkScale * (1 - 0.7 * u)), C.ink, 0.85 * (1 - u) ** 1.2);
    pushFxPoly(out, cometPoints(x + Math.cos(a) * r1, y + Math.sin(a) * r1, a, Math.max(1, r1 - r0), width * (1 - 0.7 * u)), color, (1 - u) ** 1.2);
  }
}

/** A contact core: a soft hot-gold rim and a small concave sparkle (white only for the finisher), ≤ `rules.whiteCoreMaxMs` of screen time. */
function core(out: FxPrim[], screenAge: number, x: number, y: number, radius: number, durMs: number, white: boolean): void {
  const dur = Math.min(durMs, R.rules.whiteCoreMaxMs);
  if (screenAge < 0 || screenAge >= dur) return;
  const u = screenAge / dur, r = radius * (0.7 + 0.6 * u), a = (1 - u) ** 1.5;
  out.push({ kind: "light", x, y, radius: r * 1.7, color: C.hotGold, alpha: 0.55 * a });
  pushFxPoly(out, sparklePoints(x, y, r * 1.1, r * 0.8, 0.2, Math.PI / 4), white ? C.white : C.ivory, a);
}

/** An expanding ring (recipes `ring`). */
function ring(out: FxPrim[], age: number, x: number, y: number, spec: { readonly r0: number; readonly r1: number; readonly durMs: number;
  readonly widthPx: number; readonly delayMs?: number; readonly sy?: number; readonly alpha?: number }, color: number, scale: number): void {
  const t = age - (spec.delayMs ?? 0);
  if (t < 0 || t >= spec.durMs) return;
  const u = t / spec.durMs, r = lerp(spec.r0, spec.r1, easeOut(u)) * scale;
  for (const points of nativeCityExchangeRing(x, y, r, Math.max(0.5, spec.widthPx * scale * (1 - 0.6 * easeOut(u))), spec.sy ?? 1)) {
    pushFxPoly(out, points, color, (spec.alpha ?? 1) * (1 - u));
  }
}

/** Dust puffs rolling out along the ground (recipes `dustPuffs`): a stone shade under a sunlit crest. */
function dustPuffs(out: FxPrim[], age: number, x: number, y: number, spec: { readonly count: number; readonly durMs: number;
  readonly direction?: number; readonly spreadDeg?: number; readonly seed?: number; readonly sizePx?: number }, scale: number, reduced: boolean,
  direction: number, seedFallback: number): void {
  if (age < 0 || age >= spec.durMs) return;
  const u = age / spec.durMs, n = particles(spec.count, reduced), seed = spec.seed ?? seedFallback, size = (spec.sizePx ?? 22) * scale;
  const spread = (spec.spreadDeg ?? 60) * scale, dir = spec.direction ?? direction;
  for (let i = 0; i < n; i++) {
    const h = hash(i, seed, 3571, 7717);
    const px = x + dir * (spread * (0.2 + 0.8 * h) * easeOut(u)) - dir * spread * 0.2;
    const py = y - size * 1.8 * easeOut(u) * (0.4 + h);
    const r = size * (0.5 + 0.7 * h) * (0.6 + 0.8 * u), fade = 1 - u;
    pushFxPoly(out, ellipsePoints(px, py, r, r * 0.7, 14), C.dustShade, 0.32 * fade);
    pushFxPoly(out, ellipsePoints(px - r * 0.12, py - r * 0.18, r * 0.72, r * 0.5, 14), C.dust, 0.5 * fade);
  }
}

/** The land-dust strip stand-in: a flat dust bloom spreading on the ground (two tones, squashed `sy`). */
function landDust(out: FxPrim[], age: number, x: number, y: number, spec: { readonly durMs: number; readonly sizePx: number; readonly sy?: number },
  scale: number): void {
  if (age < 0 || age >= spec.durMs) return;
  const u = age / spec.durMs, w = spec.sizePx * scale * 0.5 * (0.45 + 0.55 * easeOut(u)), sy = (spec.sy ?? 0.8) * 0.32;
  pushFxPoly(out, ellipsePoints(x, y, w, w * sy, 22), C.dustShade, 0.28 * (1 - u) ** 1.3);
  pushFxPoly(out, ellipsePoints(x, y - w * sy * 0.25, w * 0.78, w * sy * 0.62, 22), C.dust, 0.42 * (1 - u) ** 1.3);
}

/** The heavy-impact strip stand-in: crescent petals bursting out around the contact, gold shading to ivory. */
function impactPetals(out: FxPrim[], age: number, x: number, y: number, durMs: number, sizePx: number, scale: number, rot: number,
  alpha: number, seed: number, petals = 7): void {
  if (age < 0 || age >= durMs) return;
  const u = age / durMs, r = sizePx * scale * 0.5 * (0.35 + 0.65 * easeOut(u));
  for (let i = 0; i < petals; i++) {
    const a = rot + i * Math.PI * 2 / petals + (hash(i, seed) - 0.5) * 0.3;
    const len = r * (0.6 + 0.4 * hash(i, seed + 1)), th = sizePx * scale * 0.05 * (1 - 0.7 * u);
    const cx = x + Math.cos(a) * len * 0.45, cy = y + Math.sin(a) * len * 0.45;
    pushFxPoly(out, rotate(crescentPoints(0, 0, len * 0.55, len * 0.32, -1.1, 1.1, th, 12, 0.5), a, cx, cy),
      u < 0.4 ? C.goldShade : C.gold, alpha * (1 - u) ** 1.4);
    pushFxPoly(out, rotate(crescentPoints(0, 0, len * 0.5, len * 0.28, -0.9, 0.9, th * 0.45, 12, 0.5), a, cx, cy), C.windLight, alpha * 0.8 * (1 - u) ** 2);
  }
}

/** The metal-spark strip stand-in: small crescents flicked out toward one side. */
function metalSparks(out: FxPrim[], age: number, x: number, y: number, durMs: number, sizePx: number, scale: number, base: number,
  spread: number, color: number, seed: number, reduced: boolean, count = 5): void {
  if (age < 0 || age >= durMs) return;
  const u = age / durMs, n = particles(count, reduced);
  for (let i = 0; i < n; i++) {
    const a = base - spread / 2 + spread * (i + 0.5) / n + (hash(i, seed) - 0.5) * 0.25;
    const travel = sizePx * scale * 0.42 * easeOut(u) * (0.7 + 0.5 * hash(i, seed + 3));
    const r = sizePx * scale * 0.07 * (1 - 0.5 * u), th = r * 0.55;
    const hx = x + Math.cos(a) * travel, hy = y + Math.sin(a) * travel;
    pushFxPoly(out, rotate(crescentPoints(0, 0, r, r * 0.7, -0.95, 0.95, th, 10, 0.5), a, hx, hy), color, 0.95 * (1 - u ** 2));
  }
}

function screenAngle(cue: NativeCityExchangeCue, project: NativeCityExchangeProject): number {
  const [x0, y0] = project(cue.feet);
  const [x1, y1] = project([cue.feet[0] + cue.direction[0], cue.feet[1] + cue.direction[1]]);
  return Math.hypot(x1 - x0, y1 - y0) < 1e-6 ? 0 : Math.atan2(y1 - y0, x1 - x0);
}

/** One cue's shapes at `age` (effect clock) / `screenAge` (screen clock, cores). */
export function drawNativeCityExchangeFx(cue: NativeCityExchangeCue, age: number, screenAge: number, project: NativeCityExchangeProject, out: NativeCityExchangeLayers): void {
  const f = R.fx, k = cue.scale, reduced = cue.reducedMotion;
  const [px, py] = project(cue.feet), fx = px + (cue.offsetPx?.[0] ?? 0), fy = py + (cue.offsetPx?.[1] ?? 0);
  const x = fx, y = fy - cue.height * cue.bodyPx;
  const angle = screenAngle(cue, project), side = Math.cos(angle) >= 0 ? 1 : -1;
  switch (cue.kind) {
    case "guardSpark": {
      const g = f.guardSpark;
      core(out.burst, screenAge, x, y, g.core.r * k, g.core.durMs, false);
      // The shield: a pearl half-arc facing the attacker over an ink under-arc (`shieldArc.inkScale` × as thick, grown to rim both
      // edges — like the guard mark: pearl alone vanishes on the bright paving), a thinner ivory one inside it.
      const s = g.shieldArc, u = age / s.durMs;
      if (u < 1) {
        const toward = angle + Math.PI, rr = s.radiusPx * k * (0.85 + 0.3 * easeOut(u)), th = 6 * k, grow = th * (s.inkScale - 1) / 2;
        pushFxPoly(out.burst, crescentPoints(x, y, rr + grow, (rr + grow) * 1.25, toward - 1.24, toward + 1.24, th * s.inkScale, 16, 0.5), C.ink, 0.85 * (1 - u));
        pushFxPoly(out.burst, crescentPoints(x, y, rr, rr * 1.25, toward - 1.2, toward + 1.2, th, 16, 0.5), C.pearl, 0.9 * (1 - u));
        pushFxPoly(out.burst, crescentPoints(x, y, rr * 0.8, rr, toward - 0.95, toward + 0.95, 3 * k, 14, 0.5), C.ivory, 0.5 * (1 - u));
      }
      metalSparks(out.burst, screenAge, x, y, g.strip.durMs, g.strip.sizePx, k, angle + Math.PI, Math.PI * 0.8, C.pearl, cue.seed, reduced);
      sparkRays(out.burst, screenAge, x, y, g.sparkRays, C.pearl, k, angle + Math.PI, reduced, cue.seed);
      return;
    }
    case "clashSpark": {
      const c = f.clashSpark, [heavy, metal] = c.strips as readonly StripSpec[] as [StripSpec, StripSpec];
      core(out.burst, screenAge, x, y, c.core.r * k, c.core.durMs, false);
      impactPetals(out.burst, age, x, y, heavy.durMs, heavy.sizePx * 0.55, k, angle, heavy.alpha ?? 0.75, cue.seed);
      metalSparks(out.burst, age - (metal.delayMs ?? 0), x, y, metal.durMs, metal.sizePx * 0.6, k, angle - Math.PI / 2, Math.PI * 1.6, C.pearl,
        cue.seed + 5, reduced, 7);
      sparkRays(out.burst, age, x, y, c.sparkRays, C.goldBright, k, angle - Math.PI / 2, reduced, cue.seed);
      return;
    }
    case "parryRingFlash": {
      const p = f.parryRingFlash;
      core(out.burst, screenAge, x, y, p.core.r * k, p.core.durMs, false);
      // The successful deflection snaps a narrow cross from his palm, before the rings bloom. It clears on screen time even
      // while both fighters are stopped, so the recoil and the punish remain visible.
      const cross = p.cross, crossU = screenAge / cross.durMs;
      if (!reduced && crossU < 1) {
        const snap = 0.55 + 0.45 * clamp01(screenAge / cross.snapMs), length = cross.lengthPx * k * snap;
        const width = cross.widthPx * k * (1 - crossU), alpha = (1 - crossU) ** 1.4;
        for (const turn of [0, Math.PI / 2]) {
          const a = angle + cross.tiltDeg * Math.PI / 180 + turn, span = length * (turn === 0 ? 1 : 0.65);
          pushFxPoly(out.burst, sparklePoints(x, y, span, width * cross.inkScale, 0.035, a), C.ink, alpha);
          pushFxPoly(out.burst, sparklePoints(x, y, span * 0.98, width, 0.035, a), C.pearl, alpha);
          pushFxPoly(out.burst, sparklePoints(x, y, span * 0.7, width * 0.35, 0.035, a), C.ivory, alpha);
        }
      }
      // Split pressure arcs leave the actual palm visible. The dark rim survives on bright paving.
      for (const [i, spec] of p.rings.entries()) {
        const u = (screenAge - (spec.delayMs ?? 0)) / spec.durMs;
        if (u < 0 || u >= 1) continue;
        const r = lerp(spec.r0, reduced ? spec.r0 : spec.r1, easeOut(u)) * k;
        const width = spec.widthPx * k * (1 - .6 * u), alpha = (1 - u) ** 1.5;
        for (const turn of [-1.1, 2.04]) {
          const from = angle + turn + i * .26, to = from + 1.55;
          pushFxPoly(out.burst, crescentPoints(x, y, r, r, from, to, width * 1.7, 24, .4), C.ink, alpha);
          // Both pearl (2026-10-19 신호 정리: the inner ring was hot gold — gold is the gold grade's only, the parry / counter is the white
          // grade's; pure white stays the finisher core's alone).
          pushFxPoly(out.burst, crescentPoints(x, y, r * .98, r * .98, from, to, width, 24, .4), C.pearl, alpha);
        }
      }
      // Light ends with the short core, before the ink arcs and metal fragments clear.
      const s = p.strip, u = screenAge / p.core.durMs;
      if (!reduced && u < 1) out.burst.push({ kind: "light", x, y, radius: s.sizePx * k * .32, color: C.pearl, alpha: .22 * (1 - u) ** 2 });
      sparkRays(out.burst, screenAge, x, y, p.sparkRays, C.pearl, k, 0, reduced, cue.seed);
      return;
    }
    // 2026-10-17 (이펙트 화풍 통일): the burst's gold crescent ring and spark rays, the finisher's petals, ring and rays went — vector
    // shapes over the drawn heavy cel and the decisive frame's plate read as clip art. Their cores stay (the finisher's is the only white).
    case "hitBurst": {
      const h = f.hitBurst, big = clamp01(cue.big ?? 0.5);
      core(out.burst, screenAge, x, y, (10 + 36 * big) * k, h.core.durMs, false);
      return;
    }
    case "finisherBurst": {
      const fb = f.finisherBurst;
      core(out.burst, screenAge, x, y, fb.core.r * k, fb.core.durMs, true);
      return;
    }
    case "slideDust": {
      const d = f.slideDust, back = -Math.sign(Math.cos(angle)) || -1;
      landDust(out.ground, age, x, fy, d.strip, k);
      dustPuffs(out.ground, age, x, fy, d.dustPuffs, k, reduced, -back, cue.seed);
      return;
    }
    case "koDustRing": {
      const d = f.koDustRing;
      landDust(out.ground, age, x, fy, d.strip, k);
      for (const puffs of d.dustPuffs) dustPuffs(out.ground, age, x + puffs.direction * 60 * k, fy, puffs, k, reduced, puffs.direction, puffs.seed);
      ring(out.ground, age, x, fy, d.ring, C.dust, k);
      return;
    }
    case "whiffWind": {
      // The swipe's wind arcs went (2026-10-17): the swing's drawn ink smear carries the swipe. The dust under the ducked body stays.
      dustPuffs(out.ground, age, x, fy, f.whiffWind.dustPuffs, k, reduced, -side, f.whiffWind.dustPuffs.seed);
      return;
    }
    case "callingCard": {
      drawCallingCard(cue, age, project, out);
      return;
    }
    case "windupGlint": {
      const g = f.windupGlint, u = age / g.durMs;
      if (u >= 1) return;
      const r = g.starOuterPx * k * Math.sin(Math.PI * u);
      // Tinted by the coming move's class (the triangle): pearl, gold, red.
      const glint = nativeCityKumaGradeColors(cue.grade).glint;
      pushFxPoly(out.burst, sparklePoints(x, y, r, r, 0.12, age * 0.004), glint, 0.95);
      out.burst.push({ kind: "light", x, y, radius: r * 1.6, color: glint, alpha: 0.35 * Math.sin(Math.PI * u) });
      return;
    }
    case "eyeGlint": {
      // The anime eye glint: a long thin flare across his eyes (wide, flat sparkle) over a small hot-gold star, on the screen clock
      // shape of a blink — in fast, out slower.
      const u = age / TELL_FX_MS.eyeGlint;
      if (u >= 1) return;
      const on = u < 0.3 ? easeOut(u / 0.3) : (1 - (u - 0.3) / 0.7) ** 1.5;
      const r = 26 * k * on;
      pushFxPoly(out.burst, sparklePoints(x, y, r * 2.6, r * 0.32, 0.1, 0), C.ivory, 0.95 * on);
      pushFxPoly(out.burst, sparklePoints(x, y, r * 0.9, r * 0.9, 0.14, Math.PI / 4), C.hotGold, on);
      out.burst.push({ kind: "light", x, y, radius: r * 1.8, color: C.hotGold, alpha: 0.45 * on });
      return;
    }
    case "guardGlint": {
      // His guard coming up: a pearl sparkle sliding up the raised forearms (along the screen up, toward the attacker's side).
      const u = age / TELL_FX_MS.guardGlint;
      if (u >= 1) return;
      const on = Math.sin(Math.PI * u), r = 20 * k * on, rise = 18 * k * easeOut(u);
      pushFxPoly(out.burst, sparklePoints(x + side * 4 * k, y - rise, r, r * 0.8, 0.12, Math.PI / 4 + u), C.pearl, 0.95 * on);
      out.burst.push({ kind: "light", x, y: y - rise, radius: r * 1.5, color: C.pearl, alpha: 0.3 * on });
      return;
    }
    case "hugSqueeze": {
      // on it (r0 -> r1, the reverse of the parry ring's bloom), pearl and then ivory over an ink rim (pearl alone vanishes on the bright
      // paving), on the screen clock. No core, light or sparks — restrained; reduced motion holds them part way in and only fades them.
      const h = f.hugSqueeze;
      for (const [i, spec] of h.arcs.entries()) {
        const u = (screenAge - spec.delayMs) / spec.durMs;
        if (u < 0 || u >= 1) continue;
        const r = lerp(spec.r0, spec.r1, reduced ? h.reducedRadiusShare : easeOut(u)) * k;
        const width = spec.widthPx * k * (1 - .3 * u), alpha = h.alpha * (1 - u) ** 1.5;
        for (const centre of [0, Math.PI]) {
          const from = centre - h.spanRad / 2, to = centre + h.spanRad / 2;
          pushFxPoly(out.burst, crescentPoints(x, y, r, r, from, to, width * 1.7, 18, .4), C.ink, alpha);
          pushFxPoly(out.burst, crescentPoints(x, y, r * .98, r * .98, from, to, width, 18, .4), i === 0 ? C.pearl : C.ivory, alpha);
        }
      }
      return;
    }
    case "guardShatter":
      // The broken guard's shards are the light layer's ("깨짐!" `HypeImpactFx` shatter, `NativeCityComicArt.EXCHANGE_HYPE`). These pearl
      // crescents drew the same break a second time over the hit (2026-10-17 쿠마전 이펙트 정리) — the cue stays for its light layer.
      return;
    case "superCrescent": case "superRupture": case "superCrack":
      // Drawn art only (`NativeCityCombatFxView`).
      return;
  }
}

/**
 * Sweat flying off a head whose poise is nearly gone (`feel.tells.poise`): a bead every `everyMs`, each arcing out to alternating
 * sides and falling over `lifeMs` (a teardrop: a crescent highlight on a pale drop). Deterministic in `timeMs`.
 */
export function nativeCityExchangeSweatPrims(head: readonly [number, number], scale: number, timeMs: number, everyMs: number, lifeMs: number,
  alpha = 1): FxPrim[] {
  const out: FxPrim[] = [], a = clamp01(alpha);
  if (a <= 0.01 || !(everyMs > 0) || !(lifeMs > 0)) return out;
  const newest = Math.floor(timeMs / everyMs);
  for (let n = newest; n >= 0 && (timeMs - n * everyMs) < lifeMs; n--) {
    const age = timeMs - n * everyMs, u = age / lifeMs, side = n % 2 === 0 ? 1 : -1;
    const x = head[0] + side * (10 + 26 * easeOut(u)) * scale, y = head[1] - 6 * scale + (-18 * u + 46 * u * u) * scale;
    const r = 4.2 * scale * (1 - 0.3 * u), fade = a * (1 - u ** 2);
    pushFxPoly(out, ellipsePoints(x, y, r * 0.8, r, 10), C.pearl, 0.9 * fade);
    pushFxPoly(out, crescentPoints(x - r * 0.2, y - r * 0.2, r * 0.5, r * 0.6, -2.6, -1.2, r * 0.25, 8, 0.5), C.ivory, 0.85 * fade);
  }
  return out;
}


function drawCallingCard(cue: NativeCityExchangeCue, age: number, project: NativeCityExchangeProject, out: NativeCityExchangeLayers): void {
  const c = R.fx.callingCard, k = cue.scale;
  const [sx, sy0] = project(cue.feet), from: readonly [number, number] = [sx + (cue.offsetPx?.[0] ?? 0), sy0 + (cue.offsetPx?.[1] ?? 0) - cue.height * cue.bodyPx];
  const target = cue.to ?? cue.feet, [tx, ty0] = project(target);
  const to: readonly [number, number] = [tx + (cue.toOffsetPx?.[0] ?? 0), ty0 + (cue.toOffsetPx?.[1] ?? 0) - (cue.toHeight ?? 0) * cue.bodyPx];
  const w = c.sizePx[0]! * k, h = w * 0.64;
  const card = (x: number, y: number, rot: number, alpha: number) => {
    pushFxPoly(out.burst, rotate(roundedRect(w + 4 * k, h + 4 * k, 5 * k), rot, x, y), C.goldBright, alpha);
    pushFxPoly(out.burst, rotate(roundedRect(w, h, 4 * k), rot, x, y), C.ink, alpha);
    // The monocle-mask mark: two ivory rings and a bridge.
    for (const dx of [-0.17, 0.17]) {
      const [mx, my] = [x + Math.cos(rot) * dx * w, y + Math.sin(rot) * dx * w];
      for (const points of nativeCityExchangeRing(mx, my, w * 0.1, w * 0.035, 0.85, 8)) pushFxPoly(out.burst, points, C.ivory, alpha);
    }
    const bridge = sampleSpine(4, s => [x + Math.cos(rot) * lerp(-0.07, 0.07, s) * w, y + Math.sin(rot) * lerp(-0.07, 0.07, s) * w - 0.02 * w]);
    pushFxPoly(out.burst, ribbonPoints(bridge, () => w * 0.03), C.ivory, alpha);
  };
  if (age < c.flyMs) {
    const u = easeOut(age / c.flyMs), lift = 70 * k * Math.sin(Math.PI * u);
    const x = lerp(from[0], to[0], u), y = lerp(from[1], to[1], u) - lift;
    // A short pearl trail behind it (never on a body: it trails in the air).
    for (let i = 1; i <= c.trailPearls; i++) {
      const uu = easeOut(Math.max(0, age - 18 * i) / c.flyMs);
      const px = lerp(from[0], to[0], uu), py = lerp(from[1], to[1], uu) - 70 * k * Math.sin(Math.PI * uu);
      pushFxPoly(out.burst, ellipsePoints(px, py, 6 * k, 6 * k, 10), C.pearl, 0.47 / i);
    }
    card(x, y, age * 2.6 * Math.PI / 180, 1);
    return;
  }
  const t = age - c.flyMs, stay = Math.max(0, cue.stayMs ?? 0);
  const alpha = t < stay ? 1 : 1 - clamp01((t - stay) / CARD_FADE_MS);
  card(to[0], to[1], c.stickRotDeg * Math.PI / 180, alpha);
  // Landing: a small hot-gold flash (not white) and a ring of short rays.
  if (t < c.landFlash.durMs) {
    const u = t / c.landFlash.durMs;
    out.burst.push({ kind: "light", x: to[0], y: to[1], radius: c.landFlash.r * k * 1.8, color: C.hotGold, alpha: 0.7 * (1 - u) });
  }
  sparkRays(out.burst, t, to[0], to[1], { ...c.landSparks, widthPx: 3 }, C.goldBright, k, 0, cue.reducedMotion, c.landSparks.seed);
}


export function nativeCityExchangeOnGround(kind: NativeCityExchangeFxKind): boolean {
  return kind === "slideDust" || kind === "koDustRing";
}

/** Dizzy stars orbiting over a groggy (or falling) head (`fx.dizzyStars`): gold concave stars behind an ink rim. None under reduced motion. */
export function nativeCityExchangeDizzyPrims(head: readonly [number, number], scale: number, timeMs: number, alpha: number, reducedMotion: boolean): FxPrim[] {
  const out: FxPrim[] = [];
  if (reducedMotion && R.rules.reducedMotion.dropDizzyStars) return out;
  const a0 = clamp01(alpha);
  if (a0 <= 0.01) return out;
  const d = R.fx.dizzyStars, rx = d.orbitRadiusPx * scale * 1.6, ry = rx * 0.3;
  for (let i = 0; i < d.count; i++) {
    const a = timeMs / 520 * 2 * Math.PI + i * 2 * Math.PI / d.count;
    const px = head[0] + Math.cos(a) * rx, py = head[1] + Math.sin(a) * ry, front = Math.sin(a) > 0;
    const r = (front ? 10 : 7) * scale, rot = timeMs / 6 * Math.PI / 180;
    pushFxPoly(out, nativeCityExchangeStarPoints(px, py, r + 2 * scale, rot), C.ink, 0.78 * a0);
    pushFxPoly(out, nativeCityExchangeStarPoints(px, py, r, rot), front ? C.goldBright : C.gold, a0);
  }
  return out;
}

/** Recipe hit stop (ms) of an exchange beat. */
export function nativeCityExchangeHitStopMs(beat: keyof typeof R.hitStopsMs & string): number {
  const value = R.hitStopsMs[beat as Exclude<keyof typeof R.hitStopsMs, "notes">];
  return typeof value === "number" ? value : 0;
}

/** Recipe camera shake of an exchange beat (px, ms). */
export function nativeCityExchangeShake(beat: "clash" | "jabGuard" | "uppercutHit" | "parry" | "punishJab" | "finisher" | "koLand")
  : { readonly ampPx: number; readonly durMs: number } {
  return R.camera.shake[beat];
}

/** The finisher slow-mo rate (`rate`: the fight's `tempo.finisherSlowMo.scale`, default the recipes'), floored under reduced motion. */
export function nativeCityExchangeFinisherRate(reducedMotion: boolean, rate: number = R.slowMo[0]?.rate ?? 0.35): number {
  return reducedMotion ? Math.max(rate, R.rules.reducedMotion.slowMoRateFloor) : rate;
}

/** Reduced motion drops the afterimage ghosts (recipes `rules.reducedMotion.dropAfterimages`). */
export function nativeCityExchangeAfterimagesOn(reducedMotion: boolean): boolean {
  return !(reducedMotion && R.rules.reducedMotion.dropAfterimages);
}


export type NativeCityExchangeBubbleKey = "village.kumaExchange.sorryDodge" | "village.kumaExchange.goodWorkBow"
  | "village.kumaExchange.shiftNight" | "village.kumaExchange.shiftCrack";

/** A bubble's recipe (key, duration). */
export function nativeCityExchangeBubble<K extends NativeCityExchangeBubbleKey>(key: K): { readonly key: K; readonly durMs: number } {
  const found = R.bubbles.find(bubble => bubble.key === key);
  return { key, durMs: found?.durMs ?? 900 };
}
