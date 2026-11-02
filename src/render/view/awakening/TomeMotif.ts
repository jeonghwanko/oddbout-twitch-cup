import type Phaser from "phaser";
import { t } from "../../../app/i18n";
import { easeInCubic, easeOutBack, easeOutCubic } from "../../art/easing";
import { AWAKENING_COLORS, PALETTE } from "../../art/palette";
import type { CityFightAwakeningCanvas, CityFightAwakeningMotif, CityFightAwakeningShot } from "../CityFightAwakeningMotifView";
import { bell, bolt, curve, jitter, markOf, marksOf, over, starPoints } from "./AwakeningDraw";


const C = AWAKENING_COLORS.tome;

export const TOME = Object.freeze({
  /** The circle under him: `radiusBodies` across (lying `squash` on the ground), opened over `openMs`, turning `spinPerMs`. */
  circle: { radiusBodies: 0.95, squash: 0.28, openMs: 260, spinPerMs: 0.0012, ticks: 36 },
  /** The tome over her: `widthBodies` open, `upBodies` over her feet, opened over `openMs`. */
  book: { widthBodies: 0.52, upBodies: 1.42, openMs: 220 },
  /** A page's flight from the tome to him (`flyMs`), its cut held `cutMs`. */
  page: { flyMs: 110, cutMs: 220, sizeBodies: 0.2 },
  /** The giant tome falling `fallMs` (fight ms) before the spike, `widthBodies` wide. */
  slam: { fallMs: 240, widthBodies: 1.4 },
  /** The potion: thrown `flyMs` before it breaks on him lying (screen ms after the down beat), its splash `splashMs`. */
  potion: { splashMs: 600, drops: 18 },
  /** The stamp: `size` view heights, stamped `atMs` after the down beat from `fromScale` over `stampMs`. */
  stamp: { size: 0.1, atMs: 260, fromScale: 2.2, stampMs: 110, deg: -12 },
  holdMs: 900,
});

const M = TOME;

/** The magic circle round (x, y): rings, ticks, a turning hexagram, `k` open, `alpha`. */
function circle(c: CityFightAwakeningCanvas, x: number, y: number, r: number, spin: number, k: number, alpha: number, perPx: number): void {
  if (!(alpha > 0.01)) return;
  const sq = M.circle.squash, rr = r * easeOutBack(k), g = c.front;
  g.lineStyle(3 * perPx, C.glyph, 0.8 * alpha).strokeEllipse(x, y, rr * 2, rr * 2 * sq);
  g.lineStyle(1.6 * perPx, C.glyphLight, alpha).strokeEllipse(x, y, rr * 1.7, rr * 1.7 * sq);
  for (let i = 0; i < M.circle.ticks; i++) {
    const a = i / M.circle.ticks * Math.PI * 2 + spin, long = i % 3 === 0 ? 0.12 : 0.05;
    g.lineStyle(1.4 * perPx, C.glyphLight, alpha).lineBetween(x + Math.cos(a) * rr * 0.86, y + Math.sin(a) * rr * 0.86 * sq,
      x + Math.cos(a) * rr * (0.86 - long), y + Math.sin(a) * rr * (0.86 - long) * sq);
  }
  for (const turn of [0, Math.PI / 6]) {
    const star = starPoints(x, y, 3, rr * 0.72, rr * 0.72, -spin * 1.5 + turn, sq);
    g.lineStyle(1.8 * perPx, C.glyph, 0.9 * alpha).strokePoints([...star.filter((_, i) => i % 2 === 0), star[0]!], true);
  }
  c.light.glow(x, y, rr * 2.6, C.glyph, 0.35 * alpha, sq * 1.4);
}

