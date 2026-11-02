import { FIGHTER_MOVE_LIGHT_TYPES, type FighterMoveLightArc, type FighterMoveLightElement, type FighterMoveLightGeometry,
  type FighterMoveLightLayer, type FighterMoveLightRecipe } from "../../assets/FighterMoveLightRecipe";
import { clamp01 } from "../../sim/geom";
import { easeOutCubic } from "../art/easing";
import { PALETTE } from "../art/palette";
import type { CityFightLightKind } from "../view/CityFightLightShapes";

export { FIGHTER_MOVE_LIGHT_TYPES };
export type { FighterMoveLightElement, FighterMoveLightLayer, FighterMoveLightRecipe };



type V2 = readonly [number, number];

/** One added-light image this frame: `kind` at (x, y) (screen/world px), `w` × `h`, turned `rotation`, from `originX` along its length. */
export interface FighterMoveLightDraw {
  readonly kind: CityFightLightKind;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly rotation: number;
  readonly originX: number;
  readonly tint: number;
  readonly alpha: number;
  readonly layer: FighterMoveLightLayer;
}

export type FighterMoveLightSink = (kind: CityFightLightKind, x: number, y: number, w: number, h: number, rotation: number, originX: number,
  tint: number, alpha: number, layer: FighterMoveLightLayer) => void;

/**
 * Light images per fighter in front of the bodies and behind both (`FighterMoveFxView`'s two pools): his busiest frame — a finisher's arcs,
 * flare and glints over a held stream, a leap's comet behind — fits (`fighter-move-light.test.ts` plays every registered move through them).
 */
export const FIGHTER_MOVE_LIGHT_POOL = Object.freeze({ front: 200, behind: 160 });

/** Under reduced motion a recipe's `still` elements show this long (fight ms), then it is gone. */
export const FIGHTER_MOVE_LIGHT_STILL_MS = 110;

/** How long the recipe draws (fight ms): its last element's end. */
export function fighterMoveLightMs(recipe: FighterMoveLightRecipe): number {
  return recipe.elements.reduce((longest, e) => Math.max(longest, (e.from ?? 0) + e.ms), 0);
}

const WHITE: number = PALETTE.white;
const colours = new Map<string, number>();
/** "#rrggbb" → 0xrrggbb (NaN-free: a bad colour is white). */
export function fighterMoveLightColour(hex: string): number {
  let value = colours.get(hex);
  if (value === undefined) {
    const parsed = /^#[0-9a-fA-F]{6}$/.test(hex) ? parseInt(hex.slice(1), 16) : WHITE;
    colours.set(hex, value = parsed);
  }
  return value;
}

/** Where a recipe draws: his feet, the cue's anchor, his facing and body height (px), the cue's path, layer, size and strength. */
export interface FighterMoveLightPlace {
  readonly feetX: number;
  readonly feetY: number;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly forward: 1 | -1;
  readonly bodyPx: number;
  readonly path: readonly V2[] | null;
  readonly layer: FighterMoveLightLayer;
  /** Its sizes' scale (the cue's `scale`); places are not scaled. */
  readonly scale: number;
  /** Its strength (the cue's `alpha`). */
  readonly alpha: number;
  readonly seed: number;
}

