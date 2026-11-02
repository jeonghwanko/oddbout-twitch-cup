import type Phaser from "phaser";
import { easeInCubic, easeOutBack, easeOutCubic } from "../../art/easing";
import { AWAKENING_COLORS, PALETTE } from "../../art/palette";
import type { CityFightAwakeningCanvas, CityFightAwakeningMotif, CityFightAwakeningShot } from "../CityFightAwakeningMotifView";
import { curve, jitter, markOf, marksOf, over } from "./AwakeningDraw";


const C = AWAKENING_COLORS.cageMatch;

export const CAGE_MATCH = Object.freeze({
  /** The cage: `posts` padded posts `widthViews` apart with chain-link between, dropped in over `dropMs` from the super's start. */
  cage: { posts: 5, widthViews: 0.86, topViews: 0.22, dropMs: 260, rattleMs: 160 },
  /** The floor grid: `rows` × `cols` lines `depthBodies` deep under the feet. */
  grid: { rows: 4, cols: 16, depthBodies: 0.3 },
  /**
   * The thumb: a plain thumbs-up in light (no service's icon — plan 8 rights), `heightBodies` tall, risen `riseBodies` over `riseMs`, gone
   * over `lifeMs`; its top never above `topViews` of the view (2026-10-23: a 1.7-body box over him read as a jar and covered the round clock).
   */
  thumb: { heightBodies: 1.05, riseBodies: 0.55, riseMs: 200, lifeMs: 760, topViews: 0.2 },
  holdMs: 820,
});

const G = CAGE_MATCH;

/** A chain-link mesh in the rectangle (x0, y0)–(x1, y1): diagonal wires both ways `spacing` apart. */
function mesh(g: Phaser.GameObjects.Graphics, x0: number, y0: number, x1: number, y1: number, spacing: number, colour: number, alpha: number,
  width: number): void {
  if (!(alpha > 0.01) || x1 <= x0 || y1 <= y0) return;
  g.lineStyle(width, colour, alpha);
  const h = y1 - y0;
  for (let d = x0 - h; d < x1; d += spacing) {
    // "\" wires from (d, y0) down-right, "/" wires from (d + h, y0) down-left, each clipped to the rectangle.
    const ax = Math.max(x0, d), ay = y0 + (ax - d), bx = Math.min(x1, d + h), by = y0 + (bx - d);
    if (bx > ax) g.lineBetween(ax, ay, bx, by);
    const cx = Math.min(x1, d + h), cy = y0 + (d + h - cx), ex = Math.max(x0, d), ey = y0 + (d + h - ex);
    if (cx > ex) g.lineBetween(cx, cy, ex, ey);
  }
}

/** A capsule from (ax, ay) to (bx, by), `width` wide: its outline as points (round ends). */
function capsule(ax: number, ay: number, bx: number, by: number, width: number): Phaser.Types.Math.Vector2Like[] {
  const angle = Math.atan2(by - ay, bx - ax), r = width / 2, out: Phaser.Types.Math.Vector2Like[] = [];
  for (let i = 0; i <= 8; i++) {
    const a = angle + Math.PI / 2 + Math.PI * i / 8;
    out.push({ x: ax + Math.cos(a) * r, y: ay + Math.sin(a) * r });
  }
  for (let i = 0; i <= 8; i++) {
    const a = angle - Math.PI / 2 + Math.PI * i / 8;
    out.push({ x: bx + Math.cos(a) * r, y: by + Math.sin(a) * r });
  }
  return out;
}

/**
 * A plain thumbs-up in light, `size` tall, its base at (x, y): the fist, its four folded fingers rolled on its front and the thumb standing up
 * off its top — each filled, each ringed white (the old fist-box with a capsule read as a jar).
 */
