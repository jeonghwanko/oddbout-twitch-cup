import type Phaser from "phaser";
import { easeInCubic, easeOutCubic } from "../../art/easing";
import { AWAKENING_COLORS, PALETTE } from "../../art/palette";
import type { CityFightAwakeningCanvas, CityFightAwakeningMotif, CityFightAwakeningShot } from "../CityFightAwakeningMotifView";
import { bell, curve, jitter, markOf, marksOf, over, ribbon } from "./AwakeningDraw";


const C = AWAKENING_COLORS.dreamBeach;

export const DREAM_BEACH = Object.freeze({
  /** The sun: `radiusBodies`, its middle `horizonBodies` over the feet line behind them, `stripes` bands cut out of its lower half. */
  sun: { radiusBodies: 0.95, horizonBodies: 0.3, stripes: 5 },
  /** The dream's haze at the view's edges and its glints. */
  haze: { alpha: 0.3, glints: 22 },
  /** The car: `lengthBodies` long, across the view in `passMs`. */
  car: { lengthBodies: 1.2, heightBodies: 0.42, passMs: 260 },
  /** The tape: at `heightBodies` over the feet, snapping over `snapMs`. */
  tape: { heightBodies: 0.62, snapMs: 520, spanBodies: 1.6 },
  holdMs: 780,
});

const D = DREAM_BEACH;


function sun(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, alpha: number): void {
  const steps = 72;
  for (let i = 0; i < steps; i++) {
    const t0 = i / steps, y0 = y - r + 2 * r * t0, y1 = y0 + 2 * r / steps;
    // The lower half is striped: every other band, thicker gaps toward the bottom.
    if (t0 > 0.5 && Math.floor((t0 - 0.5) * 2 * D.sun.stripes * 2) % 2 === 1) continue;
    const half = Math.sqrt(Math.max(0, r * r - (y0 + (y1 - y0) / 2 - y) ** 2));
    g.fillStyle(t0 < 0.5 ? C.sunTop : C.sunLow, alpha).fillRect(x - half, y0, half * 2, y1 - y0 + 0.5);
  }
}