/** Ease out (cubic) and in (square) over a clamped share. */
const easeOut = (t: number) => easeOutCubic(clamp01(t));
const easeIn = (t: number) => clamp01(t) ** 2;
/** A steady pseudo-random 0..1 for (i, salt). */
function jitter(i: number, salt: number): number {
  const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
const DEG = Math.PI / 180;

/** A light image's whole-life shape: full until `shrinkFrom` of its life, then shrinking to nothing (the light goes by getting small). */
function shrink(k: number, shrinkFrom = 0.45): number {
  return k <= shrinkFrom ? 1 : 1 - easeIn((k - shrinkFrom) / (1 - shrinkFrom));
}

/**
 * The images of `recipe` `ageMs` fight ms after its cue started (`frames` screen frames after), for `place`, to `sink`. `reduced`: only its
 * `still` elements, held at their peak, for `FIGHTER_MOVE_LIGHT_STILL_MS`.
 */
export function fighterMoveLightDraws(recipe: FighterMoveLightRecipe, place: FighterMoveLightPlace, ageMs: number, frames: number,
  reduced: boolean, sink: FighterMoveLightSink): void {
  if (reduced && ageMs >= FIGHTER_MOVE_LIGHT_STILL_MS) return;
  recipe.elements.forEach((element, index) => {
    if (reduced && !element.still) return;
    const from = element.from ?? 0;
    // Under reduced motion its peak: a third of the way in (whole, before it shrinks), still.
    const t = reduced ? element.ms * (element.type === "arc" ? Math.max(0.05, 1 - element.cutMs / element.ms) * 0.9 : 0.2) : ageMs - from;
    if (!reduced && (t < 0 || t >= element.ms)) return;
    drawElement(element, index, place, t, frames, reduced, sink);
  });
}

/** Local [forward, up] body heights from (ox, oy) to screen px. */
function toScreen(place: FighterMoveLightPlace, ox: number, oy: number, p: V2): [number, number] {
  return [ox + place.forward * p[0] * place.bodyPx, oy - p[1] * place.bodyPx];
}

/** A local direction (degrees, 0 forward, 90 up) as a screen angle. */
function screenAngle(place: FighterMoveLightPlace, deg: number): number {
  return Math.atan2(-Math.sin(deg * DEG), place.forward * Math.cos(deg * DEG));
}

function drawElement(e: FighterMoveLightElement, index: number, place: FighterMoveLightPlace, t: number, frames: number, reduced: boolean,
  sink: FighterMoveLightSink): void {
  const layer = e.layer ?? place.layer, peak = (e.alpha ?? 1) * place.alpha, S = place.scale * place.bodyPx;
  const [x, y] = toScreen(place, place.anchorX, place.anchorY, e.at ?? [0, 0]);
  const k = clamp01(t / e.ms), salt = place.seed * 7 + index * 13;
  const out = (kind: CityFightLightKind, px: number, py: number, w: number, h: number, rotation: number, tint: number, alpha: number, originX = 0.5) => {
    if (alpha > 0.004 && w > 0.5 && h > 0.5) sink(kind, px, py, w, h, rotation, originX, tint, Math.min(1, alpha), layer);
  };
  // The kit's compound lights (`CityFightLightPool`): a streak / ray is a wide tinted halo and a thin white core; a flare has a white heart.
  const streak = (px: number, py: number, angle: number, length: number, width: number, tint: number, alpha: number, core = WHITE) => {
    out("streak", px, py, length, width * 3.2, angle, tint, alpha * 0.5);
    out("streak", px, py, length * 0.85, width, angle, core, alpha);
  };
  const ray = (px: number, py: number, angle: number, length: number, width: number, tint: number, alpha: number, core = WHITE) => {
    out("ray", px, py, length, width * 3.2, angle, tint, alpha * 0.5, 0);
    out("ray", px, py, length * 0.9, width, angle, core, alpha, 0);
  };
  const flare = (px: number, py: number, size: number, tint: number, alpha: number, rotation: number, heart = 0.9) => {
    out("flare", px, py, size, size, rotation, tint, alpha);
    out("puff", px, py, size * 0.32, size * 0.32, 0, WHITE, alpha * heart);
  };
  switch (e.type) {
    case "arc": return drawArc(e, place, t, x, y, peak, out);
    case "sparkle": {
      const line = lineOf(e, place, x, y, t, k);
      if (!line) return;
      const tint = fighterMoveLightColour(e.tint), accent = fighterMoveLightColour(e.accent ?? e.tint);
      for (let i = 0; i < e.n; i++) {
        const born = reduced ? e.life * 0.3 : t - i * e.stagger;
        if (born < 0 || born >= e.life) continue;
        const s = e.n === 1 ? 0.5 : (i + 0.5) / e.n, [px, py] = line.at(s), q = born / e.life;
        const size = e.size * S * (0.55 + 0.45 * jitter(i, salt)) * (q < 0.2 ? easeOut(q / 0.2) : shrink((q - 0.2) / 0.8, 0.2));
        flare(px, py, size, i % 3 === 1 ? accent : tint, peak, (jitter(i, salt + 1) - 0.5) * 0.6);
      }
      return;
    }
    case "flare": {
      const grow = e.inMs ? 0.55 + 0.45 * easeOut(t / e.inMs) : 1, size = e.size * S * grow * shrink(k, 0.4);
      const rot = screenAngle(place, e.rot ?? 0) + place.forward * (e.spin ?? 0) * DEG * t / 1000;
      flare(x, y, size, fighterMoveLightColour(e.tint), peak, rot, e.heart ?? 0.9);
      return;
    }
    case "core": {
      if (frames > (e.frames ?? 1)) return;
      out("puff", x, y, e.size * S, e.size * S, 0, (e.tint ? fighterMoveLightColour(e.tint) : WHITE), peak);
      return;
    }
    case "ring": {
      const r = (e.r0 + (e.r1 - e.r0) * easeOut(k)) * S, alpha = peak * (1 - k) ** 1.4, squash = e.squash ?? 1;
      const ry = y - (e.rise ?? 0) * S * easeOut(k), rot = e.rot ? screenAngle(place, e.rot) : 0;
      out("ring", x, ry, r * 2.32, r * 2.32 * squash, rot, fighterMoveLightColour(e.tint), alpha);
      if (e.core) out("ring", x, ry, r * 2.26, r * 2.26 * squash, rot, fighterMoveLightColour(e.core), alpha * 0.55);
      return;
    }
    case "rays": {
      const tint = fighterMoveLightColour(e.tint), core = e.core ? fighterMoveLightColour(e.core) : WHITE;
      const grow = e.inMs ? easeOut(t / e.inMs) : 1, spread = e.spread ?? 360, inner = (e.inner ?? 0) * S;
      for (let i = 0; i < e.n; i++) {
        const share = spread >= 360 ? i / e.n : e.n === 1 ? 0.5 : i / (e.n - 1);
        const deg = (e.dir ?? 0) + spread * (share - (spread >= 360 ? 0 : 0.5)) + (jitter(i, salt) - 0.5) * (spread / Math.max(1, e.n)) * 0.6;
        const angle = screenAngle(place, deg), long = e.length * S * (0.6 + 0.4 * jitter(i, salt + 3));
        if (e.inward) {
          // Gathering in: each ray points at the place, its root sliding in from `inner` + its length as it shortens.
          const len = long * (1 - easeIn(k)) * grow, dist = inner * (1 - 0.7 * easeOut(k)) + len;
          const rx = x + Math.cos(angle) * dist, ry = y + Math.sin(angle) * dist;
          ray(rx, ry, angle + Math.PI, len, e.width * S, tint, peak * (0.6 + 0.4 * jitter(i, salt + 5)), core);
        } else {
          const len = long * grow * shrink(k, 0.3), root = inner + long * 0.25 * easeOut(k);
          ray(x + Math.cos(angle) * root, y + Math.sin(angle) * root, angle, len, e.width * S * (1 - 0.5 * k), tint, peak, core);
        }
      }
      return;
    }
    case "glints": {
      const tint = fighterMoveLightColour(e.tint), accent = fighterMoveLightColour(e.accent ?? e.tint), spread = e.spread ?? 360;
      for (let i = 0; i < e.n; i++) {
        const local = t - i * (e.stagger ?? 0), life = e.ms - (e.n - 1) * (e.stagger ?? 0);
        if (local < 0 || local >= life) continue;
        const q = local / life, deg = (e.dir ?? 90) + spread * (jitter(i, salt) - 0.5), angle = screenAngle(place, deg);
        const d = e.dist * S * (0.45 + 0.55 * jitter(i, salt + 1)) * easeOut(q), fall = (e.fall ?? 0) * S * q * q;
        const size = e.size * S * (0.6 + 0.6 * jitter(i, salt + 2)) * shrink(q, 0.25);
        flare(x + Math.cos(angle) * d, y + Math.sin(angle) * d + fall, size, i % 3 === 0 ? accent : tint, peak, q * 2.5 + i);
      }
      return;
    }
    case "motes": {
      const tint = fighterMoveLightColour(e.tint), accent = fighterMoveLightColour(e.accent ?? e.tint), squash = e.squash ?? 1;
      for (let i = 0; i < e.n; i++) {
        const phase = jitter(i, salt) * e.life * (e.loop ? 1 : 0.6);
        let local = t - (e.loop ? -phase : phase);
        if (e.loop) local = ((local % e.life) + e.life) % e.life;
        if (local < 0 || local >= e.life) continue;
        const q = local / e.life, a0 = jitter(i, salt + 1) * Math.PI * 2 + (e.swirl ?? 0) * Math.PI * 2 * (t / 1000);
        const rr = e.radius * Math.sqrt(0.15 + 0.85 * jitter(i, salt + 2));
        const lx = Math.cos(a0) * rr + 0.04 * Math.sin(q * 6 + i), ly = Math.sin(a0) * rr * squash + e.rise * (local / 1000);
        const [px, py] = toScreen(place, x, y, [lx, ly]);
        const size = e.size * S * (0.6 + 0.6 * jitter(i, salt + 3)) * Math.sin(Math.PI * Math.min(1, q * 1.15)) ** 0.7;
        out("puff", px, py, size, size, 0, i % 3 === 2 ? accent : tint, peak * 0.8);
        if (i % 3 === 2) flare(px, py, size * 1.6, accent, peak * 0.7, q);
      }
      return;
    }
    case "bloom": {
      const grow = e.inMs ? 0.5 + 0.5 * easeOut(t / e.inMs) : 1, size = e.size * S * grow * (0.4 + 0.6 * shrink(k, 0.35));
      out("puff", x, y, size, size * (e.squash ?? 1), 0, fighterMoveLightColour(e.tint), peak * shrink(k, 0.55));
      return;
    }
    case "mist": {
      const tint = fighterMoveLightColour(e.tint), sides = e.sides ?? "both";
      for (let i = 0; i < e.n; i++) {
        const side = sides === "both" ? (i % 2 === 0 ? 1 : -1) : sides === "forward" ? 1 : -1;
        const reach = e.spread * (0.25 + 0.75 * jitter(i, salt)), go = easeOut(k * (1.1 + 0.4 * jitter(i, salt + 1)));
        const [px, py] = toScreen(place, x, y, [side * reach * go, (e.rise ?? 0) * k * (0.5 + jitter(i, salt + 2))]);
        const size = e.size * S * (0.5 + 0.5 * jitter(i, salt + 3)) * (0.45 + 0.55 * easeOut(k * 1.6));
        out("puff", px, py, size, size * 0.42, 0, tint, peak * (1 - k) ** 1.6);
      }
      return;
    }
    case "column": {
      const up = screenAngle(place, 90), length = e.height * S * easeOut(k / 0.22), width = e.width * S * (1 - easeIn(k));
      ray(x, y, up, length, width, fighterMoveLightColour(e.tint), peak, (e.core ? fighterMoveLightColour(e.core) : WHITE));
      return;
    }
    case "streaks": {
      const tint = fighterMoveLightColour(e.tint), core = e.core ? fighterMoveLightColour(e.core) : WHITE, angle = screenAngle(place, e.dir ?? 180);
      for (let i = 0; i < e.n; i++) {
        const off = (e.band ?? 0) * (jitter(i, salt) * 2 - 1), slide = (e.travel ?? 0) * easeOut(k) + 0.2 * jitter(i, salt + 1);
        const [px, py] = toScreen(place, x, y, [0, off]);
        const breathe = 1 - (e.flicker ?? 0) * (0.5 + 0.5 * Math.sin(t * 0.021 + i * 2.3));
        const len = e.length * S * (0.55 + 0.45 * jitter(i, salt + 2)) * shrink(k, 0.2) * breathe;
        const cx = px + Math.cos(angle) * (slide * S + len / 2), cy = py + Math.sin(angle) * (slide * S + len / 2);
        streak(cx, cy, angle, len, e.width * S * (1 - 0.6 * k), tint, peak, core);
      }
      return;
    }
  }
}

/** A line to draw along: its point at `s` (0 tail … 1 head, by length), its turn there (screen), and which side is out (its bulge). */
interface Line {
  at(s: number): [number, number];
  angle(s: number): number;
  /** The unit normal on its outer side at `s`. */
  out(s: number): [number, number];
}

/** Catmull-Rom through `points` (local), sampled `n`+1 times. */
function smooth(points: readonly V2[], n: number): V2[] {
  if (points.length < 2) return points.slice();
  const out: V2[] = [];
  const p = (i: number) => points[Math.max(0, Math.min(points.length - 1, i))]!;
  for (let j = 0; j <= n; j++) {
    const g = j / n * (points.length - 1), i = Math.min(points.length - 2, Math.floor(g)), u = g - i;
    const p0 = p(i - 1), p1 = p(i), p2 = p(i + 1), p3 = p(i + 2), u2 = u * u, u3 = u2 * u;
    const c = (a: number, b: number, c2: number, d: number) => 0.5 * (2 * b + (-a + c2) * u + (2 * a - 5 * b + 4 * c2 - d) * u2 + (-a + 3 * b - 3 * c2 + d) * u3);
    out.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])]);
  }
  return out;
}