/** The open tome `w` wide at (x, y), opened `open` (0 shut … 1 flat), tilted `tilt`, its runes lit `lit`: a dark cover, two cream pages dipping to the spine, rune lines. */
function book(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, open: number, tilt: number, lit: number, alpha: number, perPx: number): void {
  if (!(alpha > 0.01)) return;
  const half = w / 2, hh = w * 0.36, rise = (1 - open) * hh * 0.7, dip = hh * 0.12, c = Math.cos(tilt), s = Math.sin(tilt);
  const p = (u: number, v: number) => ({ x: x + u * c - v * s, y: y + u * s + v * c });
  g.fillStyle(C.cover, alpha).fillPoints([p(-half * 1.07, -hh * 1.08 + rise), p(0, -hh * 1.0 + dip), p(half * 1.07, -hh * 1.08 + rise),
    p(half * 1.07, hh * 1.12), p(0, hh * 1.2 + dip), p(-half * 1.07, hh * 1.12)], true);
  for (const side of [-1, 1]) {
    g.fillStyle(C.page, alpha).fillPoints([p(0, -hh + dip), p(side * half, -hh + rise), p(side * half, hh * 0.98), p(0, hh + dip)], true);
    g.fillStyle(C.pageShade, alpha).fillPoints([p(0, -hh + dip), p(side * half * 0.16, -hh + dip * 0.6 + rise * 0.16), p(side * half * 0.16, hh + dip * 0.7), p(0, hh + dip)], true);
    for (let line = 0; line < 6; line++) {
      const v = -hh * 0.62 + line * hh * 0.25, a = p(side * half * 0.24, v + dip * 0.4), b = p(side * half * (line % 3 === 2 ? 0.6 : 0.84), v + rise * 0.45);
      g.lineStyle(Math.max(1.4 * perPx, w * 0.028), C.glyph, alpha * (0.55 + 0.45 * lit)).lineBetween(a.x, a.y, b.x, b.y);
    }
  }
  g.lineStyle(Math.max(1.2 * perPx, w * 0.02), C.cover, alpha).lineBetween(p(0, -hh + dip).x, p(0, -hh + dip).y, p(0, hh + dip).x, p(0, hh + dip).y);
}

/** The shut tome falling flat, `w` wide at (x, y), turned `tilt`: its cover, a gilt border and star, the cream edge of its pages below. */
function shutBook(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, tilt: number, alpha: number, perPx: number): void {
  if (!(alpha > 0.01)) return;
  const hw = w / 2, hh = w * 0.36, c = Math.cos(tilt), s = Math.sin(tilt);
  const p = (u: number, v: number) => ({ x: x + u * c - v * s, y: y + u * s + v * c });
  const quad = (u0: number, v0: number, u1: number, v1: number) => [p(u0, v0), p(u1, v0), p(u1, v1), p(u0, v1)];
  g.fillStyle(C.page, alpha).fillPoints(quad(-hw * 0.97, hh * 0.78, hw * 0.97, hh * 1.04), true);
  g.fillStyle(C.cover, alpha).fillPoints(quad(-hw, -hh, hw, hh * 0.8), true);
  g.lineStyle(Math.max(1.5 * perPx, w * 0.018), C.glyph, 0.85 * alpha).strokePoints(quad(-hw * 0.86, -hh * 0.82, hw * 0.86, hh * 0.62), true);
  const centre = p(0, -hh * 0.1);
  g.fillStyle(C.glyph, 0.9 * alpha).fillPoints(starPoints(centre.x, centre.y, 6, w * 0.13, w * 0.06, tilt), true);
}