function draw(shot: CityFightAwakeningShot, c: CityFightAwakeningCanvas): void {
  const contact = shot.contact, fade = shot.fade, side = shot.side, v = shot.view, caster = shot.caster;
  if (!contact || contact.blocked) return;
  const h = contact.at.h, ground = contact.at.y, mid = (caster.x + contact.at.x) / 2, on = over(contact.ageMs, 280) * fade;
  // The dream: the striped sun on the horizon behind them, the sea's glints, the haze.
  sun(c.under, mid, ground - h * D.sun.horizonBodies, h * D.sun.radiusBodies, 0.92 * on);
  c.under.fillStyle(C.sea, 0.55 * on).fillRect(v.x - 4, ground - h * D.sun.horizonBodies * 0.9, v.width + 8, h * 0.4);
  for (let i = 0; i < 8; i++) {
    const y = ground - h * D.sun.horizonBodies * 0.85 + i * h * 0.05, w = h * (1.6 - i * 0.12) * (0.8 + 0.2 * Math.sin(shot.ms * 0.002 + i));
    c.light.streak(mid + Math.sin(i * 1.7 + shot.ms * 0.001) * h * 0.2, y, 0, w, h * 0.02, C.sunTop, 0.5 * on);
  }
  c.bodies("both");
  // The dream's soft top: a warm haze along the view's top edge.
  for (let i = 0; i < 5; i++) c.light.glow(v.x + v.width * (0.1 + 0.2 * i), v.y, v.width * 0.36, C.haze, D.haze.alpha * 0.8 * on, 0.5);
  for (let i = 0; i < D.haze.glints; i++) {
    const drift = (contact.ageMs / 4000 + jitter(i, 70)) % 1, x = v.x + v.width * jitter(i, 71), y = v.y + v.height * (0.9 - 0.8 * drift);
    c.light.flare(x, y, h * 0.12, C.sunTop, 0.7 * bell(drift) * on, drift * 3);
  }
  // The slow-motion flails: a golden star and sand at his feet each.
  for (const mark of marksOf(shot, "hold")) {
    const k = over(mark.ageMs, 420);
    if (k >= 1) continue;
    c.light.flare(mark.at.x + side * h * 0.1, mark.at.y - h * (0.6 + 0.1 * mark.nth), h * 0.8 * (1 - k), C.sunTop, (1 - k) * fade, k * 2 + mark.nth);
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI * (0.15 + 0.7 * jitter(i, mark.nth + 80)), d = h * 0.7 * easeOutCubic(k);
      c.paint.fillStyle(C.sand, (1 - k) * fade).fillCircle(mark.at.x + Math.cos(a) * d, ground + Math.sin(a) * d * 0.5 + h * 0.3 * k * k, h * 0.025);
    }
  }
  // The car: a lime streak with two headlights tearing across through him.
  const launch = markOf(shot, "launch");
  if (launch) {
    const A = D.car, k = over(launch.ageMs + A.passMs * 0.5, A.passMs), x0 = side > 0 ? v.x - h : v.right + h, x1 = side > 0 ? v.right + h : v.x - h;
    if (k < 1) {
      const x = x0 + (x1 - x0) * k, len = h * A.lengthBodies, ch = h * A.heightBodies, cx = x - side * len / 2, base = ground - ch * 0.18;
      // A little lime car: its body, its roof and windows, two wheels, its headlight — tearing past on a streak.
      c.light.streak(cx - side * len * 1.2, base - ch * 0.4, 0, len * 2.6, ch * 0.5, C.car, 0.5 * fade);
      c.paint.fillStyle(C.car, fade).fillRoundedRect(cx - len / 2, base - ch * 0.62, len, ch * 0.5, ch * 0.16);
      c.paint.fillStyle(C.car, fade).fillRoundedRect(cx - len * 0.3, base - ch, len * 0.55, ch * 0.45, ch * 0.14);
      c.paint.fillStyle(C.carGlass, fade).fillRoundedRect(cx - len * 0.24, base - ch * 0.92, len * 0.2, ch * 0.3, ch * 0.06)
        .fillRoundedRect(cx + len * 0.0, base - ch * 0.92, len * 0.2, ch * 0.3, ch * 0.06);
      for (const u of [-0.3, 0.3]) {
        c.paint.fillStyle(C.carShade, fade).fillCircle(cx + u * len, base - ch * 0.12, ch * 0.2);
        c.paint.fillStyle(C.carGlass, fade).fillCircle(cx + u * len, base - ch * 0.12, ch * 0.08);
      }
      c.light.flare(cx + side * len * 0.5, base - ch * 0.42, h * 0.45, PALETTE.white, fade);
    }
    c.cue("car", "shake", 8);
  }
  // The trip: a quick streak down, a puff of sand.
  const spike = markOf(shot, "spike");
  if (spike) {
    const k = over(spike.ageMs, 400);
    c.light.ring(spike.at.x, ground, h * (0.3 + 1.1 * easeOutCubic(k)), C.sand, (1 - k) * fade, 0.25);
  }
  // The finish tape snapping before him lying there, the dream breaking in a cream flash.
  const finish = markOf(shot, "down");
  if (finish) {
    const T = D.tape, k = over(finish.ageMs, T.snapMs), y = ground - h * T.heightBodies, x = finish.at.x - side * h * 0.2, span = h * T.spanBodies;
    for (const dir of [-1, 1]) {
      const end = x + dir * span, flutter = h * 0.4 * easeOutCubic(k);
      const points = curve(x + dir * h * 0.05 * k, y + flutter * 0.5, x + dir * span * 0.5, y - h * 0.15 + flutter, end, y + flutter * 1.6 * (0.6 + 0.4 * Math.sin(finish.ageMs * 0.02)), 1, 14);
      ribbon(c.paint, points, () => h * 0.05, PALETTE.white, (1 - easeInCubic(k)) * fade);
    }
    const flash = Math.exp(-finish.ageMs / 160);
    c.front.fillStyle(C.haze, 0.8 * flash * fade).fillRect(v.x - 4, v.y - 4, v.width + 8, v.height + 8);
    c.cue("tape", "punch", 1.02);
  }
}

export const DREAM_BEACH_MOTIF: CityFightAwakeningMotif = Object.freeze<CityFightAwakeningMotif>({
  sky: C.sky,
  color: C.sunTop,
  holdMs: D.holdMs,
  skyInMs: 300,
  skyAlpha: shot => (shot.contact && !shot.contact.blocked ? over(shot.contact.ageMs, 280) : 0),
  draw,
  // He runs in slow motion (his dash, slowed) through the flails, then calls the car (his summon).
  casterClip: shot => {
    const launch = markOf(shot, "launch");
    if (launch && !markOf(shot, "spike")) return { clip: "summon", ms: launch.ageMs, loop: false };
    return shot.contact && !shot.contact.blocked && shot.marks.length > 0 && !launch ? { clip: "dash", ms: shot.contact.ageMs * 0.45, loop: true } : null;
  },
});