function thumb(g: Phaser.GameObjects.Graphics, x: number, y: number, size: number, colour: number, alpha: number, perPx: number): void {
  if (!(alpha > 0.01) || !(size > 1)) return;
  const S = size, fill = 0.72 * alpha, ring = 4 * perPx;
  const fist = { x: x - 0.34 * S, y: y - 0.56 * S, w: 0.5 * S, h: 0.56 * S };
  const finger = (i: number) => ({ x: x - 0.04 * S, y: y - 0.56 * S + i * 0.14 * S, w: 0.4 * S, h: 0.125 * S });
  const up = capsule(x - 0.22 * S, y - 0.5 * S, x - 0.12 * S, y - 0.94 * S, 0.21 * S);
  g.fillStyle(colour, fill).fillPoints(up, true).fillRoundedRect(fist.x, fist.y, fist.w, fist.h, 0.14 * S);
  for (let i = 0; i < 4; i++) { const f = finger(i); g.fillRoundedRect(f.x, f.y, f.w, f.h, f.h / 2); }
  g.lineStyle(ring, PALETTE.white, alpha).strokePoints(up, true).strokeRoundedRect(fist.x, fist.y, fist.w, fist.h, 0.14 * S);
  for (let i = 0; i < 4; i++) { const f = finger(i); g.strokeRoundedRect(f.x, f.y, f.w, f.h, f.h / 2); }
}