function draw(shot: CityFightAwakeningShot, c: CityFightAwakeningCanvas): void {
  const contact = shot.contact, fade = shot.fade, side = shot.side, caster = shot.caster;
  if (!contact || contact.blocked) return;
  const h = contact.at.h, follow = shot.follow, v = shot.view;
  // The circle opened under where he stood; it lights up at the pillar, fades after the slam.
  const spike = markOf(shot, "spike"), launch = markOf(shot, "launch");
  const circleAlpha = over(contact.ageMs, 120) * (1 - (spike ? over(spike.ageMs, 300) : 0)) * fade;
  circle(c, contact.at.x, contact.at.y, h * M.circle.radiusBodies, contact.ageMs * M.circle.spinPerMs, over(contact.ageMs, M.circle.openMs),
    circleAlpha * (launch ? 1 + 0.6 * Math.exp(-launch.ageMs / 200) : 1), shot.perPx);
  // The tome over her head, open, its runes glowing at each page it sends.
  const holds = marksOf(shot, "hold"), lastPage = holds[holds.length - 1];
  const bookAlpha = over(contact.ageMs, 150) * (1 - (spike ? over(spike.ageMs - 100, 250) : 0)) * fade;
  const bx = caster.x + side * h * 0.1, by = caster.y - h * M.book.upBodies + Math.sin(contact.ageMs * 0.004) * h * 0.04;
  book(c.paint, bx, by, h * M.book.widthBodies, easeOutBack(over(contact.ageMs, M.book.openMs)), side * -0.12,
    lastPage ? Math.exp(-lastPage.ageMs / 160) : 0, bookAlpha, shot.perPx);
  c.light.glow(bx, by, h * 1.3, C.glyph, 0.35 * bookAlpha);
  // The pages: torn out of the tome, flying at him and cutting.
  for (const mark of holds) {
    const P = M.page, k = over(mark.ageMs, P.flyMs), out = over(mark.ageMs - P.flyMs, P.cutMs);
    if (out >= 1) continue;
    const ty = mark.at.y - h * (0.45 + 0.15 * (mark.nth % 3)), arc = curve(bx, by, (bx + mark.at.x) / 2, by - h * 0.5, mark.at.x, ty, k, 12);
    const at = arc[arc.length - 1]!, size = h * P.sizeBodies, turn = mark.ageMs * 0.03 + mark.nth;
    if (k < 1) {
      const corners = [[-0.5, -0.65], [0.5, -0.65], [0.5, 0.65], [-0.5, 0.65]].map(([u, w]) => ({
        x: at.x + (u! * Math.cos(turn) - w! * Math.sin(turn) * 0.6) * size, y: at.y + (u! * Math.sin(turn) + w! * Math.cos(turn) * 0.6) * size }));
      c.paint.fillStyle(C.page, fade).fillPoints(corners, true);
      c.light.glow(at.x, at.y, size * 1.8, C.glyph, 0.5 * fade);
    } else {
      const a = (mark.nth % 2 === 0 ? -0.5 : 0.4) * side;
      c.light.streak(mark.at.x, ty, a, h * 1.1, h * 0.05, C.glyph, (1 - out) * fade, C.glyphLight);
      c.light.flare(mark.at.x, ty, h * 0.6 * (1 - out), C.glyphLight, (1 - out) * fade);
    }
  }
  // The pillar out of the circle at the launch.
  if (launch) {
    const k = over(launch.ageMs, 600);
    c.light.ray(launch.at.x, launch.at.y, -Math.PI / 2, h * 3.2, h * 0.5 * (1 - 0.4 * k), C.glyph, (1 - easeInCubic(k)) * fade, C.glyphLight);
    for (let i = 0; i < 4; i++) {
      const rise = (k + i * 0.25) % 1;
      c.light.ring(launch.at.x, launch.at.y - h * 2.6 * rise, h * 0.6 * (1 - 0.3 * rise), C.glyph, (1 - rise) * (1 - k) * fade, 0.28);
    }
    c.cue("pillar", "shake", 8);
  }
  // The wand's bolts at him up there.
  for (const mark of marksOf(shot, "air")) {
    const k = over(mark.ageMs, 140);
    if (k >= 1) continue;
    const wx = caster.x + side * h * 0.42, wy = caster.y - h * 0.72, points = bolt(wx, wy, mark.at.x, mark.at.y - h * 0.5, 9, h * 0.18, mark.nth * 7 + Math.floor(mark.ageMs / 45));
    c.front.lineStyle(h * 0.06, C.glyph, 0.6 * (1 - k) * fade).strokePoints(points, false);
    c.front.lineStyle(h * 0.02, PALETTE.white, (1 - k) * fade).strokePoints(points, false);
    c.light.flare(mark.at.x, mark.at.y - h * 0.5, h * 0.7 * (1 - k), C.glyphLight, (1 - k) * fade);
  }
  // The giant tome falling on him, shut, then its slam's ring and pages scattering.
  const slamAt = follow?.beats.find(beat => beat.kind === "spike")?.atMs ?? null, target = shot.target, w = h * M.slam.widthBodies;
  if (slamAt !== null && shot.progress !== null && !spike && shot.progress >= slamAt - M.slam.fallMs) {
    const k = easeInCubic(over(shot.progress - (slamAt - M.slam.fallMs), M.slam.fallMs)), y = v.y - w * 0.5 + (target.y - h * 0.3 - v.y + w * 0.5) * k;
    shutBook(c.paint, target.x, y, w, side * 0.25 * (1 - k), fade, shot.perPx);
    c.light.glow(target.x, y, w * 1.4, C.glyph, 0.4 * fade);
  }
  if (spike) {
    const k = over(spike.ageMs, 480);
    if (k < 0.5) shutBook(c.paint, spike.at.x, spike.at.y - h * 0.18, w, 0, (1 - k * 2) * fade, shot.perPx);
    c.light.ring(spike.at.x, spike.at.y, h * (0.3 + 1.8 * easeOutCubic(k)), C.glyph, (1 - k) * fade, 0.28);
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI * jitter(i, 30), d = h * 1.6 * easeOutCubic(k);
      c.paint.fillStyle(C.page, (1 - k) * fade).fillRect(spike.at.x + Math.cos(a) * d, spike.at.y - h * 0.2 + Math.sin(a) * d * 0.7, h * 0.1, h * 0.13);
    }
    c.cue("slam", "shake", 12);
  }
  // The potion: thrown from her hand, breaking on him lying in a green splash; then the red stamp.
  const down = markOf(shot, "down");
  if (down) {
    const k = over(down.ageMs, M.potion.splashMs), x = down.at.x, y = down.at.y - h * 0.15;
    c.light.flare(x, y, h * 1.4 * Math.exp(-down.ageMs / 140), C.potion, fade);
    for (let i = 0; i < M.potion.drops; i++) {
      const a = -Math.PI * (0.1 + 0.8 * jitter(i, 40)), d = h * (0.6 + 0.8 * jitter(i, 41)) * easeOutCubic(k), fall = h * 0.9 * k * k;
      c.paint.fillStyle(i % 3 === 0 ? C.potionLight : C.potion, (1 - k) * fade).fillCircle(x + Math.cos(a) * d, y + Math.sin(a) * d + fall, h * 0.035 * (1 - 0.5 * k));
    }
    for (let i = 0; i < 6; i++) c.light.glow(x + (jitter(i, 42) - 0.5) * h, y - h * 0.4 * k - h * 0.2 * jitter(i, 43), h * 0.6, C.potion, 0.3 * bell(k) * fade);
    const S = M.stamp, s = over(down.ageMs - S.atMs, S.stampMs), vh = v.height / shot.perPx;
    if (down.ageMs >= S.atMs) {
      const scale = S.fromScale + (1 - S.fromScale) * easeOutBack(s), r = vh * S.size * shot.perPx * 0.75 * scale, sx = x + side * h * 0.2, sy = y - h * 0.55;
      c.ink.lineStyle(r * 0.12, C.stamp, 0.9 * easeOutCubic(s) * fade).strokeCircle(sx, sy, r);
      c.word(0, sx, sy, vh * S.size, { color: C.stamp, stroke: C.page, scale, angle: S.deg, alpha: easeOutCubic(s) * fade });
      c.cue("stamp", "shake", 5);
    }
  }
}

/** Reduced motion: the circle and the tome, still. */
function drawReduced(shot: CityFightAwakeningShot, c: CityFightAwakeningCanvas): void {
  const contact = shot.contact;
  if (!contact || contact.blocked) return;
  circle(c, contact.at.x, contact.at.y, contact.at.h * M.circle.radiusBodies, 0, 1, shot.fade, shot.perPx);
}

export const TOME_MOTIF: CityFightAwakeningMotif = Object.freeze<CityFightAwakeningMotif>({
  sky: C.sky,
  color: C.potionLight,
  holdMs: M.holdMs,
  skyInMs: 320,
  words: locale => [t(locale, "fight.superStage.fail")],
  draw,
  drawReduced,
  // Her wand works the spell through the pages and bolts; the tome's slam is hers (her book swing), then she stands.
  casterClip: shot => {
    const spike = markOf(shot, "spike");
    if (spike && !markOf(shot, "down")) return { clip: "slam", ms: spike.ageMs + 300, loop: false };
    return shot.contact && !shot.contact.blocked && shot.marks.length > 0 && !spike ? { clip: "spell", ms: shot.contact.ageMs, loop: true } : null;
  },
});