/**
 * An element's line on screen at `t` fight ms into it (`k` of its time): its circle round (x, y), its own points from (x, y), else the cue's
 * path (from his feet) — shifted, scaled toward its tip, bowed.
 */
function lineOf(g: FighterMoveLightGeometry, place: FighterMoveLightPlace, x: number, y: number, t: number, k: number): Line | null {
  const N = 40;
  let local: V2[];
  let ox = place.feetX, oy = place.feetY;
  if (g.circle) {
    const { r, r1 = r, a0, a1, squash = 1, turn = 0 } = g.circle, radius = r + (r1 - r) * easeOut(k), spun = turn * t / 1000;
    local = Array.from({ length: N + 1 }, (_, j) => {
      const a = (a0 + (a1 - a0) * j / N + spun) * DEG;
      return [radius * Math.cos(a), radius * Math.sin(a) * squash] as const;
    });
    ox = x; oy = y;
  } else {
    const path = g.points ?? place.path;
    if (!path || path.length < 2) return null;
    if (g.points) { ox = x; oy = y; }
    const tip = path[path.length - 1]!, sc = g.scale ?? 1, [dx, dy] = g.offset ?? [0, 0];
    const pts = path.map(p => [tip[0] + (p[0] - tip[0]) * sc + dx, tip[1] + (p[1] - tip[1]) * sc + dy] as const);
    local = smooth(pts, N);
    const bend = g.bend ?? 0;
    if (bend !== 0) {
      const a = local[0]!, b = local[N]!, cx = b[0] - a[0], cy = b[1] - a[1], cl = Math.hypot(cx, cy) || 1;
      // Left of the run (local: a forward run bows up).
      const nx = -cy / cl, ny = cx / cl;
      local = local.map((p, j) => [p[0] + nx * bend * Math.sin(Math.PI * j / N), p[1] + ny * bend * Math.sin(Math.PI * j / N)] as const);
    }
  }
  const pts = local.map(p => toScreen(place, ox, oy, p)), lengths = [0];
  for (let j = 1; j < pts.length; j++) lengths.push(lengths[j - 1]! + Math.hypot(pts[j]![0] - pts[j - 1]![0], pts[j]![1] - pts[j - 1]![1]));
  const total = lengths[lengths.length - 1]!;
  if (!(total > 0.5)) return null;
  const at = (s: number): [number, number] => {
    const want = clamp01(s) * total;
    let j = 1;
    while (j < lengths.length - 1 && lengths[j]! < want) j++;
    const a = pts[j - 1]!, b = pts[j]!, span = lengths[j]! - lengths[j - 1]!, u = span > 0 ? (want - lengths[j - 1]!) / span : 0;
    return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
  };
  const angle = (s: number) => {
    const a = at(Math.max(0, s - 0.02)), b = at(Math.min(1, s + 0.02));
    return Math.atan2(b[1] - a[1], b[0] - a[0]);
  };
  // Its outer side: toward its bulge (its middle off its chord), else up.
  const head = pts[pts.length - 1]!, tail = pts[0]!, mid = at(0.5);
  let bx = mid[0] - (head[0] + tail[0]) / 2, by = mid[1] - (head[1] + tail[1]) / 2;
  if (Math.hypot(bx, by) < 1e-3) { bx = 0; by = -1; }
  const out = (s: number): [number, number] => {
    const a = angle(s), nx = -Math.sin(a), ny = Math.cos(a);
    return nx * bx + ny * by >= 0 ? [nx, ny] : [-nx, -ny];
  };
  return { at, angle, out };
}