function draw(shot: CityFightAwakeningShot, c: CityFightAwakeningCanvas): void {
  const fade = shot.fade, side = shot.side, v = shot.view, caster = shot.caster, target = shot.target, contact = shot.contact;
  const h = caster.h, ground = contact?.at.y ?? caster.y, mid = (caster.x + (contact?.at.x ?? target.x)) / 2;
  // The cage, dropped in from the super's start, rattled by each blow.
  const K = G.cage, drop = easeOutBack(over(shot.ms, K.dropMs)), top = v.y + v.height * K.topViews, width = v.width * K.widthViews;
  const holds = marksOf(shot, "hold"), last = holds[holds.length - 1], rattle = last ? Math.exp(-last.ageMs / K.rattleMs) * Math.sin(last.ageMs * 0.09) : 0;
  const lift = (1 - drop) * (ground - v.y + h);
  // The floor grid inside it.
  if (contact && !contact.blocked) {
    const R = G.grid, depth = h * R.depthBodies, on = over(contact.ageMs, 200) * fade;
    for (let i = 0; i <= R.rows; i++) c.front.lineStyle(1.4 * shot.perPx, C.grid, 0.5 * on).lineBetween(mid - width / 2, ground - depth * 0.3 + i * depth / R.rows,
      mid + width / 2, ground - depth * 0.3 + i * depth / R.rows);
    for (let i = 0; i <= R.cols; i++) {
      const x = mid - width / 2 + i * width / R.cols;
      c.front.lineStyle(1.2 * shot.perPx, C.grid, 0.4 * on).lineBetween(x, ground - depth * 0.3, mid + (x - mid) * 1.15, ground + depth * 0.7);
    }
  }
  // The octagon's fence: chain-link mesh between padded posts, a padded top rail — the back half behind them, the posts in front.
  const left = mid - width / 2, right = mid + width / 2, bottom = ground + h * 0.05, rail = 9 * shot.perPx;
  const rattleX = rattle * h * 0.02, top0 = top - lift;
  mesh(c.under, left + rattleX, top0 + rail, right + rattleX, bottom, h * 0.11, C.mesh, 0.5 * fade, 1.3 * shot.perPx);
  for (let i = 0; i < K.posts; i++) {
    const x = left + (right - left) * i / (K.posts - 1) + rattleX, w = 11 * shot.perPx, g = i === 0 || i === K.posts - 1 ? c.paint : c.under;
    g.fillStyle(C.steel, fade).fillRoundedRect(x - w / 2, top0, w, bottom - top0, w * 0.3);
    g.fillStyle(C.steelLight, 0.6 * fade).fillRect(x - w * 0.3, top0 + rail, w * 0.18, bottom - top0 - rail * 2);
  }
  c.under.fillStyle(C.pad, fade).fillRoundedRect(left - 8 * shot.perPx + rattleX, top0 - rail * 0.5, width + 16 * shot.perPx, rail * 1.6, rail * 0.6);
  c.under.fillStyle(C.steelLight, 0.5 * fade).fillRect(left + rattleX, top0 - rail * 0.3, width, rail * 0.25);
  c.bodies("both");
  if (!contact || contact.blocked) return;
  // The jab, the cross, the tackle: a cyan spark each.
  for (const mark of holds) {
    const k = over(mark.ageMs, 160);
    if (k < 1) c.light.flare(mark.at.x - side * h * 0.1, mark.at.y - h * (0.6 - 0.15 * mark.nth), h * 0.6 * (1 - k), C.laser, (1 - k) * fade, mark.nth);
    c.cue(`rattle${mark.nth}`, "shake", 5);
  }
  // The thumb's uppercut: a great thumb of light rising out of him.
  const launch = markOf(shot, "launch");
  if (launch) {
    const T = G.thumb, rise = easeOutBack(over(launch.ageMs, T.riseMs)), out = over(launch.ageMs - T.riseMs, T.lifeMs - T.riseMs);
    const size = h * T.heightBodies * rise, top = v.y + v.height * T.topViews;
    const base = Math.max(top + size, launch.at.y - h * 0.15 - h * T.riseBodies * rise);
    // Behind the struck, on his far side: the bodies stay in front of it (it covered the caster's chest beside them).
    if (out < 1) thumb(c.under, launch.at.x + side * h * 0.55, base, size, C.laser, (1 - easeInCubic(out)) * fade, shot.perPx);
    c.light.ray(launch.at.x, launch.at.y, -Math.PI / 2, h * 2.4, h * 0.25, C.laser, (1 - out) * fade);
  }
  // The eye lasers: two beams from his glasses into him up there.
  for (const mark of marksOf(shot, "air")) {
    const k = over(mark.ageMs, 160);
    if (k >= 1) continue;
    const ex = caster.x + side * h * 0.08, ey = caster.y - h * 0.86, tx = mark.at.x, ty = mark.at.y - h * 0.5;
    const angle = Math.atan2(ty - ey, tx - ex), length = Math.hypot(tx - ex, ty - ey);
    for (const off of [-1, 1]) {
      const ox = -Math.sin(angle) * off * h * 0.025, oy = Math.cos(angle) * off * h * 0.025;
      c.light.ray(ex + ox, ey + oy, angle, length * 1.05, h * 0.035, C.laser, (1 - k) * fade, PALETTE.white);
    }
    c.light.flare(tx, ty, h * 0.6 * (1 - k), C.laser, (1 - k) * fade, k);
  }
  // The suplex: an arc of light over and down onto the mat, a ring.
  const spike = markOf(shot, "spike");
  if (spike) {
    const k = over(spike.ageMs, 420), arc = curve(caster.x - side * h * 0.2, caster.y - h * 1.2, caster.x - side * h * 1.0, caster.y - h * 2.0,
      spike.at.x, spike.at.y - h * 0.2, 1, 18);
    c.front.lineStyle(h * 0.05, C.laser, 0.6 * (1 - k) * fade).strokePoints(arc, false);
    c.light.ring(spike.at.x, spike.at.y, h * (0.3 + 1.5 * easeOutCubic(k)), C.laser, (1 - k) * fade, 0.25);
    c.cue("suplex", "shake", 12);
  }
  // The ground and pound: three quick sparks on him lying there.
  const down = markOf(shot, "down");
  if (down) {
    for (let i = 0; i < 3; i++) {
      const k = over(down.ageMs - i * 90, 160);
      if (k > 0 && k < 1) c.light.flare(down.at.x + (jitter(i, 90) - 0.5) * h * 0.4, down.at.y - h * 0.18, h * 0.7 * (1 - k), PALETTE.white, (1 - k) * fade, i);
    }
    c.cue("pound", "shake", 7);
  }
}

export const CAGE_MATCH_MOTIF: CityFightAwakeningMotif = Object.freeze<CityFightAwakeningMotif>({
  sky: C.sky,
  color: C.laser,
  holdMs: G.holdMs,
  skyInMs: 280,
  draw,
  // His lasers (his laser clip) up there, his suplex (his body lock and throw) for the spike.
  casterClip: shot => {
    const launch = markOf(shot, "launch"), spike = markOf(shot, "spike");
    if (spike && !markOf(shot, "down")) return { clip: "ballGrab", ms: spike.ageMs + 350, loop: false };
    if (launch && !spike) return { clip: "laser", ms: launch.ageMs, loop: true };
    return shot.contact && !shot.contact.blocked && shot.marks.length > 0 ? { clip: "combo", ms: shot.contact.ageMs, loop: true } : null;
  },
});
