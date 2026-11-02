import { t } from "../../../app/i18n";
import { easeInCubic, easeOutBack, easeOutCubic } from "../../art/easing";
import { AWAKENING_COLORS, PALETTE } from "../../art/palette";
import type { CityFightAwakeningCanvas, CityFightAwakeningMotif, CityFightAwakeningShot } from "../CityFightAwakeningMotifView";
import { jitter, markOf, marksOf, over } from "./AwakeningDraw";


const C = AWAKENING_COLORS.fanfare;
const CONFETTI = [C.gold, C.red, C.green, PALETTE.white] as const;

export const FANFARE = Object.freeze({
  /** The name line: at `y` of the view, `size` view heights, stamped from `fromScale` over `stampMs` at `atMs` after the contact, held `holdMs`. */
  line: { y: 0.27, size: 0.075, fromScale: 1.8, stampMs: 110, atMs: 60, holdMs: 1150, outMs: 200 },
  /** The trumpets' light: two cones from the top corners. */
  spots: { alpha: 0.3, widthBodies: 2.2 },
  /** An invisible blow: rings rippling, his ghost at `ghostBodies` off him. */
  unseen: { ringMs: 260, ghostMs: 200, ghostBodies: 0.55 },
  /** The confetti: `count` pieces over `lifeMs`. */
  confetti: { count: 46, lifeMs: 1200, spreadBodies: 2.4 },
  holdMs: 900,
});

const F = FANFARE;

function draw(shot: CityFightAwakeningShot, c: CityFightAwakeningCanvas): void {
  const contact = shot.contact, fade = shot.fade, side = shot.side, v = shot.view;
  if (!contact || contact.blocked) return;
  const h = contact.at.h, ground = contact.at.y, on = over(contact.ageMs, 200) * fade, vh = v.height / shot.perPx;
  // The trumpets' light.
  for (const corner of [-1, 1]) {
    const ox = corner < 0 ? v.x + v.width * 0.05 : v.right - v.width * 0.05, angle = Math.PI / 2 - corner * 0.55 + 0.08 * Math.sin(shot.ms * 0.003 + corner);
    c.backLight.cone(ox, v.y, angle, v.height * 1.2, h * F.spots.widthBodies, C.gold, F.spots.alpha * on);
  }
  // "AND HIS NAME IS—!"
  const L = F.line, k = over(contact.ageMs - L.atMs, L.stampMs), out = over(contact.ageMs - L.atMs - L.holdMs, L.outMs);
  if (contact.ageMs >= L.atMs) c.word(0, v.centerX, v.y + v.height * L.y, vh * L.size, { scale: L.fromScale + (1 - L.fromScale) * easeOutBack(k),
    alpha: easeOutCubic(k) * (1 - out) * fade, color: C.gold, stroke: C.ink });
  // The blows nobody sees: the air rippling round him, a glimpse of the man.
  for (const mark of marksOf(shot, "hold")) {
    const U = F.unseen, k2 = over(mark.ageMs, U.ringMs), g = over(mark.ageMs, U.ghostMs);
    const a = jitter(mark.nth, 100) * Math.PI * 2, x = mark.at.x + Math.cos(a) * h * 0.25, y = mark.at.y - h * (0.4 + 0.4 * jitter(mark.nth, 101));
    for (let i = 0; i < 2; i++) c.light.ring(x, y, h * (0.12 + 0.55 * easeOutCubic(Math.max(0, k2 - i * 0.2))), PALETTE.white, 0.5 * (1 - k2) * fade, 1);
    if (g < 1) c.figure("caster", "combo", 150 + mark.nth * 120, false, mark.at.x - side * h * F.unseen.ghostBodies * (mark.nth % 2 === 0 ? 1 : -1), ground,
      0.32 * (1 - easeInCubic(g)) * fade, { tint: C.gold, add: true, layer: "front", flip: mark.nth % 2 === 1 ? side > 0 : side < 0 });
    c.cue(`unseen${mark.nth}`, "shake", 5);
  }
  // The lift: a golden column off him.
  const launch = markOf(shot, "launch");
  if (launch) {
    const k3 = over(launch.ageMs, 420);
    c.light.ray(launch.at.x, launch.at.y, -Math.PI / 2, h * 2.4, h * 0.3, C.gold, (1 - easeInCubic(k3)) * fade);
  }
  // The slam: the ring shakes, dust and a gold ring along the floor.
  const spike = markOf(shot, "spike");
  if (spike) {
    const k4 = over(spike.ageMs, 480);
    c.light.ring(spike.at.x, ground, h * (0.3 + 2 * easeOutCubic(k4)), C.gold, (1 - k4) * fade, 0.25);
    c.light.flare(spike.at.x, ground - h * 0.25, h * 2 * (1 - k4), PALETTE.white, (1 - k4) * fade);
    c.cue("slam", "shake", 13);
  }
  // The elbow drop on him lying there: a flare, and the confetti bursting out of it.
  const down = markOf(shot, "down");
  if (down) {
    const K = F.confetti, x = down.at.x, y = ground - h * 0.2;
    c.light.flare(x, y, h * 1.8 * Math.exp(-down.ageMs / 150), C.gold, fade);
    for (let i = 0; i < K.count; i++) {
      const life = over(down.ageMs - jitter(i, 110) * 120, K.lifeMs);
      if (life <= 0 || life >= 1) continue;
      const a = -Math.PI / 2 + (jitter(i, 111) - 0.5) * 2.4, speed = h * K.spreadBodies * (0.6 + 0.6 * jitter(i, 112));
      const px = x + Math.cos(a) * speed * easeOutCubic(Math.min(1, life * 2.5)) + Math.sin(life * 9 + i) * h * 0.06;
      const py = y + Math.sin(a) * speed * easeOutCubic(Math.min(1, life * 2.5)) + h * 1.6 * life * life;
      const w = h * 0.06, turn = Math.abs(Math.cos(life * 14 + i));
      c.paint.fillStyle(CONFETTI[i % CONFETTI.length]!, (1 - easeInCubic(life)) * fade).fillRect(px - w / 2, py - w * 0.3 * turn, w, w * 0.6 * turn + 0.5);
    }
    c.cue("elbow", "punch", 1.02);
  }
}

export const FANFARE_MOTIF: CityFightAwakeningMotif = Object.freeze<CityFightAwakeningMotif>({
  sky: C.sky,
  color: C.gold,
  holdMs: F.holdMs,
  skyInMs: 280,
  words: locale => [t(locale, "fight.superStage.fanfare")],
  draw,
  // He salutes and waves (his call) through the blows nobody sees, then lifts and slams (his slam).
  casterClip: shot => {
    const launch = markOf(shot, "launch"), down = markOf(shot, "down");
    if (launch && !down) return { clip: "slam", ms: launch.ageMs, loop: false };
    return shot.contact && !shot.contact.blocked && shot.marks.length > 0 && !launch ? { clip: "call", ms: shot.contact.ageMs, loop: true } : null;
  },
});