function drawArc(e: FighterMoveLightArc, place: FighterMoveLightPlace, t: number, x: number, y: number, peak: number,
  out: (kind: CityFightLightKind, px: number, py: number, w: number, h: number, rotation: number, tint: number, alpha: number, originX?: number) => void): void {
  const line = lineOf(e, place, x, y, t, clamp01(t / e.ms));
  if (!line) return;
  const S = place.scale * place.bodyPx, sweep = e.sweepMs ? easeOut(t / e.sweepMs) : 1;
  const cutFrom = e.ms - e.cutMs, cut = e.cutMs > 0 ? easeIn((t - cutFrom) / e.cutMs) : 0;
  const s1 = sweep, s0 = Math.max(cut, sweep - (e.span ?? 1));
  if (s1 - s0 < 0.01) return;
  const thin = 1 - 0.55 * cut, peakAt = e.peak ?? 0.6;
  const tint = fighterMoveLightColour(e.tint), core = e.core ? fighterMoveLightColour(e.core) : WHITE, rim = e.rim ? fighterMoveLightColour(e.rim) : null;
  const n = e.segments ?? 12, copies = e.copies ?? { n: 1, gap: 0 };
  // Thickest at `peak`, thin at both ends: the crescent.
  const profile = (s: number) => Math.sin(Math.PI * (s < peakAt ? 0.5 * s / peakAt : 0.5 + 0.5 * (s - peakAt) / (1 - peakAt))) ** 0.75;
  for (let c = 0; c < copies.n; c++) {
    const side = c - (copies.n - 1) / 2, trim = Math.abs(side) * 0.1, a0 = Math.max(s0, trim), a1 = Math.min(s1, 1 - trim * 0.5);
    if (a1 - a0 < 0.01) continue;
    for (let i = 0; i < n; i++) {
      const a = a0 + (a1 - a0) * i / n, b = a0 + (a1 - a0) * (i + 1) / n, m = (a + b) / 2;
      const [ax, ay] = line.at(a), [bx, by] = line.at(b), [ox, oy] = line.out(m), shift = side * copies.gap * S;
      const cx = (ax + bx) / 2 + ox * shift, cy = (ay + by) / 2 + oy * shift;
      const len = Math.hypot(bx - ax, by - ay) * 2.1, angle = Math.atan2(by - ay, bx - ax);
      const w = e.width * S * profile(m) * thin * (1 - 0.25 * Math.abs(side));
      if (e.thin) {
        out("streak", cx, cy, len * 1.05, w * 2.4, angle, tint, peak * 0.42);
        out("streak", cx, cy, len, w * 0.5, angle, core, peak);
        continue;
      }
      out("streak", cx, cy, len * 1.08, w * 2.6, angle, tint, peak * 0.32);
      out("streak", cx, cy, len, w, angle, tint, peak);
      out("streak", cx, cy, len * 0.96, w * 0.28, angle, core, peak * 0.8);
      if (rim) out("streak", cx + ox * w * 0.5, cy + oy * w * 0.5, len, Math.max(1.2, w * 0.24), angle, rim, peak);
    }
  }
}

/**
 * A light cue (the move-FX cue whose `effect` is a light recipe — `FighterMoveFxCue`): on `clip`'s `cells`, once as the cell turns (`enter`),
 * while they are drawn (`hold`, at most `maxMs`) or every `everyMs` (`trail`); at `at` (or `cellAt` for the drawn cell) body heights from his
 * feet, its arcs along `path`.
 */
export interface FighterMoveLightCue {
  readonly clip: string;
  readonly cells: readonly string[];
  readonly on?: "enter" | "hold" | "trail";
  readonly everyMs?: number;
  readonly at: V2;
  readonly cellAt?: Readonly<Record<string, V2>>;
  readonly path?: readonly V2[];
  readonly layer?: FighterMoveLightLayer;
  readonly scale?: number;
  readonly alpha?: number;
  readonly maxMs?: number;
}

/** This frame's drawn body for the runner: the cell (null: none of his clips'), whether it just turned, his feet, facing and size. */
export interface FighterMoveLightFrame {
  readonly drawn: { readonly clip: string; readonly cell: string } | null;
  readonly entered: boolean;
  readonly x: number;
  readonly y: number;
  readonly flipX: boolean;
  readonly bodyPx: number;
  readonly fightDtMs: number;
  readonly reducedMotion: boolean;
}

interface LiveLight {
  readonly recipe: FighterMoveLightRecipe;
  readonly place: FighterMoveLightPlace;
  readonly ms: number;
  ageMs: number;
  frames: number;
}

/** At most this many one-shot and trail lights at once (the oldest goes). */
const MAX_LIVE = 14;

/** Runs a fighter's light cues on his drawn cells (`FighterMoveFxView`'s light half; the review sheets run it in node). */
export class FighterMoveLightRunner {
  private readonly live: LiveLight[] = [];
  private readonly trailMs = new Map<number, number>();
  private readonly holdMs = new Map<number, number>();
  private serial = 0;

  constructor(private readonly cues: readonly { readonly cue: FighterMoveLightCue; readonly recipe: FighterMoveLightRecipe }[]) {}

  get size(): number { return this.cues.length; }

  /** Start what the drawn cell starts, age everything live, and draw it all to `sink`. */
  step(input: FighterMoveLightFrame, sink: FighterMoveLightSink): void {
    const dt = Math.max(0, input.fightDtMs), forward: 1 | -1 = input.flipX ? -1 : 1;
    for (const fx of this.live) { fx.ageMs += dt; fx.frames++; }
    for (let i = this.live.length - 1; i >= 0; i--) {
      const fx = this.live[i]!;
      if (fx.ageMs >= (input.reducedMotion ? Math.min(fx.ms, FIGHTER_MOVE_LIGHT_STILL_MS) : fx.ms)) this.live.splice(i, 1);
    }
    this.cues.forEach(({ cue, recipe }, i) => {
      const drawn = input.drawn, mode = cue.on ?? "enter";
      if (drawn === null || drawn.clip !== cue.clip || !cue.cells.includes(drawn.cell)) { this.trailMs.delete(i); this.holdMs.delete(i); return; }
      const cell = drawn.cell;
      const place = (): FighterMoveLightPlace => {
        const at = cue.cellAt?.[cell] ?? cue.at;
        return { feetX: input.x, feetY: input.y, anchorX: input.x + forward * at[0] * input.bodyPx, anchorY: input.y - at[1] * input.bodyPx,
          forward, bodyPx: input.bodyPx, path: cue.path ?? null, layer: cue.layer ?? "front", scale: cue.scale ?? 1, alpha: cue.alpha ?? 1,
          seed: i * 31 + (mode === "trail" ? this.serial % 7 : 0) };
      };
      if (mode === "enter") {
        if (input.entered) this.push({ recipe, place: place(), ms: fighterMoveLightMs(recipe), ageMs: 0, frames: 0 });
      } else if (mode === "trail") {
        if (input.reducedMotion) return;
        const since = this.trailMs.get(i);
        if (since === undefined || since + dt >= (cue.everyMs ?? 80)) {
          this.push({ recipe, place: place(), ms: fighterMoveLightMs(recipe), ageMs: 0, frames: 0 });
          this.trailMs.set(i, 0);
        } else this.trailMs.set(i, since + dt);
      } else {
        // Held: on him (his feet now), its age the time its cells have been drawn; none under reduced motion.
        const ms = (this.holdMs.get(i) ?? -dt) + dt;
        this.holdMs.set(i, ms);
        if (input.reducedMotion || ms >= (cue.maxMs ?? Infinity)) return;
        fighterMoveLightDraws(recipe, place(), ms, Math.round(ms / 16), false, sink);
      }
    });
    for (const fx of this.live) fighterMoveLightDraws(fx.recipe, fx.place, fx.ageMs, fx.frames, input.reducedMotion, sink);
  }

  /** Nothing of his shows; his cues start over. */
  reset(): void {
    this.live.length = 0;
    this.trailMs.clear(); this.holdMs.clear();
  }

  private push(fx: LiveLight): void {
    this.serial++;
    this.live.push(fx);
    while (this.live.length > MAX_LIVE) this.live.shift();
  }
}
